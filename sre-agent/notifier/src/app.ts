import { type JWTVerifyGetKey, jwtVerify } from "jose";
import { z } from "zod";
import { mime, toHtml } from "./email.ts";

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "sre-notify";

const Claims = z.object({ repository: z.string(), repository_owner: z.string() });

const Item = z.object({ number: z.number().int().positive(), title: z.string().max(300), count: z.number().int().nonnegative() });
const Payload = z.object({
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  runUrl: z.url().refine((u) => u.startsWith("https://github.com/"), { message: "must be a github.com run URL" }),
  created: z.array(Item).max(20).default([]),
  reopened: z.array(Item).max(20).default([]),
  fixQueued: z.array(z.number().int().positive()).max(20).default([]),
  sourceErrors: z.array(z.string().max(500)).max(10).default([]),
});
type Payload = z.infer<typeof Payload>;

export type Env = { FROM: string; TO: string; ALLOWED_OWNERS: string };
export type Sent = { from: string; to: string; subject: string; text: string; html: string; raw: string };
export type Deps = { jwks: JWTVerifyGetKey; send: (m: Sent) => Promise<void>; now?: () => Date; id?: () => string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function subjectFor(p: Payload): string {
  const parts = [
    p.created.length ? `${p.created.length} new` : "",
    p.reopened.length ? plural(p.reopened.length, "regression", "regressions") : "",
    p.fixQueued.length ? plural(p.fixQueued.length, "fix attempt", "fix attempts") : "",
    p.sourceErrors.length ? "log source failing" : "",
  ].filter(Boolean);
  return `[sre] ${p.repo.split("/")[1]}: ${parts.join(", ")}`;
}

export function textFor(p: Payload): string {
  const link = (n: number) => `https://github.com/${p.repo}/issues/${n}`;
  const items = (list: Payload["created"]) => list.map((i) => `- #${i.number} ${i.title} (${plural(i.count, "time", "times")})\n  ${link(i.number)}`);
  const lines = [`sre-agent run for ${p.repo}`];
  if (p.created.length) lines.push("", "New issues", ...items(p.created));
  if (p.reopened.length) lines.push("", "Regressions (closed issues that came back)", ...items(p.reopened));
  if (p.fixQueued.length) lines.push("", "Fix attempts queued (Claude opens a PR or comments on the issue)", ...p.fixQueued.map((n) => `- #${n} ${link(n)}`));
  if (p.sourceErrors.length) lines.push("", "Log sources failing", ...p.sourceErrors.map((e) => `- ${e}`));
  lines.push("", `Run: ${p.runUrl}`);
  return lines.join("\n");
}

const json = (status: number, body: object) => Response.json(body, { status });

export function createApp(env: Env, deps: Deps) {
  const owners = new Set(env.ALLOWED_OWNERS.split(",").map((s) => s.trim()).filter(Boolean));
  return async function handle(req: Request): Promise<Response> {
    if (new URL(req.url).pathname !== "/notify") return json(404, { error: "not found" });
    if (req.method !== "POST") return json(405, { error: "POST only" });

    const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!bearer) return json(401, { error: "missing GitHub OIDC token" });
    let claims: z.infer<typeof Claims>;
    try {
      const { payload } = await jwtVerify(bearer, deps.jwks, { issuer: ISSUER, audience: AUDIENCE });
      claims = Claims.parse(payload);
    } catch {
      return json(401, { error: "invalid GitHub OIDC token" });
    }
    if (!owners.has(claims.repository_owner)) return json(403, { error: "repo owner not allowed" });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "body must be JSON" });
    }
    const parsed = Payload.safeParse(body);
    if (!parsed.success) return json(400, { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    const p = parsed.data;
    if (p.repo !== claims.repository) return json(403, { error: "payload repo does not match token" });
    if (!p.created.length && !p.reopened.length && !p.fixQueued.length && !p.sourceErrors.length) return new Response(null, { status: 204 });

    const from = env.FROM.replace(/.*<|>.*/g, "");
    const subject = subjectFor(p);
    const text = textFor(p);
    const html = toHtml(text);
    const raw = mime({ from: env.FROM, to: env.TO, subject, text, html, id: deps.id?.() ?? crypto.randomUUID(), date: deps.now?.() ?? new Date() });
    await deps.send({ from, to: env.TO, subject, text, html, raw });
    return json(202, { sent: true });
  };
}
