/**
 * `game-rig record`: the config's bot plays the whole flow with every role on its own device,
 * each recorded; the TV's real audio is tapped from Web Audio. Panels are lined up by wall clock,
 * stitched side by side into recordings/latest.mp4, judged by av-verdict, and opened.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserContext, Page } from "playwright";
import { z } from "zod";
import { type GameRigConfig, type SessionRig, viewportsFor } from "./config.ts";
import { launchChrome, newDevice } from "./run-checks.ts";
import { drawtext } from "./sheet.ts";

const AUDIO_TAP = readFileSync(new URL("./page/audio-tap.js", import.meta.url), "utf8");
export const AV_VERDICT = fileURLToPath(new URL("../../verify-on-device/scripts/av-verdict.mjs", import.meta.url));

const Verdict = z.object({ pass: z.boolean(), failures: z.array(z.object({ code: z.string() }).loose()), warnings: z.array(z.object({ code: z.string() }).loose()) }).loose();
export type AvVerdict = z.infer<typeof Verdict>;
const Captured = z.object({ startedAt: z.number(), base64: z.string() }).nullable();

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** One labeled panel per input, scaled to `height`, side by side. Inputs are 0..n-1. */
export function panelFilter(labels: string[], height: number): string {
  const panels = labels.map((label, i) => `[${i}:v]scale=-2:${height},pad=iw+16:ih+56:8:56:color=0x181818,${drawtext(label, 26)}[p${i}]`);
  const inputs = labels.map((_, i) => `[p${i}]`).join("");
  const stack = labels.length === 1 ? `${inputs}null` : `${inputs}hstack=inputs=${labels.length}:shortest=1`;
  return `${panels.join(";")};${stack},pad=ceil(iw/2)*2:ceil(ih/2)*2[out]`;
}

export type RecordOpts = { open?: boolean; raw?: string; out?: string; expectSmooth?: boolean; log?: (s: string) => void };
export type RecordResult = { out: string; panels: string[]; verdict: AvVerdict; marks: { label: string; t: number }[] };

export async function recordSession(config: GameRigConfig, opts: RecordOpts = {}): Promise<RecordResult> {
  if (!config.session) throw new Error("game-rig record: the config has no `session` bot");
  const log = opts.log ?? (() => undefined);
  const out = opts.out ?? config.record.out;
  const raw = opts.raw ?? join(dirname(out), "raw");
  rmSync(raw, { recursive: true, force: true });
  mkdirSync(raw, { recursive: true });
  const audioRole = config.audioRole ?? Object.entries(config.roles).find(([, r]) => r.kind === "tv")?.[0] ?? Object.keys(config.roles)[0];
  // A fake audio sink: the audio clock still runs (so the tap records) but nothing plays aloud.
  const browser = await launchChrome(config, ["--disable-audio-output"]);
  const pages: Record<string, Page> = {};
  const contexts: { role: string; ctx: BrowserContext; startedAt: number; onCamera: boolean }[] = [];
  const marks: { label: string; t: number }[] = [];
  let t0 = 0;
  try {
    for (const [role, r] of Object.entries(config.roles)) {
      const vp = viewportsFor(config, role)[0];
      if (!vp) throw new Error(`role ${role} has no viewport`);
      const size = { width: vp.width, height: vp.height };
      const ctx = await newDevice(browser, config, role, vp, r.offCamera ? {} : { recordVideo: { dir: raw, size } });
      if (role === audioRole) await ctx.addInitScript(AUDIO_TAP);
      const startedAt = Date.now();
      const page = await ctx.newPage();
      await page.setContent('<body style="margin:0;background:#181818;height:100vh"></body>');
      pages[role] = page;
      contexts.push({ role, ctx, startedAt, onCamera: !r.offCamera });
    }
    t0 = Math.max(...contexts.map((c) => c.startedAt));
    // Until the bot loads its first page every panel is blank: harness time, not a frozen game.
    let firstLoad: number | null = null;
    for (const p of Object.values(pages)) p.once("load", () => (firstLoad ??= Date.now()));
    const rig: SessionRig = {
      pages,
      baseUrl: config.baseUrl,
      wait,
      mark: (label) => {
        const t = Math.round((Date.now() - t0) / 100) / 10;
        marks.push({ label, t });
        log(`[${t.toFixed(1)}s] ${label}`);
      },
      startAudio: async (role = audioRole) => {
        const p = role ? pages[role] : undefined;
        if (p && config.audioTap) await p.evaluate(`window.__gameRigAudio.useStream(${config.audioTap})`);
      },
    };
    await config.session(rig);

    const audioPage = audioRole ? pages[audioRole] : undefined;
    const captured = audioPage ? Captured.parse(await audioPage.evaluate("window.__gameRigAudio ? window.__gameRigAudio.stop() : null")) : null;
    const audioPath = join(raw, "tv-audio.webm");
    if (captured) writeFileSync(audioPath, Buffer.from(captured.base64, "base64"));

    const recorded: { role: string; path: string; startedAt: number; label: string }[] = [];
    for (const c of contexts) {
      const video = pages[c.role]?.video();
      await c.ctx.close();
      if (c.onCamera && video) recorded.push({ role: c.role, path: await video.path(), startedAt: c.startedAt, label: config.roles[c.role]?.label ?? c.role });
    }
    writeFileSync(join(raw, "marks.json"), JSON.stringify({ videos: recorded, audio: captured ? { path: audioPath, startedAt: captured.startedAt } : null, marks }, null, 2));

    mkdirSync(dirname(out), { recursive: true });
    const last = Math.max(...recorded.map((r) => r.startedAt));
    const inputs = recorded.flatMap((r) => ["-ss", ((last - r.startedAt) / 1000).toFixed(3), "-i", r.path]);
    const audioArgs = captured ? ["-itsoffset", ((captured.startedAt - last) / 1000).toFixed(3), "-i", audioPath] : [];
    const maps = captured ? ["-map", "[out]", "-map", `${recorded.length}:a`, "-c:a", "aac", "-b:a", "192k"] : ["-map", "[out]"];
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, ...audioArgs, "-filter_complex", panelFilter(recorded.map((r) => r.label), config.record.height), ...maps, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-r", "30", "-shortest", out]);

    const busyPath = join(raw, "busy.jsonl");
    const busyEnd = ((firstLoad ?? last) - last) / 1000 + 0.5;
    writeFileSync(busyPath, `${JSON.stringify({ start: 0, end: Math.max(0, busyEnd), what: "before the first page load" })}\n`);
    const verdictPath = join(raw, "verdict.json");
    const args = [AV_VERDICT, out, "--expect-motion", "--busy", busyPath, "--out", verdictPath];
    if (captured) args.push("--expect-audio");
    if (opts.expectSmooth) args.push("--expect-smooth");
    if (config.record.expectSpeech) args.push("--expect-speech", config.record.expectSpeech);
    spawnSync(process.execPath, args, { encoding: "utf8" });
    // Read the file, not stdout: a child's piped stdout is cut at 64 KB when it calls process.exit.
    const verdict = Verdict.parse(JSON.parse(readFileSync(verdictPath, "utf8")));
    if (opts.open) spawnSync("open", [out]);
    return { out, panels: recorded.map((r) => r.role), verdict, marks };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
