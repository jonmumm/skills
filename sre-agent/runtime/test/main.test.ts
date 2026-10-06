import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/main.ts";

const NOW = Date.UTC(2026, 9, 5, 12, 0);

function workspace(config: string, ndjson: object[]) {
  const dir = mkdtempSync(join(tmpdir(), "sre-agent-"));
  writeFileSync(join(dir, "logs.ndjson"), ndjson.map((e) => JSON.stringify(e)).join("\n"));
  writeFileSync(join(dir, "sre-agent.yml"), config.replaceAll("$DIR", dir));
  return join(dir, "sre-agent.yml");
}

const err = (id: string, message: string, ago = 60_000) => ({ id, timestamp: NOW - ago, level: "error", message, service: "api" });

/** A tiny GitHub that answers the REST calls the runtime makes. */
function fakeGitHub() {
  const issues: Array<{ number: number; title: string; state: string; state_reason: null; body: string; labels: Array<{ name: string }> }> = [];
  const requests: string[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = new URL(url).pathname + new URL(url).search;
    requests.push(`${method} ${path}`);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (method === "GET" && path.includes("/issues?labels=")) {
      const label = new URL(url).searchParams.get("labels");
      return Response.json(issues.filter((i) => i.labels.some((l) => l.name === label)));
    }
    if (method === "POST" && path.endsWith("/issues")) {
      const number = issues.length + 1;
      issues.push({ number, title: body.title, body: body.body, state: "open", state_reason: null, labels: body.labels.map((name: string) => ({ name })) });
      return Response.json({ number }, { status: 201 });
    }
    if (method === "POST" && path.endsWith("/labels") && !path.includes("/issues/")) return Response.json({}, { status: 201 });
    if (method === "POST" && path.includes("/labels")) {
      const n = Number(path.split("/issues/")[1]!.split("/")[0]);
      issues[n - 1]!.labels.push(...body.labels.map((name: string) => ({ name })));
      return Response.json([]);
    }
    if (method === "PATCH") {
      const n = Number(path.split("/issues/")[1]);
      Object.assign(issues[n - 1]!, body);
      return Response.json({});
    }
    return Response.json({}, { status: 404 });
  };
  return { issues, requests, fetch };
}

const env = { GITHUB_REPOSITORY: "o/r", GITHUB_TOKEN: "t" };

describe("run (end to end with a command source and a fake GitHub)", () => {
  const logs = [err("1", "timeout for user 1"), err("2", "timeout for user 2"), err("3", "db down"), { ...err("4", "fine"), level: "info" }];

  it("observes only at autonomy 0: summary, no writes", async () => {
    const gh = fakeGitHub();
    const out = await run({ configPath: workspace("sources:\n  - type: command\n    run: cat $DIR/logs.ndjson\n", logs), dry: false, env, now: NOW, fetch: gh.fetch });
    expect(out.summary).toContain("Mode: **observe**");
    expect(out.summary).toMatch(/\| create \| 2 \| api \| `timeout for user <n>`/);
    expect(gh.requests.every((r) => r.startsWith("GET"))).toBe(true);
    expect(out).toMatchObject({ exitCode: 0, fixIssues: [] });
  });

  it("files issues at autonomy 1, then quietly updates them on the next run", async () => {
    const gh = fakeGitHub();
    const config = workspace("autonomy: 1\nsources:\n  - type: command\n    run: cat $DIR/logs.ndjson\n", logs);
    await run({ configPath: config, dry: false, env, now: NOW, fetch: gh.fetch });
    expect(gh.issues.map((i) => i.title)).toEqual(["[sre] api: timeout for user <n>", "[sre] api: db down"]);

    // Same window again: already-counted events are skipped, so nothing changes.
    const again = await run({ configPath: config, dry: false, env, now: NOW, fetch: gh.fetch });
    expect(again.summary).toContain("No new errors.");
    expect(gh.issues).toHaveLength(2);
  });

  it("queues fix attempts at autonomy 2, capped by maxFixesPerRun", async () => {
    const gh = fakeGitHub();
    const out = await run({
      configPath: workspace("autonomy: 2\nmaxFixesPerRun: 1\nsources:\n  - type: command\n    run: cat $DIR/logs.ndjson\n", logs),
      dry: false,
      env,
      now: NOW,
      fetch: gh.fetch,
    });
    expect(out.fixIssues).toEqual([1]);
    expect(gh.issues[0]!.labels.map((l) => l.name)).toContain("sre-agent:fix-attempted");
  });

  it("--dry never writes, even at autonomy 2", async () => {
    const gh = fakeGitHub();
    const out = await run({ configPath: workspace("autonomy: 2\nsources:\n  - type: command\n    run: cat $DIR/logs.ndjson\n", logs), dry: true, env, now: NOW, fetch: gh.fetch });
    expect(out.summary).toContain("Mode: **dry run**");
    expect(gh.issues).toEqual([]);
  });

  it("fails the run when a source fails, but still handles the healthy sources", async () => {
    const gh = fakeGitHub();
    const out = await run({
      configPath: workspace("autonomy: 1\nsources:\n  - type: cloudflare\n    service: api\n  - type: command\n    run: cat $DIR/logs.ndjson\n", logs),
      dry: false,
      env,
      now: NOW,
      fetch: gh.fetch,
    });
    expect(out.exitCode).toBe(1);
    expect(out.summary).toContain("Source failed: cloudflare:api: missing CLOUDFLARE_ACCOUNT_ID");
    expect(gh.issues).toHaveLength(2); // the healthy source still files issues
  });
});

