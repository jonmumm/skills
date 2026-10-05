import { describe, expect, it } from "vitest";
import { restIssueApi } from "../src/github.ts";

type Call = { url: string; method: string; body: unknown };

function fakeFetch(responses: Array<{ status?: number; json: unknown }>) {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const next = responses.shift() ?? { json: {} };
    return new Response(JSON.stringify(next.json), { status: next.status ?? 200 });
  };
  return { calls, fetch };
}

const issue = (n: number, extra: object = {}) => ({ number: n, title: `t${n}`, state: "open", state_reason: null, body: "b", labels: [{ name: "sre-agent" }], ...extra });

describe("restIssueApi", () => {
  it("lists labeled issues across pages and skips pull requests", async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => issue(i + 1));
    const { calls, fetch } = fakeFetch([{ json: page1 }, { json: [issue(101), issue(102, { pull_request: {} })] }]);
    const api = restIssueApi({ token: "t", repo: "o/r", fetch });
    const list = await api.listLabeled("sre-agent");
    expect(list).toHaveLength(101);
    expect(calls[0]!.url).toBe("https://api.github.com/repos/o/r/issues?labels=sre-agent&state=all&per_page=100&page=1");
    expect(calls[1]!.url).toContain("page=2");
  });

  it("creates an issue and returns its number", async () => {
    const { calls, fetch } = fakeFetch([{ status: 201, json: { number: 42 } }]);
    const n = await restIssueApi({ token: "t", repo: "o/r", fetch }).create({ title: "x", body: "y", labels: ["sre-agent"] });
    expect(n).toBe(42);
    expect(calls[0]).toMatchObject({ method: "POST", url: "https://api.github.com/repos/o/r/issues", body: { title: "x", labels: ["sre-agent"] } });
  });

  it("treats an existing label as success", async () => {
    const { fetch } = fakeFetch([{ status: 422, json: { message: "Validation Failed" } }]);
    await expect(restIssueApi({ token: "t", repo: "o/r", fetch }).ensureLabel("sre-agent", "d73a4a")).resolves.toBeUndefined();
  });

  it("throws with status and path on other failures", async () => {
    const { fetch } = fakeFetch([{ status: 403, json: { message: "nope" } }]);
    await expect(restIssueApi({ token: "t", repo: "o/r", fetch }).comment(1, "x")).rejects.toThrow(/403.*\/issues\/1\/comments/);
  });

  it("rejects malformed issue payloads at the boundary", async () => {
    const { fetch } = fakeFetch([{ json: [{ number: "1" }] }]);
    await expect(restIssueApi({ token: "t", repo: "o/r", fetch }).listLabeled("sre-agent")).rejects.toThrow();
  });
});
