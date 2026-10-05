import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fetchCloudflareEvents } from "../src/sources/cloudflare.ts";
import { parseNdjson } from "../src/sources/command.ts";

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
