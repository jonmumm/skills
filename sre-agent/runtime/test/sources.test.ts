import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fetchCloudflareEvents } from "../src/sources/cloudflare.ts";
import { parseNdjson, runCommandSource } from "../src/sources/command.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

describe("fetchCloudflareEvents", () => {
  const window = { from: 1_000, to: 2_000 };

  it("queries each error level and failing outcome for the service, deduping by id", async () => {
    const bodies: Array<{ view: string; parameters: { filters: unknown[] } }> = [];
    const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init!.body)));
      return new Response(JSON.stringify(fixture("cloudflare-events.json")));
    };
    const { events } = await fetchCloudflareEvents({
      accountId: "acc",
      token: "tok",
      service: "my-worker",
      levels: ["error"],
      outcomes: ["exception"],
      ...window,
      fetch,
    });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ view: "events", timeframe: { from: 1_000, to: 2_000 }, limit: 2000 });
    expect(bodies[0]!.parameters.filters).toContainEqual({ key: "$metadata.service", operation: "eq", type: "string", value: "my-worker" });
    expect(bodies[1]!.parameters.filters).toContainEqual({ key: "$workers.outcome", operation: "eq", type: "string", value: "exception" });
    expect(events.map((e) => e.id)).toEqual(["ev-1", "ev-2"]);
    expect(events[0]).toEqual({
      id: "ev-1",
      timestamp: 1_500,
      level: "error",
      message: "TypeError: Cannot read properties of undefined (reading 'id')",
      service: "my-worker",
      outcome: "exception",
      versionId: "ver-a",
    });
  });

  it("falls back to the error field and ISO timestamps", async () => {
    const fetch = async () => new Response(JSON.stringify(fixture("cloudflare-events.json")));
    const { events } = await fetchCloudflareEvents({ accountId: "a", token: "t", service: "my-worker", levels: ["error"], outcomes: [], ...window, fetch });
    expect(events[1]).toMatchObject({ message: "Worker exceeded CPU time limit.", timestamp: Date.parse("1970-01-01T00:00:01.600Z"), level: "error" });
  });

  it("accepts the nested result.events.events shape", async () => {
    const flat = fixture("cloudflare-events.json");
    const nested = { ...flat, result: { events: { events: flat.result.events, count: 2 } } };
    const fetch = async () => new Response(JSON.stringify(nested));
    const { events } = await fetchCloudflareEvents({ accountId: "a", token: "t", service: "my-worker", levels: ["error"], outcomes: [], ...window, fetch });
    expect(events).toHaveLength(2);
  });

  it("flags truncation when a query hits the 2000-event limit", async () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({ $metadata: { id: `x${i}`, message: "m", level: "error", service: "s" }, timestamp: 1_500 }));
    const fetch = async () => new Response(JSON.stringify({ success: true, result: { events: many } }));
    const { truncated } = await fetchCloudflareEvents({ accountId: "a", token: "t", service: "s", levels: ["error"], outcomes: [], ...window, fetch });
    expect(truncated).toBe(true);
  });

  it("throws on an API error with Cloudflare's messages", async () => {
    const fetch = async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }), { status: 403 });
    await expect(
      fetchCloudflareEvents({ accountId: "a", token: "t", service: "s", levels: ["error"], outcomes: [], ...window, fetch }),
    ).rejects.toThrow(/403.*Authentication error/);
  });
});

describe("parseNdjson", () => {
  it("parses valid lines and counts invalid ones", () => {
    const out = parseNdjson(
      [
        JSON.stringify({ id: "1", timestamp: 1, level: "error", message: "m", service: "s" }),
        "not json",
        JSON.stringify({ id: 2 }),
        "",
      ].join("\n"),
    );
    expect(out.events).toHaveLength(1);
    expect(out.invalidLines).toBe(2);
  });
});

