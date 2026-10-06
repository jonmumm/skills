#!/usr/bin/env node
// av-verdict: does a recorded clip show a live picture with sound?
// Usage: av-verdict.mjs <clip> [--expect-motion] [--expect-audio] [--expect-smooth]
//          [--busy spans.jsonl] [--expect-speech words.txt] [--out verdict.json]
// Prints a JSON verdict and exits 1 on any failure. Needs ffmpeg/ffprobe on PATH.
//   --expect-smooth   camera jerks and pop-ins fail (otherwise they are warnings)
//   --busy FILE       JSON lines {start, end} in clip seconds when the harness, not the app, held the
//                     picture (agent thinking, ASR, installs); frozen spans inside them don't count
//   --expect-speech F the words that should be heard; runs a local ASR (whisper.cpp or openai-whisper)
//                     and reports the in-order word match ratio, or "unverified" when none is installed
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIN_SCREEN_S = 1; // shorter black/white spans are fades and cuts
const MIN_FROZEN_WITH_AUDIO_S = 2;
const MAX_SILENT_SHARE = 0.5;
const GLITCH_RATIO = 9; // a frame changing ~9x more than the clip's median frame is a jerk / pop
const GLITCH_MIN_DELTA = 3; // ...and by at least this much mean luma (0-255), so noise can't trip it
const GLITCH_MAX_FRAMES = 3; // longer runs are real fast motion (a whoosh), not a glitch
const MEDIAN_FLOOR = 0.5; // a static scene has median ~0; don't let any change count as 9x
const MIN_SPEECH_MATCH = 0.6;

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

