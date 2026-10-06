import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp, type Sent } from "../src/app.ts";

const ISSUER = "https://token.actions.githubusercontent.com";
const env = { FROM: "SRE Agent <sre@mumm.dev>", TO: "jon@example.com", ALLOWED_OWNERS: "jonmumm,open-game-system" };

let signKey: CryptoKey;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  signKey = privateKey;
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
});

const token = (claims: Record<string, string> = {}, opts: { aud?: string; iss?: string } = {}) =>
  new SignJWT({ repository: "open-game-system/trivia-jam", repository_owner: "open-game-system", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? "sre-notify")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signKey);

const payload = {
  repo: "open-game-system/trivia-jam",
  runUrl: "https://github.com/open-game-system/trivia-jam/actions/runs/1",
  created: [{ number: 12, title: "[sre] trivia-jam: TypeError: <b>score</b> of undefined", count: 312 }],
  reopened: [{ number: 7, title: "[sre] trivia-jam: db down", count: 3 }],
  fixQueued: [12],
  sourceErrors: [],
};

function setup() {
  const sent: Sent[] = [];
  const app = createApp(env, { jwks, send: async (m) => void sent.push(m), now: () => new Date(0), id: () => "id1" });
  const post = async (body: unknown, auth?: string) =>
    app(new Request("https://sre-notify.example/notify", { method: "POST", headers: auth ? { authorization: `Bearer ${auth}` } : {}, body: JSON.stringify(body) }));
  return { app, sent, post };
}

describe("sre-notify", () => {
  it("emails one summary for a valid run and links every issue", async () => {
    const { sent, post } = setup();
    const res = await post(payload, await token());
    expect(res.status).toBe(202);
    expect(sent).toHaveLength(1);
    const m = sent[0]!;
    expect(m.from).toBe("sre@mumm.dev");
    expect(m.to).toBe("jon@example.com");
    expect(m.subject).toBe("[sre] trivia-jam: 1 new, 1 regression, 1 fix attempt");
    expect(m.text).toContain("https://github.com/open-game-system/trivia-jam/issues/12");
    expect(m.text).toContain("https://github.com/open-game-system/trivia-jam/issues/7");
    expect(m.text).toContain("312 times");
    expect(m.text).toContain(payload.runUrl);
    expect(m.raw).toContain("From: SRE Agent <sre@mumm.dev>\r\n");
  });

  it("escapes log-derived titles in the HTML part", async () => {
    const { sent, post } = setup();
    await post(payload, await token());
    expect(sent[0]!.html).toContain("&lt;b&gt;score&lt;/b&gt;");
    expect(sent[0]!.html).not.toContain("<b>score</b>");
  });

  it("says when a log source is failing", async () => {
    const { sent, post } = setup();
    await post({ ...payload, created: [], reopened: [], fixQueued: [], sourceErrors: ["cloudflare:trivia-jam: Cloudflare 403: Authentication error"] }, await token());
    expect(sent[0]!.subject).toBe("[sre] trivia-jam: log source failing");
    expect(sent[0]!.text).toContain("Authentication error");
  });

  it("sends nothing when there is nothing to report", async () => {
    const { sent, post } = setup();
    const res = await post({ ...payload, created: [], reopened: [], fixQueued: [] }, await token());
    expect(res.status).toBe(204);
    expect(sent).toEqual([]);
  });

  it("rejects a missing or malformed token", async () => {
    const { sent, post } = setup();
    expect((await post(payload)).status).toBe(401);
    expect((await post(payload, "not-a-jwt")).status).toBe(401);
    expect(sent).toEqual([]);
  });

  it("rejects tokens for another audience or issuer", async () => {
    const { post } = setup();
    expect((await post(payload, await token({}, { aud: "other" }))).status).toBe(401);
    expect((await post(payload, await token({}, { iss: "https://evil.example" }))).status).toBe(401);
  });

  it("rejects repos owned by anyone else", async () => {
    const { sent, post } = setup();
    const res = await post({ ...payload, repo: "mallory/x" }, await token({ repository: "mallory/x", repository_owner: "mallory" }));
    expect(res.status).toBe(403);
    expect(sent).toEqual([]);
  });

  it("rejects a payload that claims a different repo than the token", async () => {
    const { post } = setup();
    expect((await post({ ...payload, repo: "jonmumm/other" }, await token())).status).toBe(403);
  });

  it("rejects malformed payloads", async () => {
    const { post } = setup();
    expect((await post({ ...payload, runUrl: "https://evil.example/x" }, await token())).status).toBe(400);
    expect((await post({ repo: "open-game-system/trivia-jam" }, await token())).status).toBe(400);
  });

  it("only serves POST /notify", async () => {
    const { app } = setup();
    expect((await app(new Request("https://x/notify"))).status).toBe(405);
    expect((await app(new Request("https://x/other", { method: "POST" }))).status).toBe(404);
  });
});
