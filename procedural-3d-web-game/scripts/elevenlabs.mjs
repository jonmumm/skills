#!/usr/bin/env node
// Generate game audio with ElevenLabs at BUILD time and save it as project files.
// The API key comes from the ELEVENLABS_API_KEY environment variable. It is never printed,
// never written to disk, and must never be shipped in a client bundle or committed.
//
//   node scripts/elevenlabs.mjs check
//   node scripts/elevenlabs.mjs sfx   --prompt "soft wooden pop, cartoon, 0.4s tail, no music" --out assets/audio/pop.mp3 [--duration 1] [--loop]
//   node scripts/elevenlabs.mjs music --prompt "gentle lullaby, music box and soft strings, 70 BPM, no intro, loopable, instrumental" --duration 60 --out assets/audio/lullaby.mp3
//   node scripts/elevenlabs.mjs tts   --voice <voice_id> --text "Your turn!" --out assets/audio/vo/your-turn.mp3
//   node scripts/elevenlabs.mjs voices                      (list available voice ids and names)
//
// Every generated file is appended to assets/audio/CREDITS.json (prompt, kind, date), so the
// credits file is always complete. Existing files are never overwritten unless --force is passed,
// because each generation costs credits.
//
// Spend: paid calls run one at a time across every agent on this machine (the plan's concurrency limit is
// 2-4, and parallel calls just fail with 429), are checked against the project's elevenlabs_credits cap
// (.asset-budget.json, see ai-art-assets/scripts/spend.mjs), and log the credits they actually used
// (the subscription counter before and after) to assets/SPEND.jsonl. --dry prints the budget and exits.
// Music is the expensive kind: keep loops 30-60 s and crossfade them, rather than asking for 120 s.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { guard, record, withLock, looksExhausted, markExhausted, clearExhausted } from '../../ai-art-assets/scripts/spend.mjs';

const BASE = 'https://api.elevenlabs.io/v1';
const [cmd, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) { const k = rest[i].slice(2); args[k] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; }

const key = process.env.ELEVENLABS_API_KEY;
function need(cond, msg) { if (!cond) { console.error(msg); process.exit(2); } }
need(cmd, 'usage: elevenlabs.mjs <check|sfx|music|tts|voices> [options]');
need(key, 'ELEVENLABS_API_KEY is not set in this shell. It belongs in ~/.zshenv (read by every shell, including non-interactive ones); ask the owner to add it there and restart the session; never paste the key into chat or files.');

async function call(method, path, body, accept = 'audio/mpeg') {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.ok) return res;
    const text = (await res.text()).slice(0, 400);
    // Concurrency 429s (another process outside this script) are free to retry; quota/401 are not.
    if (res.status === 429 && /concurrent/.test(text) && attempt < 6) { await new Promise((r) => setTimeout(r, 5000 * (attempt + 1))); continue; }
    if (looksExhausted(res.status, text)) markExhausted('elevenlabs', text.slice(0, 200));
    console.error(`ElevenLabs ${method} ${path} failed: HTTP ${res.status} ${text}`);
    process.exit(1);
  }
}
const used = async () => (await (await call('GET', '/user/subscription', null, 'application/json')).json()).character_count ?? 0;

/** One paid generation: budget check, then (under the machine-wide lock) measure credits around the call. */
async function paid(label, run) {
  const spend = guard({ service: 'elevenlabs', label, dry: !!args.dry });
  await withLock('elevenlabs', async () => {
    const before = await used();
    await run();
    const cost = (await used()) - before;
    clearExhausted('elevenlabs');
    record(spend, { amount: cost, estimated: false, label, files: [args.out] });
    console.log(`  ${cost} credits`);
  });
}

function outPath() {
  need(args.out, '--out <file.mp3> is required');
  const p = resolve(args.out);
  need(!existsSync(p) || args.force, `${args.out} exists; pass --force to regenerate (costs credits).`);
  mkdirSync(dirname(p), { recursive: true });
  return p;
}

async function save(res, p, meta) {
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(p, buf);
  const creditsFile = resolve('assets/audio/CREDITS.json');
  mkdirSync(dirname(creditsFile), { recursive: true });
  const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, 'utf8')) : [];
  credits.push({ file: args.out, source: 'ElevenLabs (generated)', ...meta, date: new Date().toISOString().slice(0, 10) });
  writeFileSync(creditsFile, JSON.stringify(credits, null, 2));
  console.log(`saved ${args.out} (${Math.round(buf.length / 1024)} KB)`);
}

if (cmd === 'check') {
  const res = await call('GET', '/user', null, 'application/json');
  const u = await res.json();
  const s = u.subscription ?? {};
  console.log(`key OK · tier ${s.tier ?? '?'} · characters used ${s.character_count ?? '?'} of ${s.character_limit ?? '?'}`);
  guard({ service: 'elevenlabs', label: 'check', dry: true });
} else if (cmd === 'voices') {
  const res = await call('GET', '/voices', null, 'application/json');
  const { voices = [] } = await res.json();
  for (const v of voices) console.log(`${v.voice_id}  ${v.name}${v.labels ? '  ' + Object.values(v.labels).join(', ') : ''}`);
} else if (cmd === 'sfx') {
  need(args.prompt, '--prompt is required');
  const p = outPath();
  const body = { text: args.prompt, prompt_influence: Number(args.influence ?? 0.4) };
  if (args.duration) body.duration_seconds = Number(args.duration);
  if (args.loop) body.loop = true;
  await paid(`sfx ${args.out}`, async () => save(await call('POST', '/sound-generation', body), p, { kind: 'sfx', prompt: args.prompt }));
} else if (cmd === 'music') {
  need(args.prompt, '--prompt is required');
  const p = outPath();
  const body = { prompt: args.prompt };
  if (args.duration) {
    const d = Number(args.duration);
    need(d >= 3 && d <= 600, '--duration must be 3–600 seconds');
    body.music_length_ms = Math.round(d * 1000);
  }
  await paid(`music ${args.out}`, async () => save(await call('POST', '/music', body), p, { kind: 'music', prompt: args.prompt }));
} else if (cmd === 'tts') {
  need(args.voice && args.text, '--voice <voice_id> and --text are required (list voices with `voices`)');
  const p = outPath();
  const body = { text: args.text, model_id: args.model ?? 'eleven_multilingual_v2' };
  await paid(`tts ${args.out}`, async () => save(await call('POST', `/text-to-speech/${encodeURIComponent(args.voice)}`, body), p, { kind: 'voice', voice: args.voice, text: args.text }));
} else {
  need(false, `unknown command ${cmd}`);
}