describe("run (email notification)", () => {
  const logs = [err("1", "timeout for user 1"), err("2", "db down")];
  const notifyEnv = { ...env, ACTIONS_ID_TOKEN_REQUEST_URL: "https://oidc.example/t?a=1", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "r", GITHUB_SERVER_URL: "https://github.com", GITHUB_RUN_ID: "99" };

  function withNotifier() {
    const gh = fakeGitHub();
    const posts: unknown[] = [];
    const fetch = async (url: string, init?: RequestInit) => {
      if (url.startsWith("https://oidc.example")) return Response.json({ value: "jwt" });
      if (url === "https://notify.example/notify") {
        posts.push(JSON.parse(String(init!.body)));
        return new Response(null, { status: 202 });
      }
      return gh.fetch(url, init);
    };
    return { gh, posts, fetch };
  }

  it("emails new issues with their titles, counts and the run link", async () => {
    const { posts, fetch } = withNotifier();
    const config = workspace("autonomy: 1\nnotify:\n  url: https://notify.example/notify\nsources:\n  - type: command\n    run: cat $DIR/logs.ndjson\n", logs);
    await run({ configPath: config, dry: false, env: notifyEnv, now: NOW, fetch });
    expect(posts).toEqual([
      {
        repo: "o/r",
        runUrl: "https://github.com/o/r/actions/runs/99",
        created: [
          { number: 1, title: "[sre] api: timeout for user <n>", count: 1 },
          { number: 2, title: "[sre] api: db down", count: 1 },
        ],
        reopened: [],
        fixQueued: [],
        sourceErrors: [],
      },
    ]);
  });

  it("stays quiet when a run only updates known issues", async () => {
    const { posts, fetch } = withNotifier();
    const config = workspace("autonomy: 1\nnotify:\n  url: https://notify.example/notify\nsources:\n  - type: command\n    run: cat $DIR/logs.ndjson\n", logs);
    await run({ configPath: config, dry: false, env: notifyEnv, now: NOW, fetch });
    await run({ configPath: config, dry: false, env: notifyEnv, now: NOW + 1, fetch });
    expect(posts).toHaveLength(1);
  });

  it("never emails at autonomy 0 or in a dry run", async () => {
    const { posts, fetch } = withNotifier();
    await run({ configPath: workspace("notify:\n  url: https://notify.example/notify\nsources:\n  - type: command\n    run: cat $DIR/logs.ndjson\n", logs), dry: false, env: notifyEnv, now: NOW, fetch });
    await run({ configPath: workspace("autonomy: 1\nnotify:\n  url: https://notify.example/notify\nsources:\n  - type: command\n    run: cat $DIR/logs.ndjson\n", logs), dry: true, env: notifyEnv, now: NOW, fetch });
    expect(posts).toEqual([]);
  });

  it("emails a failing log source and notes notification problems in the summary", async () => {
    const { posts, fetch } = withNotifier();
    const out = await run({
      configPath: workspace("autonomy: 1\nnotify:\n  url: https://notify.example/notify\nsources:\n  - type: cloudflare\n    service: api\n", []),
      dry: false,
      env: notifyEnv,
      now: NOW,
      fetch,
    });
    expect(posts).toMatchObject([{ sourceErrors: ["cloudflare:api: missing CLOUDFLARE_ACCOUNT_ID"] }]);
    const noOidc = await run({
      configPath: workspace("autonomy: 1\nnotify:\n  url: https://notify.example/notify\nsources:\n  - type: cloudflare\n    service: api\n", []),
      dry: false,
      env,
      now: NOW,
      fetch,
    });
    expect(out.summary).not.toMatch(/notification/i);
    expect(noOidc.summary).toMatch(/id-token: write/);
  });
});
