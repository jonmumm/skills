import { describe, expect, it } from "vitest";
import { applyActions, loadKnownIssues } from "../src/apply.ts";
import { fingerprint } from "../src/fingerprint.ts";
import type { IssueApi, RawIssue } from "../src/github.ts";
import { nextMarker, parseMarker, renderIssue } from "../src/issue-body.ts";
import { Config, type Group, type KnownIssue, type LogEvent } from "../src/schemas.ts";
import { triage } from "../src/triage.ts";

const MIN = 60_000;
const cfg = (over: Partial<Config> = {}) => Config.parse({ sources: [{ type: "command", run: "true" }], incidentWindowMinutes: 5, ...over });
let seq = 0;
const ev = (message: string, timestamp: number, over: Partial<LogEvent> = {}): LogEvent => ({ id: `e${seq++}`, timestamp, level: "error", message, service: "api", ...over });

describe("triage (incidents)", () => {
  it("groups new errors that start within the window into one issue, earliest first", () => {
    const { actions } = triage(
      [ev("db down", 0), ev("db down", MIN), ev("room load failed", 2 * MIN), ev("room load failed", 3 * MIN), ev("room load failed", 3 * MIN), ev("late thing", 20 * MIN)],
      [],
      cfg(),
    );
    expect(actions.map((a) => a.kind)).toEqual(["create", "create"]);
    const incident = actions.find((a) => a.kind === "create" && a.group.normalized === "db down");
    expect(incident).toMatchObject({ kind: "create", group: { normalized: "db down" } });
    expect(incident && incident.kind === "create" ? incident.related?.map((g) => g.normalized) : []).toEqual(["room load failed"]);
  });

  it("measures the window from the incident's first error, not chaining forever", () => {
    const { actions } = triage([ev("a", 0), ev("b", 4 * MIN), ev("c", 8 * MIN)], [], cfg());
    expect(actions.filter((a) => a.kind === "create").map((a) => a.group.normalized)).toEqual(["a", "c"]);
  });

  it("counts an incident once toward maxNewIssuesPerRun", () => {
    const { actions } = triage([ev("a", 0), ev("b", MIN), ev("c", 30 * MIN)], [], cfg({ maxNewIssuesPerRun: 1 }));
    expect(actions.map((a) => [a.kind, a.group.normalized])).toEqual([
      ["create", "a"],
      ["overflow", "c"],
    ]);
  });

  it("leaves grouping off when the window is 0", () => {
    const { actions } = triage([ev("a", 0), ev("b", MIN)], [], cfg({ incidentWindowMinutes: 0 }));
    expect(actions.map((a) => a.kind)).toEqual(["create", "create"]);
  });

  it("routes later occurrences of a related error to its open incident issue", () => {
    const issue: KnownIssue = {
      number: 9,
      state: "open",
      stateReason: null,
      labels: ["sre-agent"],
      marker: { fp: fingerprint("api", "db down"), service: "api", total: 3, firstSeen: 0, lastSeen: 5, related: [fingerprint("api", "room load failed")] },
    };
    const { actions } = triage([ev("room load failed", 10)], [issue], cfg());
    expect(actions).toMatchObject([{ kind: "related", issue: { number: 9 }, group: { normalized: "room load failed" } }]);
  });

  it("files a related error on its own once the incident issue is closed", () => {
    const issue: KnownIssue = {
      number: 9,
      state: "closed",
      stateReason: "completed",
      labels: ["sre-agent"],
      marker: { fp: fingerprint("api", "db down"), service: "api", total: 3, firstSeen: 0, lastSeen: 5, related: [fingerprint("api", "room load failed")] },
    };
    expect(triage([ev("room load failed", 10)], [issue], cfg()).actions.map((a) => a.kind)).toEqual(["create"]);
  });
});

const group = (over: Partial<Group> = {}): Group => ({
  fingerprint: "fp-origin0001",
  service: "api",
  normalized: "db down",
  sample: "db down",
  count: 2,
  firstSeen: 0,
  lastSeen: MIN,
  versionIds: ["v7"],
  ...over,
});
const victim = group({ fingerprint: "fp-victim0001", normalized: "room load failed", sample: "room load failed", count: 3, firstSeen: 2 * MIN, lastSeen: 3 * MIN });

describe("markers (incidents)", () => {
  it("records related fingerprints and counts them in the total", () => {
    expect(nextMarker(null, group(), [victim])).toEqual({ fp: "fp-origin0001", service: "api", total: 5, firstSeen: 0, lastSeen: 3 * MIN, related: ["fp-victim0001"] });
  });

  it("keeps earlier related fingerprints on later runs and round-trips through the body", () => {
    const m = nextMarker({ fp: "fp-origin0001", service: "api", total: 5, firstSeen: 0, lastSeen: 1, related: ["fp-old"] }, group(), [victim]);
    expect(m.related).toEqual(["fp-old", "fp-victim0001"]);
    expect(parseMarker(renderIssue(group(), m).body)).toEqual(m);
  });

  it("leaves related out of markers that have none", () => {
    expect(nextMarker(null, group())).not.toHaveProperty("related");
  });
});