describe("fetchCloudflareEvents (request and edge cases)", () => {
  const window = { from: 1_000, to: 2_000 };
  const ok = (events: unknown[]) => new Response(JSON.stringify({ success: true, result: { events } }));
  const query = (fetch: (url: string, init?: RequestInit) => Promise<Response>) =>
    fetchCloudflareEvents({ accountId: "acc", token: "tok", service: "my-worker", levels: ["error"], outcomes: [], ...window, fetch });

  it("POSTs an authenticated telemetry query filtered to the service and level", async () => {
    const requests: Array<{ url: string; method: string | undefined; headers: Headers; body: unknown }> = [];
    await query(async (url, init) => {
      requests.push({ url, method: init?.method, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return ok([]);
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe("https://api.cloudflare.com/client/v4/accounts/acc/workers/observability/telemetry/query");
    expect(requests[0]!.method).toBe("POST");
    expect(Object.fromEntries(requests[0]!.headers)).toEqual({ authorization: "Bearer tok", "content-type": "application/json" });
    expect(requests[0]!.body).toEqual({
      queryId: "sre-agent",
      view: "events",
      limit: 2000,
      timeframe: { from: 1_000, to: 2_000 },
      parameters: {
        filterCombination: "and",
        filters: [
          { key: "$metadata.service", operation: "eq", type: "string", value: "my-worker" },
          { key: "$metadata.level", operation: "eq", type: "string", value: "error" },
        ],
      },
    });
  });

  it("does not flag truncation below the limit", async () => {
    const { truncated } = await query(async () => ok([{ $metadata: { id: "a", level: "error" }, timestamp: 1_500 }]));
    expect(truncated).toBe(false);
  });

  it("throws when the HTTP status fails even if the body claims success", async () => {
    await expect(query(async () => new Response(JSON.stringify({ success: true, result: { events: [] } }), { status: 500 }))).rejects.toThrow(
      "Cloudflare 500: query failed",
    );
  });

  it("throws when the body reports failure even on HTTP 200 with a result", async () => {
    const body = { success: false, errors: [{ message: "bad filter" }, { message: "bad view" }], result: { events: [] } };
    await expect(query(async () => new Response(JSON.stringify(body)))).rejects.toThrow("Cloudflare 200: bad filter; bad view");
  });

  it("throws when a successful response has no result", async () => {
    await expect(query(async () => new Response(JSON.stringify({ success: true })))).rejects.toThrow("Cloudflare 200: query failed");
  });

  it("reads numeric metadata timestamps and fills sensible defaults for sparse events", async () => {
    const { events } = await query(async () => ok([{ $metadata: { id: "a", timestamp: 1_700 }, $workers: { outcome: "exceededMemory" } }]));
    expect(events).toEqual([{ id: "a", timestamp: 1_700, level: "info", message: "", service: "my-worker", outcome: "exceededMemory" }]);
  });

  it("keeps the event's own service name when Cloudflare reports one", async () => {
    const { events } = await query(async () => ok([{ $metadata: { id: "a", level: "error", service: "tail-worker" }, timestamp: 1_500 }]));
    expect(events[0]!.service).toBe("tail-worker");
  });
});

describe("parseNdjson (blank lines)", () => {
  it("skips whitespace-only lines without counting them as invalid", () => {
    expect(parseNdjson("   \n\t\n").invalidLines).toBe(0);
  });
});

describe("runCommandSource", () => {
  it("passes the window to the command as SRE_FROM and SRE_TO and parses its output", async () => {
    const run = `printf '{"id":"1","timestamp":%s,"level":"error","message":"to %s","service":"s"}\\n' "$SRE_FROM" "$SRE_TO"`;
    const out = await runCommandSource(run, { from: 1_000, to: 2_000 });
    expect(out).toEqual({ events: [{ id: "1", timestamp: 1_000, level: "error", message: "to 2000", service: "s" }], invalidLines: 0 });
  });
});

describe("fetchCloudflareEvents (structured wide events)", () => {
  const window = { from: 1_000, to: 2_000 };
  const run = async (event: object) => {
    const fetch = async () => new Response(JSON.stringify({ success: true, result: { events: [event] } }));
    const { events } = await fetchCloudflareEvents({ accountId: "a", token: "t", service: "s", levels: ["error"], outcomes: [], ...window, fetch });
    return events[0]!;
  };

  it("uses error.type and error.message from a JSON log line, so ids in other fields never split or merge groups", async () => {
    const message = JSON.stringify({ event: "room.action", room_id: "r-91", players: 3, error: { type: "TypeError", message: "score of undefined", stack: "at x" } });
    expect((await run({ $metadata: { id: "1", level: "error", message }, timestamp: 1_500 })).message).toBe("TypeError: score of undefined");
  });

  it("uses an error object Cloudflare extracted to the top level of the event", async () => {
    const ev = await run({ $metadata: { id: "1", level: "error", message: "room.action" }, error: { type: "RangeError", message: "bad round" }, timestamp: 1_500 });
    expect(ev.message).toBe("RangeError: bad round");
  });

  it("prefers the extracted error object over the raw line when both are present", async () => {
    const message = JSON.stringify({ error: { type: "Raw", message: "from line" } });
    const ev = await run({ $metadata: { id: "1", level: "error", message }, error: { type: "Extracted", message: "from fields" }, timestamp: 1_500 });
    expect(ev.message).toBe("Extracted: from fields");
  });

  it("uses the message alone when the error has no type", async () => {
    const message = JSON.stringify({ error: { message: "db down" } });
    expect((await run({ $metadata: { id: "1", level: "error", message }, timestamp: 1_500 })).message).toBe("db down");
  });

  it("keeps plain text as-is and names the fields of JSON with no message", async () => {
    expect((await run({ $metadata: { id: "1", level: "error", message: "plain boom" }, timestamp: 1_500 })).message).toBe("plain boom");
    const json = JSON.stringify({ event: "x", outcome: "error" });
    expect((await run({ $metadata: { id: "1", level: "error", message: json }, timestamp: 1_500 })).message).toMatch(/^sre-agent could not find the error message in this log line\. Fields: event, outcome\./);
    expect((await run({ $metadata: { id: "1", level: "error", message: "{not json" }, timestamp: 1_500 })).message).toBe("{not json");
  });
});

describe("sources apply errorFields", () => {
  it("cloudflare uses the configured paths", async () => {
    const message = JSON.stringify({ failure: { reason: "quota exceeded" } });
    const fetch = async () => new Response(JSON.stringify({ success: true, result: { events: [{ $metadata: { id: "1", level: "error", message }, timestamp: 1_500 }] } }));
    const { events } = await fetchCloudflareEvents({ accountId: "a", token: "t", service: "s", levels: ["error"], outcomes: [], from: 1_000, to: 2_000, errorFields: { message: ["failure.reason"], type: [] }, fetch });
    expect(events[0]!.message).toBe("quota exceeded");
  });

  it("command source identifies structured messages", async () => {
    const line = JSON.stringify({ id: "1", timestamp: 1, level: "error", service: "s", message: JSON.stringify({ err: { name: "E", message: "m" } }) });
    const out = await runCommandSource(`printf '%s\\n' '${line}'`, { from: 0, to: 2 });
    expect(out.events[0]!.message).toBe("E: m");
  });
});
