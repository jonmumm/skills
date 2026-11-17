#!/usr/bin/env node
// Batch text-to-speech with Gemini TTS, at BUILD time, into project files (AAC .m4a, mono).
// The key comes from GEMINI_API_KEY (~/.zshenv). It is never printed, written or shipped.
//
//   node gemini-tts.mjs batch --lines lines.json --out-dir public/voice --voice Sulafat \
//        [--style "warm and enthusiastic"] [--model gemini-3.8-flash-tts] [--concurrency 3] [--limit N] [--dry]
//
// lines.json: [{ "id": "a1b2", "text": "How many acorns are there?" }, …]. Each line becomes
// <out-dir>/<id>.m4a; existing files are skipped (re-runs only make what's missing, never re-pay).
// Every call is checked against the project's gemini_usd cap (.asset-budget.json, see spend.mjs) and
// logged with its real token counts. Prices (Oct 2026, gemini-3.8-flash-tts): $0.50/1M text in,
// $9.00/1M audio out, doubling on 2027-01-01; override with "prices": { "<model>": { "in": .., "out": .. } }.
// Rate limits answer 429: waited out and retried. A quota/billing answer marks gemini exhausted for
// every agent (spend.mjs) and stops the batch.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { guard, record, loadBudget, findRoot, looksExhausted, markExhausted } from './spend.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) { const k = rest[i].slice(2); args[k] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; }
const need = (c, m) => { if (!c) { console.error(m); process.exit(2); } };
need(cmd === 'batch' && args.lines && args['out-dir'] && args.voice, 'usage: gemini-tts.mjs batch --lines lines.json --out-dir DIR --voice NAME [--style S] [--model M] [--concurrency N] [--limit N] [--dry]');

const MODEL = args.model ?? 'gemini-3.8-flash-tts';
// Delivery goes in a speech_metadata annotation (v1beta/interactions). Never prepend it to the text:
// Gemini 3.8 TTS reads the text field verbatim, so an instruction there gets spoken aloud.
const STYLE = args.style ?? 'warm, clear and unhurried, like a kind kindergarten teacher talking to a five-year-old';
const DEFAULT_PRICES = { 'gemini-3.8-flash-tts': { in: 0.5, out: 9 }, 'gemini-3.8-flash-lite-tts': { in: 0.5, out: 6 } };
const price = loadBudget(findRoot()).prices[MODEL] ?? DEFAULT_PRICES[MODEL] ?? { in: 1, out: 20 };
// ~14 spoken characters per second at a slow, kid-friendly pace; ~25 audio tokens per second.
const estimateUsd = (text) => (300 + text.length / 4) * price.in / 1e6 + (text.length / 12) * 25 * price.out / 1e6 * 1.5;

const outDir = resolve(args['out-dir']);
const lines = JSON.parse(readFileSync(args.lines, 'utf8'));
let todo = lines.filter((l) => !existsSync(join(outDir, `${l.id}.m4a`)));
if (args.limit) todo = todo.slice(0, Number(args.limit));
const total = todo.reduce((t, l) => t + estimateUsd(l.text), 0);
console.log(`${todo.length} of ${lines.length} lines to make (${MODEL}, voice ${args.voice})`);
if (args.dry) guard({ service: 'gemini', estimate: total, label: `${todo.length} lines`, dry: true });
guard({ service: 'gemini', estimate: total, label: `${todo.length} lines` }); // whole batch must fit before we start
const key = process.env.GEMINI_API_KEY;
need(key, 'GEMINI_API_KEY is not set in this shell. It belongs in ~/.zshenv; never paste it into chat or files.');
mkdirSync(outDir, { recursive: true });

function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function speak(line) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        input: [{ type: 'user_input', content: [{ type: 'text', text: line.text, annotations: [{ type: 'speech_metadata', style: STYLE }] }] }],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice: args.voice }] },
      }),
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    const quota = /quota|billing|exceeded your current/i.test(text) && !/per minute|rate/i.test(text);
    if (res.status === 429 && !quota && attempt < 8) { await new Promise((r) => setTimeout(r, 4000 * (attempt + 1))); continue; }
    if (res.status >= 500 && attempt < 3) { await new Promise((r) => setTimeout(r, 3000)); continue; }
    if (quota || looksExhausted(res.status, text)) markExhausted('gemini', text.slice(0, 200));
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }
}

let done = 0;
let spentUsd = 0;
const queue = [...todo];
async function worker() {
  for (let line = queue.shift(); line; line = queue.shift()) {
    const ctx = guard({ service: 'gemini', estimate: estimateUsd(line.text), label: line.id });
    const json = await speak(line);
    const audio = json.steps?.flatMap((s) => s.content ?? []).find((c) => c.type === 'audio');
    if (!audio?.data) throw new Error(`no audio for ${line.id}: ${JSON.stringify(json).slice(0, 200)}`);
    const bytes = Buffer.from(audio.data, 'base64');
    const tmp = join(outDir, `${line.id}.wav`);
    writeFileSync(tmp, /wav/.test(audio.mime_type ?? '') ? bytes : wav(bytes));
    const ff = spawnSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp, '-ac', '1', '-c:a', 'aac', '-b:a', '48k', join(outDir, `${line.id}.m4a`)]);
    rmSync(tmp, { force: true });
    if (ff.status !== 0) throw new Error(`ffmpeg failed for ${line.id}`);
    const u = json.usage ?? {};
    const usd = ((u.total_input_tokens ?? 0) * price.in + (u.total_output_tokens ?? 0) * price.out) / 1e6;
    spentUsd += usd;
    record(ctx, { amount: usd, estimated: false, label: line.id, files: [`${line.id}.m4a`], meta: { model: MODEL, voice: args.voice, tokens: u.total_output_tokens } });
    if (++done % 25 === 0) console.log(`${done}/${todo.length} · $${spentUsd.toFixed(3)}`);
  }
}
try {
  await Promise.all(Array.from({ length: Number(args.concurrency ?? 3) }, worker));
} catch (e) {
  console.error(String(e.message ?? e));
  console.log(`stopped after ${done}/${todo.length} · $${spentUsd.toFixed(3)}`);
  process.exit(1);
}
console.log(`done ${done}/${todo.length} · $${spentUsd.toFixed(3)}`);