export function judge(d, { expectMotion = false, expectAudio = false, expectSmooth = false } = {}) {
  const failures = [];
  const warnings = [];
  for (const s of d.black) if (length(s) >= MIN_SCREEN_S) failures.push({ code: "black_screen", at: span(s) });
  for (const s of d.white) if (length(s) >= MIN_SCREEN_S) failures.push({ code: "white_screen", at: span(s) });
  const busy = d.busy ?? [];
  const frozen = d.frozen.flatMap((f) => (busy.length ? subtractSpans(f, busy).filter((p) => length(p) >= MIN_SCREEN_S) : [f]));
  for (const s of frozen) {
    const audible = d.hasAudio ? uncovered(s, d.silent) : 0;
    const code = audible >= MIN_FROZEN_WITH_AUDIO_S ? "frozen_with_audio" : "frozen";
    (expectMotion ? failures : warnings).push({ code, at: span(s) });
  }
  if (!d.hasAudio) {
    if (expectAudio) failures.push({ code: "no_audio" });
  } else if (total(d.silent) / d.duration > MAX_SILENT_SHARE) {
    (expectAudio ? failures : warnings).push({ code: "silent", at: d.silent.map(span).join(", ") });
  }
  for (const g of d.glitches ?? []) if (!busy.some((b) => g.t >= b.start && g.t <= b.end)) (expectSmooth ? failures : warnings).push(g);
  if (d.speech?.status === "unverified") warnings.push({ code: "speech_unverified", reason: d.speech.reason });
  else if (d.speech && d.speech.ratio < MIN_SPEECH_MATCH) failures.push({ code: "speech_mismatch", ratio: d.speech.ratio, heard: d.speech.heard });
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

// ── Motion glitches: camera jerk (whole frame jumps) and pop-in (centre jumps, edges don't) ──

/** Per-frame values of `key` from ffmpeg's metadata=print output. */
export function parseMetadataSeries(log, key) {
  const out = [];
  let t = null;
  for (const line of log.split("\n")) {
    const f = line.match(/pts_time:\s*([\d.]+)/);
    if (f) t = num(f[1]);
    const v = line.match(new RegExp(`${key.replace(/\./g, "\\.")}=(-?[\\d.]+(?:e[-+]?\\d+)?)`));
    if (v && t !== null) out.push({ t, v: num(v[1]) });
  }
  return out;
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

/**
 * `full` and `centre` are mean absolute luma change per frame for the whole frame and for its middle
 * quarter (half width × half height). The rest of the frame (the periphery) changes by
 * (4·full − centre) / 3. A jerk moves everything at once; a pop-in moves the centre while the
 * periphery stays put. Runs longer than GLITCH_MAX_FRAMES are motion, not glitches.
 */
export function detectMotionGlitches(full, centre) {
  const n = Math.min(full.length, centre.length);
  const mFull = Math.max(MEDIAN_FLOOR, median(full.slice(0, n).map((s) => s.v)));
  const mCentre = Math.max(MEDIAN_FLOOR, median(centre.slice(0, n).map((s) => s.v)));
  const kindAt = (i) => {
    const f = full[i].v;
    const c = centre[i].v;
    const edge = Math.max(0, (4 * f - c) / 3);
    if (f >= GLITCH_RATIO * mFull && f >= GLITCH_MIN_DELTA && edge >= 0.5 * c) return { code: "camera_jerk", ratio: f / mFull };
    if (c >= GLITCH_RATIO * mCentre && c >= GLITCH_MIN_DELTA && edge < 0.3 * c) return { code: "pop_in", ratio: c / mCentre };
    return null;
  };
  const found = [];
  let i = 0;
  while (i < n) {
    const k = kindAt(i);
    if (!k) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < n && kindAt(j + 1)) j++;
    if (j - i + 1 <= GLITCH_MAX_FRAMES) found.push({ code: k.code, at: `${full[i].t.toFixed(2)}s`, t: full[i].t, ratio: Math.round(k.ratio * 10) / 10 });
    i = j + 1;
  }
  return found;
}

function motionSeries(clip) {
  const dir = mkdtempSync(join(tmpdir(), "av-motion-"));
  const fullFile = join(dir, "full.txt");
  const centreFile = join(dir, "centre.txt");
  const stat = (file) => `tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${file}`;
  const graph = `[0:v]scale=320:-2,format=gray,split[a][b];[a]${stat(fullFile)}[o1];[b]crop=iw/2:ih/2,${stat(centreFile)}[o2]`;
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", clip, "-an", "-filter_complex", graph, "-map", "[o1]", "-f", "null", "-", "-map", "[o2]", "-f", "null", "-"], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg motion pass failed on ${clip}: ${r.stderr.slice(-500)}`);
  const read = (f) => parseMetadataSeries(readFileSync(f, "utf8"), "lavfi.signalstats.YAVG");
  const out = { full: read(fullFile), centre: read(centreFile) };
  rmSync(dir, { recursive: true, force: true });
  return out;
}

// ── Harness-busy spans (from escuchame's video-qa) ──

/** `seg` minus every span in `holes`. */
export function subtractSpans(seg, holes) {
  let pieces = [seg];
  for (const h of holes) {
    pieces = pieces.flatMap((p) => {
      if (h.end <= p.start || h.start >= p.end) return [p];
      const out = [];
      if (h.start > p.start) out.push({ start: p.start, end: h.start });
      if (h.end < p.end) out.push({ start: h.end, end: p.end });
      return out;
    });
  }
  return pieces;
}

export function readBusy(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .filter((s) => Number.isFinite(s?.start) && Number.isFinite(s?.end))
    .map((s) => ({ start: s.start, end: s.end }));
}

// ── Speech: a local ASR, never a paid API ──

const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, " ").split(/\s+/).filter(Boolean);

/** Share of expected words heard, in order (longest common subsequence of words). */
export function wordMatch(expected, heard) {
  const a = words(expected);
  const b = words(heard);
  if (a.length === 0) return 1;
  let prev = new Array(b.length + 1).fill(0);
  for (const wa of a) {
    const row = [0];
    for (let j = 0; j < b.length; j++) row.push(wa === b[j] ? prev[j] + 1 : Math.max(prev[j + 1], row[j]));
    prev = row;
  }
  return Math.round((prev[b.length] / a.length) * 100) / 100;
}

const onPath = (bin, env) => {
  const r = spawnSync("sh", ["-c", `command -v ${bin}`], { encoding: "utf8", env });
  return r.status === 0 ? r.stdout.trim() : null;
};

/**
 * Finds a local speech recognizer. Never downloads a model: a missing model is "none" with its size.
 * AV_VERDICT_ASR=none forces "none"; WHISPER_CPP_MODEL points at a ggml model for whisper.cpp;
 * WHISPER_MODEL picks the openai-whisper model (default base.en, ≈140 MB in ~/.cache/whisper).
 */
