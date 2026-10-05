#!/usr/bin/env node
// Spend guard and ledger shared by fal.mjs, codex.mjs, meshy.mjs, gemini-tts.mjs and procedural-3d-web-game/scripts/elevenlabs.mjs.
// All three services draw on ONE wallet each, shared by every game and every agent running tonight, so:
//   - every paid call is checked against the project's cap BEFORE it is sent (guard),
//   - every paid call is appended to the project ledger and the global ledger (record),
//   - an "exhausted balance" answer stops every other agent on that service (markExhausted),
//     instead of each one retrying into the same 403.
//
// Caps live in <project>/.asset-budget.json (the project root is the nearest folder with that file,
// package.json or .git). Missing file = DEFAULT_CAPS. Raising a cap is the owner's call, not the agent's.
//   { "fal_usd": 10, "codex_images": 30, "meshy_credits": 150, "elevenlabs_credits": 8000, "prices": { "fal-ai/some-model": 0.05 } }
// codex_images is not money: Codex image generation draws on the ChatGPT plan's usage limits, so its
// cap is a count over the last 24 hours (WINDOW), not a lifetime total.
//
//   node spend.mjs budget            this project's caps, spent and remaining
//   node spend.mjs report [--days 7] every project's spend from the global ledger
//   node spend.mjs clear <service>   after a top-up: lets runs on that service start again
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_CAPS = { fal_usd: 5, codex_images: 30, meshy_credits: 100, elevenlabs_credits: 10000, gemini_usd: 2 };
const UNIT = { fal: 'fal_usd', codex: 'codex_images', meshy: 'meshy_credits', elevenlabs: 'elevenlabs_credits', gemini: 'gemini_usd' };
const WINDOW = { codex: { ms: 86400e3, label: ' (last 24h)' } };
const EXHAUSTED_TTL_MS = 30 * 60e3; // re-probe after 30 min even if nobody cleared it

const stateDir = () => process.env.GAME_ASSETS_STATE ?? join(homedir(), '.local/state/game-assets');

export function findRoot(start = process.cwd()) {
  for (let d = resolve(start); ; d = dirname(d)) {
    if (['.asset-budget.json', 'package.json', '.git'].some((f) => existsSync(join(d, f)))) return d;
    if (dirname(d) === d) return resolve(start);
  }
}

export function loadBudget(root = findRoot()) {
  const f = join(root, '.asset-budget.json');
  const own = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  return { caps: { ...DEFAULT_CAPS, ...own }, prices: own.prices ?? {}, file: existsSync(f) ? f : null };
}

const ledgerOf = (root) => join(root, 'assets', 'SPEND.jsonl');
const readLedger = (f) => existsSync(f)
  ? readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

export function spent(root, service) {
  const since = WINDOW[service] ? Date.now() - WINDOW[service].ms : -Infinity;
  return readLedger(ledgerOf(root))
    .filter((e) => e.service === service && (since === -Infinity || Date.parse(e.date) >= since))
    .reduce((s, e) => s + (e.amount ?? 0), 0);
}

// Rough, deliberately conservative USD per output image (Sep 2026). Override per project with "prices".
const FAL_PRICES = [
  [/nano-banana-pro/, 0.15],
  [/nano-banana/, 0.08],
  [/seedream/, 0.07],
  [/birefnet|background\/remove|rembg/, 0.01],
  [/flux\/schnell/, 0.01],
  [/flux/, 0.05],
  [/gpt-image/, (input) => ({ low: 0.02, medium: 0.07 })[input.quality] ?? 0.25],
];
export function falEstimate(model, input = {}, prices = {}) {
  const n = Number(input.num_images ?? 1);
  if (prices[model] != null) return prices[model] * n;
  const hit = FAL_PRICES.find(([re]) => re.test(model));
  const each = hit ? (typeof hit[1] === 'function' ? hit[1](input) : hit[1]) : 0.2;
  const big = /4K/i.test(String(input.resolution ?? '')) ? 2 : 1;
  return each * big * n;
}

const sentinel = (service) => join(stateDir(), `${service}.exhausted`);
export function isExhausted(service) {
  const f = sentinel(service);
  if (!existsSync(f)) return null;
  if (Date.now() - statSync(f).mtimeMs > EXHAUSTED_TTL_MS) { rmSync(f, { force: true }); return null; }
  return readFileSync(f, 'utf8');
}
export function markExhausted(service, detail) {
  mkdirSync(stateDir(), { recursive: true });
  writeFileSync(sentinel(service), `${new Date().toISOString()} ${detail}`.slice(0, 500));
}
export function clearExhausted(service) { rmSync(sentinel(service), { force: true }); }
/** True for the answers that mean "the wallet is empty": stop, don't retry. */
export const looksExhausted = (status, text) =>
  status === 402 || /exhausted|locked|top.?up|insufficient|quota_exceeded|not enough credits|usage limit/i.test(text);