describe("renderIssue (evidence)", () => {
  it("lists the errors that started in the same incident", () => {
    const { body } = renderIssue(group(), nextMarker(null, group(), [victim]), undefined, [victim]);
    expect(body).toContain("## Evidence");
    expect(body).toContain("E1. First seen 1970-01-01T00:00:00.000Z on version `v7`.");
    expect(body).toContain("E2. Started in the same incident: `api: room load failed` (3 times, first at 1970-01-01T00:02:00.000Z).");
  });

  it("shows the latest event's structured fields, redacted, with names and secrets removed", () => {
    const fields = { route: "/room/join", room_id: "r-9", player_name: "Juneau", email: "a@b.co", auth_token: "abc", error: { type: "TypeError", message: "x", stack: "at join (src/room.ts:42:7)\n    at handler (src/index.ts:10:3)" } };
    const { body } = renderIssue(group({ sampleFields: fields }), nextMarker(null, group()));
    expect(body).toContain('"route": "/room/join"');
    expect(body).toContain('"room_id": "r-9"');
    expect(body).not.toMatch(/Juneau|a@b\.co|"abc"/);
    expect(body).toContain('"player_name": "[redacted]"');
    expect(body).toContain("Stack locations: `src/room.ts:42`, `src/index.ts:10`");
    expect(body).not.toContain("at join (");
  });

  it("names related fingerprints from the marker when the related errors aren't in this run", () => {
    const m = { fp: "fp-origin0001", service: "api", total: 9, firstSeen: 0, lastSeen: 1, related: ["fp-victim0001"] };
    expect(renderIssue(group(), m).body).toContain("Errors grouped into this incident: `fp-victim0001`");
  });

  it("adds no evidence section when there is nothing beyond the basics", () => {
    expect(renderIssue(group(), nextMarker(null, group())).body).not.toContain("## Evidence");
  });
});

function memoryApi(seed: RawIssue[] = []) {
  const issues = new Map(seed.map((i) => [i.number, structuredClone(i)]));
  const comments: Array<{ n: number; body: string }> = [];
  let next = 100;
  const api: IssueApi = {
    async listLabeled(label) {
      return [...issues.values()].filter((i) => i.labels.some((l) => l.name === label));
    },
    async create({ title, body, labels }) {
      const number = next++;
      issues.set(number, { number, title, state: "open", state_reason: null, body, labels: labels.map((name) => ({ name })) });
      return number;
    },
    async update(n, patch) {
      const i = issues.get(n)!;
      if (patch.body !== undefined) i.body = patch.body;
      if (patch.state !== undefined) i.state = patch.state;
    },
    async comment(n, body) {
      comments.push({ n, body });
    },
    async addLabels() {},
    async ensureLabel() {},
  };
  return { api, issues, comments };
}

describe("applyActions (incidents)", () => {
  it("creates one issue whose marker covers the related errors", async () => {
    const { api } = memoryApi();
    await applyActions(api, [{ kind: "create", group: group(), related: [victim] }]);
    const [known] = await loadKnownIssues(api);
    expect(known!.marker).toMatchObject({ fp: "fp-origin0001", total: 5, related: ["fp-victim0001"] });
  });

  it("updates only the marker for a related occurrence, quietly", async () => {
    const { api, issues, comments } = memoryApi();
    await applyActions(api, [{ kind: "create", group: group(), related: [victim] }]);
    const [known] = await loadKnownIssues(api);
    const before = issues.get(100)!.body!;
    const result = await applyActions(api, [{ kind: "related", issue: known!, group: victimOf({ count: 4, lastSeen: 10 * MIN }) }]);
    const after = issues.get(100)!.body!;
    expect(result.updated).toEqual([100]);
    expect(comments).toEqual([]);
    expect(parseMarker(after)).toMatchObject({ total: 9, lastSeen: 10 * MIN, related: ["fp-victim0001"] });
    expect(after.replace(/<!-- sre-agent:v1 .* -->/, "")).toBe(before.replace(/<!-- sre-agent:v1 .* -->/, ""));
  });
});

function victimOf(over: Partial<Group>): Group {
  return { ...victim, ...over };
}

