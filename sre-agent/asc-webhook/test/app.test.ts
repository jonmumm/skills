import { describe, expect, it } from "vitest";
import { createApp, verifySignature } from "../src/app.ts";

const SECRET = "webhook-secret";
const env = { ASC_WEBHOOK_SECRET: SECRET, GITHUB_TOKEN: "gh-token", ALLOWED_REPOS: "jonmumm/escuchame-monorepo,open-game-system/rocket-crew" };

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `hmacsha256=${Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex")}`;
}

const event = (type: string) =>
  JSON.stringify({ data: { type, id: "4a9eacca-e53f-4006-85db-aa18c515663a", version: 1, attributes: { timestamp: "2025-05-08T01:29:36.16Z" }, relationships: { instance: { data: { type: "betaFeedbackScreenshotSubmissions", id: "AD8JvKbr0BK0Cj9OnM6WO6I" } } } } });

function harness() {
  const dispatched: Array<{ url: string; auth: string | null; body: unknown }> = [];
  const fetch = async (url: string, init?: RequestInit) => {
    dispatched.push({ url, auth: new Headers(init?.headers).get("authorization"), body: JSON.parse(String(init?.body)) });
    return new Response(null, { status: 204 });
  };
  return { app: createApp(env, { fetch }), dispatched };
}

const post = async (path: string, body: string, signature?: string) =>
  new Request(`https://hook.example${path}`, { method: "POST", body, headers: signature ? { "x-apple-signature": signature } : {} });

describe("verifySignature", () => {
  it("matches Apple's documented example", async () => {
    expect(await verifySignature("This is my secret", "Hello, World!", "hmacsha256=7f062172b01cb00b53ca068614674a3d982a34062a0f5d37687d5e3377e54657")).toBe(true);
  });

  it("rejects a wrong digest, a missing prefix and a missing header", async () => {
    expect(await verifySignature("This is my secret", "Hello, World!", "hmacsha256=00")).toBe(false);
    expect(await verifySignature("This is my secret", "Hello, World!", "7f062172b01cb00b53ca068614674a3d982a34062a0f5d37687d5e3377e54657")).toBe(false);
    expect(await verifySignature("This is my secret", "Hello, World!", null)).toBe(false);
  });
});

describe("POST /asc/:owner/:repo", () => {
  it("dispatches sre-agent on the repo for a signed screenshot feedback event", async () => {
    const { app, dispatched } = harness();
    const body = event("betaFeedbackScreenshotSubmissionCreated");
    const res = await app(await post("/asc/jonmumm/escuchame-monorepo", body, await sign(SECRET, body)));
    expect(res.status).toBe(202);
    expect(dispatched).toEqual([
      {
        url: "https://api.github.com/repos/jonmumm/escuchame-monorepo/dispatches",
        auth: "Bearer gh-token",
        body: { event_type: "sre-agent", client_payload: { source: "app-store-connect", event: "betaFeedbackScreenshotSubmissionCreated" } },
      },
    ]);
  });

  it("dispatches for a crash event too", async () => {
    const { app, dispatched } = harness();
    const body = event("betaFeedbackCrashSubmissionCreated");
    expect((await app(await post("/asc/jonmumm/escuchame-monorepo", body, await sign(SECRET, body)))).status).toBe(202);
    expect(dispatched).toHaveLength(1);
  });

  it("acknowledges other events (pings, build states) without dispatching", async () => {
    const { app, dispatched } = harness();
    const body = event("webhookPingCreated");
    expect((await app(await post("/asc/jonmumm/escuchame-monorepo", body, await sign(SECRET, body)))).status).toBe(200);
    expect(dispatched).toEqual([]);
  });

  it("rejects a bad signature before reading the event", async () => {
    const { app, dispatched } = harness();
    const body = event("betaFeedbackCrashSubmissionCreated");
    expect((await app(await post("/asc/jonmumm/escuchame-monorepo", body, await sign("wrong", body)))).status).toBe(401);
    expect((await app(await post("/asc/jonmumm/escuchame-monorepo", body))).status).toBe(401);
    expect(dispatched).toEqual([]);
  });

  it("refuses repos that are not allowed, even with a valid signature", async () => {
    const { app, dispatched } = harness();
    const body = event("betaFeedbackCrashSubmissionCreated");
    expect((await app(await post("/asc/someone/else", body, await sign(SECRET, body)))).status).toBe(403);
    expect(dispatched).toEqual([]);
  });

  it("returns 400 for a signed body that is not an App Store Connect event", async () => {
    const { app } = harness();
    expect((await app(await post("/asc/jonmumm/escuchame-monorepo", "{}", await sign(SECRET, "{}")))).status).toBe(400);
  });

  it("returns 502 when GitHub refuses the dispatch, so Apple retries", async () => {
    const app = createApp(env, { fetch: async () => new Response("bad credentials", { status: 401 }) });
    const body = event("betaFeedbackCrashSubmissionCreated");
    expect((await app(await post("/asc/jonmumm/escuchame-monorepo", body, await sign(SECRET, body)))).status).toBe(502);
  });

  it("404s other paths and methods", async () => {
    const { app } = harness();
    expect((await app(new Request("https://hook.example/asc/jonmumm/escuchame-monorepo"))).status).toBe(404);
    expect((await app(await post("/other", "{}"))).status).toBe(404);
  });
});