/** Refuses (exit 3) when the service is out of balance or this call would pass the project's cap. */
export function guard({ service, estimate = 0, label = '', dry = false }) {
  const root = findRoot();
  const { caps, file } = loadBudget(root);
  const unit = UNIT[service];
  const cap = caps[unit];
  const used = spent(root, service);
  const ex = isExhausted(service);
  const fmt = (x) => (unit.endsWith('usd') ? `$${x.toFixed(2)}` : `${Math.round(x)}`);
  const line = `${service} ${label}: ≈${fmt(estimate)} · spent ${fmt(used)} of ${fmt(cap)} ${unit}${WINDOW[service]?.label ?? ''} (${file ? basename(file) : 'default caps'})`;
  if (dry) { console.log(`[dry] ${line}${ex ? ' · BALANCE EXHAUSTED' : ''}`); process.exit(0); }
  if (ex) {
    console.error(`${service} balance is exhausted (${ex.trim()}). Stop generating and use existing/fallback assets; ask the owner to top up, then run: node ${fileURLToPath(import.meta.url)} clear ${service}`);
    process.exit(3);
  }
  if (used + estimate > cap) {
    console.error(`Over budget: ${line}. Don't work around this. Ask the owner to raise ${unit} in ${join(root, '.asset-budget.json')}, or reuse/composite existing assets.`);
    process.exit(3);
  }
  console.error(line);
  return { root, service, unit };
}

export function record(ctx, { amount, estimated = true, label, files = [], meta = {} }) {
  const e = { date: new Date().toISOString(), project: basename(ctx.root), service: ctx.service, unit: ctx.unit, amount, estimated, label, files, ...meta };
  const pl = ledgerOf(ctx.root);
  mkdirSync(dirname(pl), { recursive: true });
  appendFileSync(pl, JSON.stringify(e) + '\n');
  mkdirSync(stateDir(), { recursive: true });
  appendFileSync(join(stateDir(), 'spend.jsonl'), JSON.stringify({ ...e, root: ctx.root }) + '\n');
}

/** A cross-process mutex (mkdir is atomic): serializes calls to a service with a low concurrency limit. */
export async function withLock(name, fn, { staleMs = 15 * 60e3 } = {}) {
  const dir = join(stateDir(), `${name}.lock`);
  mkdirSync(stateDir(), { recursive: true });
  for (;;) {
    try { mkdirSync(dir); break; } catch {
      try { if (Date.now() - statSync(dir).mtimeMs > staleMs) rmSync(dir, { recursive: true, force: true }); } catch {}
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  // process.exit() inside fn (e.g. an API error) skips `finally`; release on exit too, or every
  // later call waits out the 15-minute stale timeout.
  const release = () => rmSync(dir, { recursive: true, force: true });
  process.once('exit', release);
  try { return await fn(); } finally { release(); process.removeListener('exit', release); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, arg, val] = process.argv.slice(2);
  if (cmd === 'budget') {
    const root = findRoot();
    const { caps, file } = loadBudget(root);
    console.log(`${root} (${file ?? 'no .asset-budget.json: default caps'})`);
    for (const [s, u] of Object.entries(UNIT)) console.log(`  ${s.padEnd(11)} ${Math.round(spent(root, s) * 100) / 100} of ${caps[u]} ${u}${WINDOW[s]?.label ?? ''}${isExhausted(s) ? '  (balance exhausted)' : ''}`);
  } else if (cmd === 'report') {
    const days = arg === '--days' ? Number(val) : 7;
    const since = Date.now() - days * 86400e3;
    const rows = readLedger(join(stateDir(), 'spend.jsonl')).filter((e) => Date.parse(e.date) >= since);
    const t = {};
    for (const e of rows) { const k = `${e.project}\t${e.unit}`; t[k] = t[k] ?? { n: 0, sum: 0 }; t[k].n++; t[k].sum += e.amount ?? 0; }
    console.log(`last ${days} days (estimates for fal; measured for meshy and elevenlabs)`);
    for (const [k, v] of Object.entries(t).sort()) console.log(`  ${k.replace('\t', '  ')}  ${Math.round(v.sum * 100) / 100}  (${v.n} calls)`);
  } else if (cmd === 'clear' && UNIT[arg]) {
    clearExhausted(arg); console.log(`${arg}: cleared; the next run will try again`);
  } else {
    console.error('usage: spend.mjs <budget|report [--days N]|clear <fal|codex|meshy|elevenlabs|gemini>>'); process.exit(2);
  }
}
