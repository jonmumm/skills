import { describe, expect, it } from "vitest";
import { applyActions, loadKnownIssues, pickFixes } from "../src/apply.ts";
import type { IssueApi, RawIssue } from "../src/github.ts";
import { renderIssue } from "../src/issue-body.ts";
import type { Group } from "../src/schemas.ts";

/** In-memory GitHub: the seam the real REST client sits behind. */
function memoryApi(seed: RawIssue[] = []) {
  const issues = new Map(seed.map((i) => [i.number, structuredClone(i)]));
  const comments: Array<{ n: number; body: string }> = [];
  const labelsCreated: string[] = [];
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
    async addLabels(n, labels) {
      issues.get(n)!.labels.push(...labels.map((name) => ({ name })));
    },
    async ensureLabel(name) {
      labelsCreated.push(name);
    },
  };
  return { api, issues, comments, labelsCreated };
}

const group = (over: Partial<Group> = {}): Group => ({
  fingerprint: "fp0000000001",
  service: "api",
  normalized: "boom",
  sample: "boom",
  count: 2,
  firstSeen: 10,
  lastSeen: 20,
  versionIds: [],
  ...over,
});

const seeded = (n: number, g: Group, state: "open" | "closed", total = 5): RawIssue => {
  const { title, body } = renderIssue(g, { fp: g.fingerprint, service: g.service, total, firstSeen: 1, lastSeen: 2 });
  return { number: n, title, state, state_reason: state === "closed" ? "completed" : null, body, labels: [{ name: "sre-agent" }] };
};

describe("loadKnownIssues", () => {
  it("parses markers and skips labeled issues without one", async () => {
    const { api } = memoryApi([seeded(1, group(), "open"), { number: 2, title: "t", state: "open", state_reason: null, body: "manual", labels: [{ name: "sre-agent" }] }]);
    const known = await loadKnownIssues(api);
    expect(known.map((k) => k.number)).toEqual([1]);
    expect(known[0]!.marker.total).toBe(5);
  });
});

describe("applyActions", () => {
  it("creates labeled issues with a marker", async () => {
    const { api, issues, labelsCreated } = memoryApi();
    const result = await applyActions(api, [{ kind: "create", group: group() }]);
    expect(result.created).toEqual([100]);
    expect(labelsCreated).toContain("sre-agent");
    const known = await loadKnownIssues(api);
    expect(known[0]!.marker).toMatchObject({ fp: "fp0000000001", total: 2 });
    expect(issues.get(100)!.labels.map((l) => l.name)).toEqual(["sre-agent"]);
  });

  it("updates an open issue's body quietly (no comment) with accumulated totals", async () => {
    const { api, comments } = memoryApi([seeded(1, group(), "open")]);
    const [issue] = await loadKnownIssues(api);
    const result = await applyActions(api, [{ kind: "update", issue: issue!, group: group({ count: 3 }) }]);
    expect(result.updated).toEqual([1]);
    expect(comments).toEqual([]);
    expect((await loadKnownIssues(api))[0]!.marker).toMatchObject({ total: 8, firstSeen: 1, lastSeen: 20 });
  });

  it("reopens a regression with a comment", async () => {
    const { api, issues, comments } = memoryApi([seeded(1, group(), "closed")]);
    const [issue] = await loadKnownIssues(api);
    const result = await applyActions(api, [{ kind: "reopen", issue: issue!, group: group() }]);
    expect(result.reopened).toEqual([1]);
    expect(issues.get(1)!.state).toBe("open");
    expect(comments[0]!.body).toMatch(/regression/i);
  });

  it("does nothing for muted and overflow actions", async () => {
    const { api, issues } = memoryApi([seeded(1, group(), "closed")]);
    const [issue] = await loadKnownIssues(api);
    const result = await applyActions(api, [
      { kind: "muted", issue: issue!, group: group() },
      { kind: "overflow", group: group({ fingerprint: "other" }) },
    ]);
    expect(result).toEqual({ created: [], updated: [], reopened: [] });
    expect(issues.size).toBe(1);
  });
});

describe("pickFixes", () => {
  it("returns nothing below autonomy 2", async () => {
    const { api } = memoryApi();
    expect(await pickFixes(api, { created: [100], updated: [], reopened: [] }, { autonomy: 1, maxFixesPerRun: 3 })).toEqual([]);
  });

  it("picks new and reopened issues up to the cap and labels them so they are not retried", async () => {
    const { api, issues } = memoryApi([seeded(1, group(), "open"), seeded(2, group(), "open"), seeded(3, group(), "open")]);
    const picked = await pickFixes(api, { created: [1, 2], updated: [], reopened: [3] }, { autonomy: 2, maxFixesPerRun: 2 });
    expect(picked).toEqual([1, 2]);
    expect(issues.get(1)!.labels.map((l) => l.name)).toContain("sre-agent:fix-attempted");
    expect(issues.get(3)!.labels.map((l) => l.name)).not.toContain("sre-agent:fix-attempted");
  });

  it("skips issues that already had a fix attempt", async () => {
    const already = seeded(1, group(), "open");
    already.labels.push({ name: "sre-agent:fix-attempted" });
    const { api } = memoryApi([already]);
    expect(await pickFixes(api, { created: [], updated: [], reopened: [1] }, { autonomy: 2, maxFixesPerRun: 2 })).toEqual([]);
  });
});
