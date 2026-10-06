import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadConfig, parseConfig, viewportsFor } from "../src/config.ts";

const minimal = {
  name: "Test Game",
  baseUrl: "http://localhost:9999",
  roles: { tv: { kind: "tv" }, kid: { kind: "tablet", label: "Kid iPad" } },
  screens: [{ name: "lobby", role: "tv", path: "/tv" }],
};

describe("config", () => {
  test("fills defaults: viewports per kind, the focal hook expression, check list", () => {
    const c = parseConfig(minimal);
    expect(c.focal).toBe("window.__focalRect?.() ?? null");
    expect(viewportsFor(c, "tv").map((v) => `${v.width}x${v.height}`)).toEqual(["1920x1080", "1280x720"]);
    expect(viewportsFor(c, "kid").every((v) => Math.abs(v.width / v.height - 4 / 3) < 0.01 && v.width > v.height)).toBe(true);
    expect(c.screens[0]?.checks).toEqual(["overlay", "text", "tap", "safe-area"]);
  });
  test("phones cover small, tall and landscape sizes", () => {
    const c = parseConfig({ ...minimal, roles: { mom: { kind: "phone" } }, screens: [] });
    const sizes = viewportsFor(c, "mom");
    expect(sizes.some((v) => v.width <= 375)).toBe(true);
    expect(sizes.some((v) => v.width > v.height)).toBe(true);
  });
  test("a screen for an unknown role is rejected with the role's name", () => {
    expect(() => parseConfig({ ...minimal, screens: [{ name: "x", role: "grandma" }] })).toThrow(/grandma/);
  });
  test("BASE URL can be overridden from the environment", () => {
    expect(parseConfig(minimal, { GAME_RIG_URL: "http://127.0.0.1:1234" }).baseUrl).toBe("http://127.0.0.1:1234");
  });
  test("loads a TypeScript config file from a game repo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rig-config-"));
    const file = join(dir, "game-rig.config.ts");
    writeFileSync(file, `const config = ${JSON.stringify(minimal)};\nexport default config;\n`);
    expect((await loadConfig(file)).name).toBe("Test Game");
  });
});
