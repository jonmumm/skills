// Tests for the motion (camera jerk, pop-in), harness-busy and speech extensions of av-verdict.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, detectMotionGlitches, findAsr, judge, parseMetadataSeries, subtractSpans, wordMatch } from "./av-verdict.mjs";

const CLI = fileURLToPath(new URL("./av-verdict.mjs", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "av-verdict-motion-"));
const clean = { duration: 10, hasAudio: true, black: [], white: [], frozen: [], silent: [] };

// ── pure pieces ──

test("parseMetadataSeries reads per-frame values from ffmpeg metadata=print output", () => {
  const log = ["frame:0    pts:1      pts_time:0.04", "lavfi.signalstats.YAVG=1.5", "frame:1    pts:2      pts_time:0.08", "lavfi.signalstats.YAVG=20.25"].join("\n");
  assert.deepEqual(parseMetadataSeries(log, "lavfi.signalstats.YAVG"), [
    { t: 0.04, v: 1.5 },
    { t: 0.08, v: 20.25 },
  ]);
});

test("parseMetadataSeries reads ffmpeg's exponent notation for tiny changes", () => {
  assert.deepEqual(parseMetadataSeries("frame:0 pts:1 pts_time:0.04\nlavfi.signalstats.YAVG=6.94444e-05", "lavfi.signalstats.YAVG"), [{ t: 0.04, v: 6.94444e-5 }]);
});

const steady = (n, v) => Array.from({ length: n }, (_, i) => ({ t: i / 25, v }));
const withAt = (series, i, v) => series.map((s, j) => (j === i ? { ...s, v } : s));

test("a whole-frame jump 9x the median change is a camera jerk", () => {
  const full = withAt(steady(100, 1), 50, 30);
  const centre = withAt(steady(100, 1), 50, 30);
  const g = detectMotionGlitches(full, centre);
  assert.deepEqual(g.map((x) => x.code), ["camera_jerk"]);
  assert.equal(g[0].at, "2.00s");
});

test("a sudden change only in the centre is a pop-in, not a jerk", () => {
  // Centre (a quarter of the frame) jumps by 24; the full-frame mean moves by 24/4 = 6.
  const full = withAt(steady(100, 1), 40, 6.75);
  const centre = withAt(steady(100, 1), 40, 24);
  assert.deepEqual(detectMotionGlitches(full, centre).map((x) => x.code), ["pop_in"]);
});

test("steady motion, small wobbles and long fast moves are not glitches", () => {
  assert.deepEqual(detectMotionGlitches(steady(100, 4), steady(100, 4)), []);
  assert.deepEqual(detectMotionGlitches(withAt(steady(100, 1), 10, 5), withAt(steady(100, 1), 10, 5)), []);
  const whoosh = steady(100, 1).map((s, i) => (i >= 30 && i < 45 ? { ...s, v: 30 } : s));
  assert.deepEqual(detectMotionGlitches(whoosh, whoosh), []);
});

test("subtractSpans removes harness-busy time from frozen spans", () => {
  assert.deepEqual(subtractSpans({ start: 0, end: 10 }, [{ start: 2, end: 4 }, { start: 8, end: 12 }]), [
    { start: 0, end: 2 },
    { start: 4, end: 8 },
  ]);
});

test("judge: motion glitches are warnings unless smooth motion is expected", () => {
  const d = { ...clean, glitches: [{ code: "camera_jerk", at: "2.00s", ratio: 30 }] };
  assert.equal(judge(d, {}).pass, true);
  assert.deepEqual(judge(d, {}).warnings.map((w) => w.code), ["camera_jerk"]);
  assert.deepEqual(judge(d, { expectSmooth: true }).failures.map((f) => f.code), ["camera_jerk"]);
});

test("judge: a freeze while the harness was busy is not the app's fault", () => {
  const d = { ...clean, frozen: [{ start: 0, end: 6 }], busy: [{ start: 0, end: 5.5 }] };
  assert.equal(judge(d, { expectMotion: true }).pass, true);
  const partly = { ...clean, frozen: [{ start: 0, end: 6 }], busy: [{ start: 0, end: 2 }] };
  assert.deepEqual(judge(partly, { expectMotion: true }).failures.map((f) => f.code), ["frozen_with_audio"]);
});

test("wordMatch: in-order word overlap, ignoring case and punctuation", () => {
  assert.equal(wordMatch("The red rocket is ready!", "the red rocket is ready"), 1);
  assert.equal(wordMatch("the red rocket is ready", "the blue rocket"), 0.4);
  assert.equal(wordMatch("", "anything"), 1);
});

