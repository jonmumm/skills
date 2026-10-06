import { describe, expect, it } from "vitest";
import { sendNotification } from "../src/notify.ts";

const payload = { repo: "o/r", runUrl: "https://github.com/o/r/actions/runs/1", created: [], reopened: [], fixQueued: [1], sourceErrors: [] };
const oidcEnv = { ACTIONS_ID_TOKEN_REQUEST_URL: "https://oidc.example/token?x=1", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "req-tok" };

function fakeFetch(notifyStatus = 202) {
  const calls: Array<{ url: string; method: string; auth: string | null; body?: unknown }> = [];
  const fetch = async (url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ url, method: init?.method ?? "GET", auth: headers.get("authorization"), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.startsWith("https://oidc.example")) return Response.json({ value: "jwt-123" });
    return new Response(null, { status: notifyStatus });
  };
  return { calls, fetch };
}

describe("sendNotification", () => {
  it("gets a GitHub OIDC token for the sre-notify audience and posts the payload with it", async () => {
    const { calls, fetch } = fakeFetch();
    expect(await sendNotification({ url: "https://notify.example/notify", payload, env: oidcEnv, fetch })).toBeNull();
    expect(calls[0]).toMatchObject({ url: "https://oidc.example/token?x=1&audience=sre-notify", method: "GET", auth: "bearer req-tok" });
    expect(calls[1]).toMatchObject({ url: "https://notify.example/notify", method: "POST", auth: "Bearer jwt-123", body: payload });
  });

  it("treats 204 (nothing to send) as success", async () => {
    const { fetch } = fakeFetch(204);
    expect(await sendNotification({ url: "https://notify.example/notify", payload, env: oidcEnv, fetch })).toBeNull();
  });

  it("explains how to fix a missing id-token permission instead of failing", async () => {
    const { calls, fetch } = fakeFetch();
    expect(await sendNotification({ url: "https://n/notify", payload, env: {}, fetch })).toMatch(/id-token: write/);
    expect(calls).toEqual([]);
  });

  it("reports a rejected notification with its status", async () => {
    const { fetch } = fakeFetch(403);
    expect(await sendNotification({ url: "https://n/notify", payload, env: oidcEnv, fetch })).toBe("Email notification failed: sre-notify answered 403.");
  });

  it("reports network errors instead of throwing", async () => {
    const fetch = async () => {
      throw new Error("ECONNRESET");
    };
    expect(await sendNotification({ url: "https://n/notify", payload, env: oidcEnv, fetch })).toBe("Email notification failed: ECONNRESET");
  });
});

describe("sendNotification (local key)", () => {
  it("uses SRE_NOTIFY_KEY directly, without asking GitHub for an OIDC token", async () => {
    const { calls, fetch } = fakeFetch();
    expect(await sendNotification({ url: "https://notify.example/notify", payload, env: { SRE_NOTIFY_KEY: "local-key" }, fetch })).toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "https://notify.example/notify", method: "POST", auth: "Bearer local-key", body: payload });
  });
});
