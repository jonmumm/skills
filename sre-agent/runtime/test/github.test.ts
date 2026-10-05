import { describe, expect, it } from "vitest";
import { restIssueApi } from "../src/github.ts";

type Call = { url: string; method: string; body: unknown; headers: Headers };

function fakeFetch(responses: Array<{ status?: number; json: unknown }>) {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined, headers: new Headers(init?.headers) });
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

describe("restIssueApi (requests and parsing)", () => {
  it("authenticates every request as the GitHub REST API expects", async () => {
    const { calls, fetch } = fakeFetch([{ json: [] }]);
    await restIssueApi({ token: "s3cr3t", repo: "o/r", fetch }).listLabeled("sre-agent");
    expect(Object.fromEntries(calls[0]!.headers)).toEqual({
      authorization: "Bearer s3cr3t",
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "content-type": "application/json",
    });
  });

  it("keeps state, close reason and label names of listed issues", async () => {
    const { fetch } = fakeFetch([
      { json: [issue(1, { state: "closed", state_reason: "completed", labels: [{ name: "sre-agent" }, { name: "bug" }] }), issue(2, { state_reason: undefined })] },
    ]);
    const [closed, open] = await restIssueApi({ token: "t", repo: "o/r", fetch }).listLabeled("sre-agent");
    expect(closed).toMatchObject({ state: "closed", state_reason: "completed", labels: [{ name: "sre-agent" }, { name: "bug" }] });
    expect(open!.state_reason).toBeNull();
  });

  it("updates an issue with a PATCH of the given fields", async () => {
    const { calls, fetch } = fakeFetch([{ json: {} }]);
    await restIssueApi({ token: "t", repo: "o/r", fetch }).update(5, { body: "new", state: "open" });
    expect(calls).toMatchObject([{ method: "PATCH", url: "https://api.github.com/repos/o/r/issues/5", body: { body: "new", state: "open" } }]);
  });

  it("comments with a POST to the issue's comments", async () => {
    const { calls, fetch } = fakeFetch([{ status: 201, json: {} }]);
    await restIssueApi({ token: "t", repo: "o/r", fetch }).comment(5, "hello");
    expect(calls).toMatchObject([{ method: "POST", url: "https://api.github.com/repos/o/r/issues/5/comments", body: { body: "hello" } }]);
  });

  it("adds labels with a POST to the issue's labels", async () => {
    const { calls, fetch } = fakeFetch([{ json: [] }]);
    await restIssueApi({ token: "t", repo: "o/r", fetch }).addLabels(5, ["sre-agent:fix-attempted"]);
    expect(calls).toMatchObject([{ method: "POST", url: "https://api.github.com/repos/o/r/issues/5/labels", body: { labels: ["sre-agent:fix-attempted"] } }]);
  });

  it("creates a label with its name and color", async () => {
    const { calls, fetch } = fakeFetch([{ status: 201, json: {} }]);
    await restIssueApi({ token: "t", repo: "o/r", fetch }).ensureLabel("sre-agent", "d73a4a");
    expect(calls).toMatchObject([{ method: "POST", url: "https://api.github.com/repos/o/r/labels", body: { name: "sre-agent", color: "d73a4a" } }]);
  });

  it("names GET in errors from reads and caps the echoed response at 300 chars", async () => {
    const { fetch } = fakeFetch([{ status: 500, json: "e".repeat(1000) }]);
    const err = await restIssueApi({ token: "t", repo: "o/r", fetch }).listLabeled("sre-agent").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const message = err instanceof Error ? err.message : "";
    expect(message.startsWith("GitHub 500 on GET /issues?labels=sre-agent&state=all&per_page=100&page=1: ")).toBe(true);
    expect(message.split(": ")[1]).toHaveLength(300);
  });

  it("does not treat 422 as success outside label creation", async () => {
    const { fetch } = fakeFetch([{ status: 422, json: { message: "Validation Failed" } }]);
    await expect(restIssueApi({ token: "t", repo: "o/r", fetch }).comment(1, "x")).rejects.toThrow(/GitHub 422 on POST/);
  });
});
