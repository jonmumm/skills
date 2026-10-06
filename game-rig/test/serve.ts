import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";

/** Serves test/fixtures/game on a free port: /tv → tv.html, /phone → phone.html. */
export async function serveFixtureGame(): Promise<{ url: string; close: () => Promise<void> }> {
  const dir = new URL("./fixtures/game/", import.meta.url).pathname;
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname.replace(/^\//, "") || "tv";
    try {
      const body = readFileSync(join(dir, `${path.replace(/[^\w-]/g, "")}.html`));
      res.writeHead(200, { "content-type": "text/html" }).end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  const { port } = addr;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) };
}
