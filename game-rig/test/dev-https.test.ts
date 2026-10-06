import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

const SCRIPT = new URL("../scripts/dev-https.sh", import.meta.url).pathname;
const run = (env: Record<string, string>) => execFileSync("zsh", [SCRIPT], { cwd: mkdtempSync(join(tmpdir(), "https-")), env: { ...process.env, DRY_RUN: "1", ...env } }).toString();

test("dev-https uses the game's port and its own wrangler state when asked", () => {
  const out = run({ PORT: "8795", PERSIST_TO: ".wrangler/state-https" });
  expect(out).toMatch(/TV: https:\/\/.+\.local:8795\//);
  expect(out).toContain("--port 8795 --local-protocol https");
  expect(out).toContain("--persist-to .wrangler/state-https");
  expect(out).toMatch(/certs for: .+ localhost 127\.0\.0\.1/);
});
test("dev-https defaults to 8787 without a persist dir", () => {
  const out = run({ PORT: "" });
  expect(out).toContain("--port 8787");
  expect(out).not.toContain("--persist-to");
});
