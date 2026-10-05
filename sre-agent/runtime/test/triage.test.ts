import { describe, expect, it } from "vitest";
import { fingerprint } from "../src/fingerprint.ts";
import { Config, type KnownIssue, type LogEvent } from "../src/schemas.ts";
import { triage } from "../src/triage.ts";

const cfg = (over: Partial<Config> = {}) =>
  Config.parse({ sources: [{ type: "command", run: "true" }], ...over });

let seq = 0;
const ev = (over: Partial<LogEvent> = {}): LogEvent => ({
  id: `e${seq++}`,
  timestamp: 1_000,
  level: "error",
  message: "boom",
  service: "api",
  ...over,
});

const known = (message: string, over: Partial<KnownIssue> = {}, lastSeen = 0): KnownIssue => {
  const fp = fingerprint("api", message);
  return {
    number: 7,
    state: "open",
    stateReason: null,
    labels: ["sre-agent"],
    marker: { fp, service: "api", total: 4, firstSeen: 0, lastSeen },
    ...over,
  };
};

describe("triage", () => {
  it("ignores non-error levels and ok outcomes", () => {
    expect(triage([ev({ level: "info" }), ev({ level: "warn", outcome: "ok" })], [], cfg()).actions).toEqual([]);
  });

  it("treats a failing outcome as an error even at info level", () => {
    const { actions } = triage([ev({ level: "info", outcome: "exceededCpu" })], [], cfg());
    expect(actions.map((a) => a.kind)).toEqual(["create"]);
  });

  it("groups events by fingerprint, counting and spanning time", () => {
    const { actions } = triage(
      [
        ev({ message: "timeout for user 1", timestamp: 5, versionId: "v1" }),
        ev({ message: "timeout for user 2", timestamp: 9, versionId: "v2" }),
        ev({ message: "timeout for user 3", timestamp: 7, versionId: "v1" }),
      ],
      [],
      cfg(),
    );
    expect(actions).toHaveLength(1);
    const g = actions[0]!.group;
    expect(g).toMatchObject({ count: 3, firstSeen: 5, lastSeen: 9, normalized: "timeout for user <n>" });
    expect(g.versionIds.sort()).toEqual(["v1", "v2"]);
  });

  it("orders groups by count, most frequent first", () => {
    const { actions } = triage([ev({ message: "a" }), ev({ message: "b" }), ev({ message: "b" })], [], cfg());
    expect(actions.map((a) => a.group.count)).toEqual([2, 1]);
  });

  it("drops groups below minCount", () => {
    expect(triage([ev()], [], cfg({ minCount: 2 })).actions).toEqual([]);
    expect(triage([ev(), ev()], [], cfg({ minCount: 2 })).actions).toHaveLength(1);
  });

  it("drops messages matching an ignore regex (against the normalized form)", () => {
    expect(triage([ev({ message: "client hung up 499" })], [], cfg({ ignore: ["^client hung up <n>$"] })).actions).toEqual([]);
  });

  it("caps new issues per run and reports the rest as overflow", () => {
    const events = ["a", "b", "c"].map((message) => ev({ message }));
    const { actions } = triage(events, [], cfg({ maxNewIssuesPerRun: 2 }));
    expect(actions.map((a) => a.kind)).toEqual(["create", "create", "overflow"]);
  });

  it("updates an open issue for a known fingerprint", () => {
    const { actions } = triage([ev()], [known("boom")], cfg());
    expect(actions.map((a) => a.kind)).toEqual(["update"]);
  });

  it("reopens an issue closed as completed (regression)", () => {
    const { actions } = triage([ev()], [known("boom", { state: "closed", stateReason: "completed" })], cfg());
    expect(actions.map((a) => a.kind)).toEqual(["reopen"]);
  });

  it("stays quiet for an issue closed as not planned (muted)", () => {
    const { actions } = triage([ev()], [known("boom", { state: "closed", stateReason: "not_planned" })], cfg());
    expect(actions.map((a) => a.kind)).toEqual(["muted"]);
  });

  it("does not count events already recorded in the issue marker (overlapping windows)", () => {
    const issue = known("boom", {}, 1_000);
    expect(triage([ev({ timestamp: 1_000 }), ev({ timestamp: 900 })], [issue], cfg()).actions).toEqual([]);
    const { actions } = triage([ev({ timestamp: 1_000 }), ev({ timestamp: 1_001 })], [issue], cfg());
    expect(actions[0]!.group.count).toBe(1);
  });

  it("keeps updates of known issues out of the new-issue cap", () => {
    const { actions } = triage([ev({ message: "boom" }), ev({ message: "x" })], [known("boom")], cfg({ maxNewIssuesPerRun: 1 }));
    expect(actions.map((a) => a.kind).sort()).toEqual(["create", "update"]);
  });

  it("uses the most recent event as the sample", () => {
    const { actions } = triage([ev({ message: "n 1", timestamp: 2 }), ev({ message: "n 2", timestamp: 3 })], [], cfg());
    expect(actions[0]!.group.sample).toBe("n 2");
  });
});

describe("triage (details)", () => {
  it("stays quiet for an issue closed as a duplicate (muted)", () => {
    const { actions } = triage([ev()], [known("boom", { state: "closed", stateReason: "duplicate" })], cfg());
    expect(actions.map((a) => a.kind)).toEqual(["muted"]);
  });

  it("reopens an issue closed with no reason", () => {
    const { actions } = triage([ev()], [known("boom", { state: "closed", stateReason: null })], cfg());
    expect(actions.map((a) => a.kind)).toEqual(["reopen"]);
  });

  it("records the version of a single event", () => {
    const { actions } = triage([ev({ versionId: "v7" })], [], cfg());
    expect(actions[0]!.group.versionIds).toEqual(["v7"]);
  });

  it("records no versions when events carry none", () => {
    const { actions } = triage([ev(), ev()], [], cfg());
    expect(actions[0]!.group.versionIds).toEqual([]);
  });

  it("uses the later-arriving event as the sample when timestamps tie", () => {
    const { actions } = triage([ev({ message: "n 1", timestamp: 5 }), ev({ message: "n 2", timestamp: 5 })], [], cfg());
    expect(actions[0]!.group.sample).toBe("n 2");
  });
});
