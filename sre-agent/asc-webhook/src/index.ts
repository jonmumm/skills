import { createApp, type Env } from "./app.ts";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const started = Date.now();
    const res = await createApp(env, { fetch: (url, init) => fetch(url, init) })(req);
    console.log({ event: "http.request", service: "sre-asc-webhook", path: new URL(req.url).pathname, status: res.status, duration_ms: Date.now() - started });
    return res;
  },
};
