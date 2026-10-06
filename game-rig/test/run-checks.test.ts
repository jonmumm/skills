import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { parseConfig } from "../src/config.ts";
import { runChecks } from "../src/run-checks.ts";
import { serveFixtureGame } from "./serve.ts";

let game: Awaited<ReturnType<typeof serveFixtureGame>>;
beforeAll(async () => {
  game = await serveFixtureGame();
});
afterAll(async () => game.close());

const config = (query: string) =>
  parseConfig({
    name: "Fixture",
    baseUrl: game.url,
    roles: { tv: { kind: "tv" }, mom: { kind: "phone", viewports: [{ width: 393, height: 852 }] } },
    screens: [
      { name: "tv-play", role: "tv", path: `/tv${query}`, checks: ["overlay", "safe-area", "text"] },
      { name: "phone-seat", role: "mom", path: `/phone${query}`, checks: ["text", "tap"], focal: false },
    ],
  });

describe("runChecks over a config", () => {
  test("a bad build fails every check that should catch it, per screen and viewport", async () => {
    const out = mkdtempSync(join(tmpdir(), "rig-check-"));
    const report = await runChecks(config("?bad=1"), { out });
    expect(report.pass).toBe(false);
    const codes = report.results.flatMap((r) => r.failures.map((f) => `${r.screen}@${r.viewport}:${f.code}`));
    expect(codes).toContain("tv-play@1920x1080:overlay_covers_focal");
    expect(codes).toContain("tv-play@1280x720:overlay_covers_focal");
    expect(codes).toContain("tv-play@1280x720:outside_tv_safe_area");
    expect(codes.some((c) => c.startsWith("tv-play@1920x1080:outside_tv_safe_area"))).toBe(false); // safe area is a 720p check
    expect(codes).toContain("phone-seat@393x852:clipped_text");
    expect(codes).toContain("phone-seat@393x852:repeated_label");
    expect(codes).toContain("phone-seat@393x852:no_tap_feedback");
    expect(existsSync(join(out, "tv-play", "tv-1280x720.png"))).toBe(true);
    expect(existsSync(join(out, "report.json"))).toBe(true);
  });
  test("the good build passes", async () => {
    const report = await runChecks(config(""), { out: mkdtempSync(join(tmpdir(), "rig-check-")) });
    expect(report.results.flatMap((r) => r.failures)).toEqual([]);
    expect(report.pass).toBe(true);
  });
});
