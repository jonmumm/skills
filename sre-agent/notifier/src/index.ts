import { EmailMessage } from "cloudflare:email";
import { createRemoteJWKSet } from "jose";
import { createApp, type Env } from "./app.ts";

const jwks = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));

export default {
  async fetch(req: Request, env: Env & { MAILER: SendEmail }): Promise<Response> {
    const app = createApp(env, { jwks, send: async (m) => void (await env.MAILER.send(new EmailMessage(m.from, m.to, m.raw))) });
    const started = Date.now();
    const res = await app(req);
    console.log({ event: "http.request", service: "sre-notify", path: new URL(req.url).pathname, status: res.status, duration_ms: Date.now() - started });
    return res;
  },
};