describe("renderIssue (evidence, exact)", () => {
  it("renders the whole evidence section", () => {
    const g = group({
      versionIds: ["v7", "v8"],
      sampleFields: {
        route: "/r",
        tags: Array.from({ length: 12 }, (_, i) => i),
        nested: { a: { b: { c: { d: 1 } } } },
        gone: null,
        ip_addr: "x",
        ipaddr: "y",
        players: [{ display_name: "Kid" }],
        stack: Array.from({ length: 7 }, (_, i) => `at f (src/f${i}.ts:${i + 1}:1)`).join("\n"),
      },
    });
    const v = victimOf({ normalized: "bad `x`" });
    const { body } = renderIssue(g, nextMarker(null, g, [v]), undefined, [v]);
    const section = body.slice(body.indexOf("## Evidence"), body.lastIndexOf("---\nClose as"));
    expect(section).toBe(
      [
        "## Evidence",
        "",
        "E1. First seen 1970-01-01T00:00:00.000Z on version `v7`, `v8`.",
        "E2. Started in the same incident: `api: bad 'x'` (3 times, first at 1970-01-01T00:02:00.000Z).",
        "E3. Stack locations: `src/f0.ts:1`, `src/f1.ts:2`, `src/f2.ts:3`, `src/f3.ts:4`, `src/f4.ts:5`.",
        "",
        "Structured fields of the latest failing event (untrusted, redacted):",
        "",
        "```json",
        JSON.stringify(
          { route: "/r", tags: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], nested: { a: { b: { c: "[…]" } } }, gone: null, ip_addr: "[redacted]", ipaddr: "[redacted]", players: [{ display_name: "[redacted]" }] },
          null,
          2,
        ),
        "```",
        "",
        "",
      ].join("\n"),
    );
  });

  it("says the version is unknown and lists several grouped fingerprints", () => {
    const m = { fp: "fp-origin0001", service: "api", total: 9, firstSeen: 0, lastSeen: 1, related: ["fp-a", "fp-b"] };
    const { body } = renderIssue(group({ versionIds: [] }), m);
    expect(body).toContain("E1. First seen 1970-01-01T00:00:00.000Z on version unknown.");
    expect(body).toContain("E2. Errors grouped into this incident: `fp-a`, `fp-b`.");
    expect(body).not.toContain("Stack locations");
  });
});

describe("applyActions (related, edge)", () => {
  it("does nothing for a related occurrence when the issue body is unknown", async () => {
    const { api } = memoryApi();
    const issue: KnownIssue = { number: 5, state: "open", stateReason: null, labels: [], marker: { fp: "o", service: "api", total: 1, firstSeen: 0, lastSeen: 0 } };
    expect(await applyActions(api, [{ kind: "related", issue, group: victim }])).toEqual({ created: [], updated: [], reopened: [] });
  });
});

describe("triage (incidents, edges)", () => {
  it("includes an error that starts exactly at the end of the window", () => {
    const { actions } = triage([ev("a", 0), ev("b", 5 * MIN)], [], cfg());
    expect(actions).toHaveLength(1);
  });

  it("never folds a new error into a known issue's error that started alongside it", () => {
    const issue: KnownIssue = { number: 3, state: "open", stateReason: null, labels: [], marker: { fp: fingerprint("api", "known"), service: "api", total: 1, firstSeen: 0, lastSeen: -1 } };
    const { actions } = triage([ev("known", 0), ev("fresh", MIN)], [issue], cfg());
    expect(actions.map((a) => a.kind).sort()).toEqual(["create", "update"]);
  });

  it("keeps an error's own issue even when another incident lists it as related", () => {
    const own: KnownIssue = { number: 1, state: "open", stateReason: null, labels: [], marker: { fp: fingerprint("api", "b"), service: "api", total: 1, firstSeen: 0, lastSeen: -1 } };
    const other: KnownIssue = { number: 2, state: "open", stateReason: null, labels: [], marker: { fp: fingerprint("api", "a"), service: "api", total: 1, firstSeen: 0, lastSeen: -1, related: [fingerprint("api", "b")] } };
    expect(triage([ev("b", 0)], [own, other], cfg()).actions).toMatchObject([{ kind: "update", issue: { number: 1 } }]);
  });

  it("keeps the latest structured fields as the sample, and none when no event had fields", () => {
    const [withFields] = triage([ev("x", 1, { fields: { n: 1 } }), ev("x", 2, { fields: { n: 2 } }), ev("x", 3)], [], cfg()).actions;
    expect(withFields!.group.sampleFields).toEqual({ n: 2 });
    const [none] = triage([ev("y", 1)], [], cfg()).actions;
    expect(none!.group).not.toHaveProperty("sampleFields");
  });
});

describe("triage (fields of a single event)", () => {
  it("keeps the fields of an error seen once", () => {
    expect(triage([ev("solo", 1, { fields: { route: "/x" } })], [], cfg()).actions[0]!.group.sampleFields).toEqual({ route: "/x" });
  });
});
