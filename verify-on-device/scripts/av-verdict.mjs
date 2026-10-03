#!/usr/bin/env node
// av-verdict: does a recorded clip show a live picture with sound?
// Usage: av-verdict.mjs <clip> [--expect-motion] [--expect-audio] [--out verdict.json]
// Prints a JSON verdict and exits 1 on any failure. Needs ffmpeg/ffprobe on PATH.
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MIN_SCREEN_S = 1; // shorter black/white spans are fades and cuts
const MIN_FROZEN_WITH_AUDIO_S = 2;
const MAX_SILENT_SHARE = 0.5;

const num = (s) => Number.parseFloat(s);

export function parseDetections(log, duration) {
  const black = [];
  const frozen = [];
  const silent = [];
  let freezeStart = null;
  let silenceStart = null;
  for (const line of log.split("\n")) {
    const b = line.match(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)/);
    if (b) black.push({ start: num(b[1]), end: num(b[2]) });
    const fs = line.match(/freeze_start:\s*([\d.]+)/);
    if (fs) freezeStart = num(fs[1]);
    const fe = line.match(/freeze_end:\s*([\d.]+)/);
    if (fe && freezeStart !== null) {
      frozen.push({ start: freezeStart, end: num(fe[1]) });
      freezeStart = null;
    }
    const ss = line.match(/silence_start:\s*([\d.]+)/);
    if (ss) silenceStart = num(ss[1]);
    const se = line.match(/silence_end:\s*([\d.]+)/);
    if (se && silenceStart !== null) {
      silent.push({ start: silenceStart, end: num(se[1]) });
      silenceStart = null;
    }
  }
  if (freezeStart !== null) frozen.push({ start: freezeStart, end: duration });
  if (silenceStart !== null) silent.push({ start: silenceStart, end: duration });
  return { black, frozen, silent };
}

const length = (seg) => seg.end - seg.start;
const total = (segs) => segs.reduce((sum, s) => sum + length(s), 0);

// Seconds of `seg` not covered by any of `cover`.
function uncovered(seg, cover) {
  const overlap = cover.reduce((sum, c) => sum + Math.max(0, Math.min(seg.end, c.end) - Math.max(seg.start, c.start)), 0);
  return length(seg) - overlap;
}

const span = (s) => `${s.start.toFixed(1)}–${s.end.toFixed(1)}s`;

export function judge(d, { expectMotion = false, expectAudio = false } = {}) {
  const failures = [];
  const warnings = [];
  for (const s of d.black) if (length(s) >= MIN_SCREEN_S) failures.push({ code: "black_screen", at: span(s) });
  for (const s of d.white) if (length(s) >= MIN_SCREEN_S) failures.push({ code: "white_screen", at: span(s) });
  for (const s of d.frozen) {
    const audible = d.hasAudio ? uncovered(s, d.silent) : 0;
    const code = audible >= MIN_FROZEN_WITH_AUDIO_S ? "frozen_with_audio" : "frozen";
    (expectMotion ? failures : warnings).push({ code, at: span(s) });
  }
  if (!d.hasAudio) {
    if (expectAudio) failures.push({ code: "no_audio" });
  } else if (total(d.silent) / d.duration > MAX_SILENT_SHARE) {
    (expectAudio ? failures : warnings).push({ code: "silent", at: d.silent.map(span).join(", ") });
  }
  return { pass: failures.length === 0, failures, warnings };
}

function ffmpegLog(clip, args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", clip, ...args, "-f", "null", "-"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${clip}: ${r.stderr.slice(-500)}`);
  return r.stderr;
}

export function probe(clip) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", clip], { encoding: "utf8" });
  const info = JSON.parse(out);
  const duration = num(info?.format?.duration);
  if (!Number.isFinite(duration)) throw new Error(`no duration for ${clip}`);
  const streams = Array.isArray(info.streams) ? info.streams : [];
  return { duration, hasAudio: streams.some((s) => s?.codec_type === "audio") };
}

export function analyze(clip, expectations = {}) {
  const { duration, hasAudio } = probe(clip);
  const audioArgs = hasAudio ? ["-af", "silencedetect=n=-50dB:d=1"] : ["-an"];
  const main = parseDetections(ffmpegLog(clip, ["-vf", "blackdetect=d=0.5:pix_th=0.10,freezedetect=n=0.003:d=1", ...audioArgs]), duration);
  const white = parseDetections(ffmpegLog(clip, ["-an", "-vf", "negate,blackdetect=d=0.5:pix_th=0.10"]), duration).black;
  const detections = { duration, hasAudio, ...main, white };
  return { clip, ...judge(detections, expectations), detections };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const clip = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--out");
  if (!clip) {
    console.error("usage: av-verdict.mjs <clip> [--expect-motion] [--expect-audio] [--out verdict.json]");
    process.exit(2);
  }
  const verdict = analyze(clip, { expectMotion: args.includes("--expect-motion"), expectAudio: args.includes("--expect-audio") });
  const json = JSON.stringify(verdict, null, 2);
  const outIdx = args.indexOf("--out");
  if (outIdx !== -1) writeFileSync(args[outIdx + 1], json);
  console.log(json);
  process.exit(verdict.pass ? 0 : 1);
}