test("judge: speech below the match threshold fails; unverified speech is only a warning", () => {
  assert.deepEqual(judge({ ...clean, speech: { status: "heard", ratio: 0.3, heard: "x" } }, {}).failures.map((f) => f.code), ["speech_mismatch"]);
  assert.equal(judge({ ...clean, speech: { status: "heard", ratio: 0.9, heard: "x" } }, {}).pass, true);
  const u = judge({ ...clean, speech: { status: "unverified", reason: "no ASR installed" } }, {});
  assert.equal(u.pass, true);
  assert.deepEqual(u.warnings.map((w) => w.code), ["speech_unverified"]);
});

// ── real clips ──

// A textured still, slowly panned: steady small change every frame (like a drifting camera).
const still = join(dir, "still.png");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=s=1280x720:d=1", "-frames:v", "1", still]);
function pan(name, extraFilter = "", xExpr = "t*12") {
  const out = join(dir, `${name}.mp4`);
  const vf = `crop=640:360:x='${xExpr}':y=100${extraFilter}`;
  execFileSync("ffmpeg", ["-v", "error", "-y", "-loop", "1", "-r", "25", "-i", still, "-f", "lavfi", "-i", "sine=f=440:d=4", "-t", "4", "-vf", vf, "-pix_fmt", "yuv420p", "-shortest", out]);
  return out;
}

test("analyze: a smooth pan has no motion glitches", () => {
  const v = analyze(pan("smooth"), { expectSmooth: true });
  assert.equal(v.pass, true, JSON.stringify(v.failures));
});

test("analyze: a pan that jumps 200 px in one frame is a camera jerk", () => {
  const v = analyze(pan("jerk", "", "t*12+if(gte(n,50),200,0)"), { expectSmooth: true });
  assert.ok(v.failures.some((f) => f.code === "camera_jerk"), JSON.stringify(v));
});

test("analyze: a box appearing in the centre of a steady pan is a pop-in", () => {
  const v = analyze(pan("pop", ",drawbox=x=220:y=110:w=200:h=140:color=red:t=fill:enable='gte(n,50)'"), { expectSmooth: true });
  assert.deepEqual(v.failures.map((f) => f.code), ["pop_in"], JSON.stringify(v));
});

test("CLI --busy ignores frozen spans the harness caused", () => {
  const clip = join(dir, "frozen.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x3366aa:s=320x240:d=4", "-f", "lavfi", "-i", "sine=f=440:d=4", "-t", "4", "-pix_fmt", "yuv420p", clip]);
  const busy = join(dir, "busy.jsonl");
  writeFileSync(busy, `${JSON.stringify({ start: 0, end: 4, what: "whisper" })}\n`);
  const r = spawnSync("node", [CLI, clip, "--expect-motion", "--busy", busy], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout);
});

test("CLI --expect-speech without an ASR reports unverified, and does not fail", () => {
  const text = join(dir, "expected.txt");
  writeFileSync(text, "the red rocket is ready");
  const r = spawnSync("node", [CLI, pan("speechless"), "--expect-speech", text], { encoding: "utf8", env: { ...process.env, AV_VERDICT_ASR: "none" } });
  assert.equal(r.status, 0, r.stdout);
  const v = JSON.parse(r.stdout);
  assert.equal(v.detections.speech.status, "unverified");
});

const asr = findAsr(process.env);
test("expect-speech with a real local ASR matches what was said", { skip: asr.kind === "none" ? `no local ASR: ${asr.reason}` : false, timeout: 180_000 }, () => {
  const aiff = join(dir, "said.aiff");
  const r = spawnSync("say", ["-o", aiff, "The red rocket is ready to launch"]);
  if (r.status !== 0) return; // no macOS TTS: nothing to say
  const clip = join(dir, "said.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x240:d=4", "-i", aiff, "-t", "4", "-pix_fmt", "yuv420p", "-c:a", "aac", clip]);
  const good = join(dir, "good.txt");
  const bad = join(dir, "bad.txt");
  writeFileSync(good, "the red rocket is ready to launch");
  writeFileSync(bad, "purple elephants dance under seven moons tonight");
  const ok = analyze(clip, { expectSpeech: good });
  assert.equal(ok.detections.speech.status, "heard", JSON.stringify(ok.detections.speech));
  assert.ok(ok.detections.speech.ratio >= 0.8, JSON.stringify(ok.detections.speech));
  const wrong = analyze(clip, { expectSpeech: bad });
  assert.ok(wrong.failures.some((f) => f.code === "speech_mismatch"), JSON.stringify(wrong.detections.speech));
});
