import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { defineConfig, parseConfig } from "../src/config.ts";
import { panelFilter, recordSession } from "../src/record-session.ts";
import { serveFixtureGame } from "./serve.ts";

let game: Awaited<ReturnType<typeof serveFixtureGame>>;
beforeAll(async () => {
  game = await serveFixtureGame();
});
afterAll(async () => game.close());

test("panelFilter lines panels up by wall clock and labels them", () => {
  const f = panelFilter(["TV", "Grown-up: phone"], 720);
  expect(f).toContain("hstack=inputs=2");
  expect(f).toContain("text='Grown-up  phone'");
});

test("records every on-camera role side by side with the TV's real audio, then judges the clip", async () => {
  const dir = mkdtempSync(join(tmpdir(), "rig-rec-"));
  const config = parseConfig(defineConfig({
    name: "Fixture",
    baseUrl: game.url,
    roles: { tv: { kind: "tv", viewports: [{ width: 640, height: 360 }] }, mom: { kind: "phone", label: "Mom phone" }, baby: { kind: "phone", offCamera: true } },
    record: { out: join(dir, "latest.mp4"), height: 360 },
    session: async (rig) => {
      await rig.pages.tv?.goto(`${rig.baseUrl}/tv`);
      await rig.pages.tv?.evaluate("window.beep()");
      rig.mark("beep");
      await rig.pages.mom?.goto(`${rig.baseUrl}/phone`);
      await rig.pages.baby?.goto(`${rig.baseUrl}/phone`);
      await rig.wait(400);
      await rig.pages.mom?.getByRole("button", { name: "Ready" }).click();
      rig.mark("ready");
      await rig.wait(3500);
    },
  }));
  const result = await recordSession(config, { open: false, raw: join(dir, "raw") });
  expect(result.out).toBe(join(dir, "latest.mp4"));
  expect(existsSync(result.out)).toBe(true);
  const streams = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width", "-of", "csv=p=0", result.out]).toString();
  expect(streams).toContain("audio");
  // Two panels (TV + Mom), the off-camera phone is not in the picture.
  expect(result.panels).toEqual(["tv", "mom"]);
  expect(result.verdict.pass).toBe(true);
  const marks = JSON.parse(readFileSync(join(dir, "raw", "marks.json"), "utf8"));
  expect(marks.marks.map((m: { label: string }) => m.label)).toEqual(["beep", "ready"]);
  expect(existsSync(join(dir, "raw", "verdict.json"))).toBe(true);
}, 120_000);