export function findAsr(env = process.env) {
  if (env.AV_VERDICT_ASR === "none") return { kind: "none", reason: "AV_VERDICT_ASR=none" };
  for (const bin of ["whisper-cli", "whisper-cpp"]) {
    const path = onPath(bin, env);
    if (path && env.WHISPER_CPP_MODEL && existsSync(env.WHISPER_CPP_MODEL)) return { kind: "whisper.cpp", bin: path, model: env.WHISPER_CPP_MODEL };
  }
  const path = onPath("whisper", env);
  if (path) {
    const model = env.WHISPER_MODEL ?? "base.en";
    if (existsSync(join(homedir(), ".cache", "whisper", `${model}.pt`))) return { kind: "openai-whisper", bin: path, model };
    return { kind: "none", reason: `openai-whisper is installed but model ${model} is not downloaded (base.en ≈140 MB; run \`whisper --model ${model}\` once)` };
  }
  return { kind: "none", reason: "no local ASR (install whisper.cpp and set WHISPER_CPP_MODEL, or pip install openai-whisper in a venv)" };
}

export function transcribe(clip, asr) {
  const dir = mkdtempSync(join(tmpdir(), "av-asr-"));
  try {
    const wav = join(dir, "speech.wav");
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", clip, "-vn", "-ac", "1", "-ar", "16000", wav]);
    if (asr.kind === "whisper.cpp") {
      execFileSync(asr.bin, ["-m", asr.model, "-f", wav, "-oj", "-of", join(dir, "speech"), "-np"], { stdio: "ignore" });
      const j = JSON.parse(readFileSync(join(dir, "speech.json"), "utf8"));
      return (j.transcription ?? []).map((t) => t.text).join(" ").trim();
    }
    execFileSync(asr.bin, [wav, "--model", asr.model, "--output_format", "json", "--output_dir", dir, "--fp16", "False", "--verbose", "False", ...(asr.model.endsWith(".en") ? [] : ["--language", "en"])], { stdio: "ignore" });
    return String(JSON.parse(readFileSync(join(dir, "speech.json"), "utf8")).text ?? "").trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function speechCheck(clip, expectedFile, env = process.env) {
  const asr = findAsr(env);
  if (asr.kind === "none") return { status: "unverified", reason: asr.reason };
  const heard = transcribe(clip, asr);
  return { status: "heard", asr: `${asr.kind}:${asr.model}`, ratio: wordMatch(readFileSync(expectedFile, "utf8"), heard), heard };
}

export function analyze(clip, expectations = {}) {
  const { duration, hasAudio } = probe(clip);
  const audioArgs = hasAudio ? ["-af", "silencedetect=n=-50dB:d=1"] : ["-an"];
  const main = parseDetections(ffmpegLog(clip, ["-vf", "blackdetect=d=0.5:pix_th=0.10,freezedetect=n=0.003:d=1", ...audioArgs]), duration);
  const white = parseDetections(ffmpegLog(clip, ["-an", "-vf", "negate,blackdetect=d=0.5:pix_th=0.10"]), duration).black;
  const { full, centre } = motionSeries(clip);
  const detections = { duration, hasAudio, ...main, white, glitches: detectMotionGlitches(full, centre), busy: expectations.busy ?? [] };
  if (expectations.expectSpeech) detections.speech = speechCheck(clip, expectations.expectSpeech);
  return { clip, ...judge(detections, expectations), detections };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const valued = new Set(["--out", "--busy", "--expect-speech"]);
  const clip = args.find((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
  if (!clip) {
    console.error("usage: av-verdict.mjs <clip> [--expect-motion] [--expect-audio] [--expect-smooth] [--busy spans.jsonl] [--expect-speech words.txt] [--out verdict.json]");
    process.exit(2);
  }
  const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
  const busyFile = value("--busy");
  const verdict = analyze(clip, {
    expectMotion: args.includes("--expect-motion"),
    expectAudio: args.includes("--expect-audio"),
    expectSmooth: args.includes("--expect-smooth"),
    busy: busyFile ? readBusy(busyFile) : [],
    expectSpeech: value("--expect-speech"),
  });
  const json = JSON.stringify(verdict, null, 2);
  const outIdx = args.indexOf("--out");
  if (outIdx !== -1) writeFileSync(args[outIdx + 1], json);
  console.log(json);
  process.exit(verdict.pass ? 0 : 1);
}
