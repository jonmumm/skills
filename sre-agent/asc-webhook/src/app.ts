import { z } from "zod";

export type Env = { ASC_WEBHOOK_SECRET: string; GITHUB_TOKEN: string; ALLOWED_REPOS: string };
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Events that mean new TestFlight feedback is waiting for sre-agent. */
const FEEDBACK = new Set(["betaFeedbackScreenshotSubmissionCreated", "betaFeedbackCrashSubmissionCreated"]);

const AscEvent = z.object({ data: z.object({ type: z.string() }) });

/** App Store Connect signs the raw body: `x-apple-signature: hmacsha256=<hex HMAC-SHA256>`. */
export async function verifySignature(secret: string, body: string, header: string | null): Promise<boolean> {
  const hex = header?.match(/^hmacsha256=([0-9a-f]{64})$/i)?.[1];
  if (!hex) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const digest = new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));
  return crypto.subtle.verify("HMAC", key, digest, new TextEncoder().encode(body)); // constant-time
}

/** Receives App Store Connect webhooks and starts the repo's sre-agent workflow when TestFlight feedback arrives. */
export function createApp(env: Env, deps: { fetch: Fetch }) {
  const allowed = new Set(env.ALLOWED_REPOS.split(",").map((r) => r.trim().toLowerCase()).filter(Boolean));
  return async (req: Request): Promise<Response> => {
    const repo = new URL(req.url).pathname.match(/^\/asc\/([\w.-]+\/[\w.-]+)$/)?.[1];
    if (req.method !== "POST" || !repo) return new Response("not found", { status: 404 });
    const body = await req.text();
    if (!(await verifySignature(env.ASC_WEBHOOK_SECRET, body, req.headers.get("x-apple-signature")))) return new Response("bad signature", { status: 401 });
    if (!allowed.has(repo.toLowerCase())) return new Response("repo not allowed", { status: 403 });

    let parsed: z.infer<typeof AscEvent>;
    try {
      parsed = AscEvent.parse(JSON.parse(body));
    } catch {
      return new Response("not an App Store Connect event", { status: 400 });
    }
    const type = parsed.data.type;
    if (!FEEDBACK.has(type)) return new Response("ignored", { status: 200 });

    const res = await deps.fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "sre-asc-webhook", "content-type": "application/json" },
      body: JSON.stringify({ event_type: "sre-agent", client_payload: { source: "app-store-connect", event: type } }),
    });
    if (!res.ok) return new Response(`GitHub dispatch failed: ${res.status}`, { status: 502 });
    return new Response("dispatched", { status: 202 });
  };
}
