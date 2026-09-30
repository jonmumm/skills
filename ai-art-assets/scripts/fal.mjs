#!/usr/bin/env node
// Generate images (and other media) with fal.ai and save them as project files.
// The key comes from the FAL_KEY environment variable. It is never printed, never written to disk,
// and must never be shipped in a client bundle, committed, logged or pasted into chat.
//
//   node fal.mjs check
//   node fal.mjs run <model-id> --prompt "..." --out assets/art/sea/sky.png [--image ref.png --image-field image_urls] [--set key=value ...] [--force]
//   node fal.mjs run <model-id> --json input.json --out assets/art/hero/sheet.png
//
// Model ids change often (e.g. "fal-ai/<family>/<variant>"). Look the current one up on
// https://fal.ai/explore and read its API tab for the exact input fields before a run.
//
// Inputs:
//   --prompt       sets input.prompt
//   --image <p>    local file or URL; repeatable. Local files are sent as data URIs.
//   --image-field  which input field gets the images (default image_urls = array; use image_url for one)
//   --set k=v      any other input field (numbers and true/false are parsed)
//   --json <file>  a whole input object; any string "@file:<path>" inside it becomes a data URI
//
// Outputs: every media URL in the result is downloaded. One output → --out exactly; several →
// name-1.ext, name-2.ext… Each run is appended to assets/art/CREDITS.json with the model and
// prompt. Data URIs (e.g. photos of a child) are never written to the credits file.
// Existing files are never overwritten unless --force (each run costs credits).
//
// Spend: every run is checked against the project's fal_usd cap (.asset-budget.json, see spend.mjs) and
// logged to assets/SPEND.jsonl. --dry prints the estimate and exits. An "exhausted balance" answer
// stops every other fal run on this machine for 30 min (or until `spend.mjs clear fal`).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, extname, basename } from 'node:path';
import { guard, record, falEstimate, loadBudget, looksExhausted, markExhausted, clearExhausted } from './spend.mjs';

const [cmd, model, ...rest] = process.argv.slice(2);
const args = { image: [], set: [] };
const all = cmd === 'run' ? rest : [model, ...rest].filter(Boolean);
for (let i = 0; i < all.length; i++) {
  if (!all[i].startsWith('--')) continue;
  const k = all[i].slice(2);
  const v = all[i + 1] && !all[i + 1].startsWith('--') ? all[++i] : true;
  if (Array.isArray(args[k])) args[k].push(v); else args[k] = v;
}
const need = (c, m) => { if (!c) { console.error(m); process.exit(2); } };
need(cmd === 'check' || cmd === 'run', 'usage: fal.mjs <check|run> [model-id] [options]');
const key = process.env.FAL_KEY;
need(key, 'FAL_KEY is not set in this shell. It belongs in ~/.zshenv (read by every shell, including non-interactive ones); ask the owner to add it there and restart the session; never paste the key into chat or files.');

if (cmd === 'check') {
  console.log('FAL_KEY is set (not validated; the first run will fail with HTTP 401 if it is wrong).');
  guard({ service: 'fal', label: 'check', dry: true });
}
need(model && !model.startsWith('--'), 'run needs a model id, e.g. fal.mjs run fal-ai/<model> --prompt ...');
need(args.out, '--out <file> is required');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const dataUri = (p) => {
  if (/^https?:|^data:/.test(p)) return p;
  need(existsSync(p), `image not found: ${p}`);
  return `data:${MIME[extname(p).toLowerCase()] ?? 'application/octet-stream'};base64,${readFileSync(p).toString('base64')}`;
};
const fileRefs = (v) => typeof v === 'string' ? (v.startsWith('@file:') ? dataUri(v.slice(6)) : v)
  : Array.isArray(v) ? v.map(fileRefs) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fileRefs(x)])) : v;
const scrub = (v) => typeof v === 'string' ? (v.startsWith('data:') ? '<local image>' : v)
  : Array.isArray(v) ? v.map(scrub) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrub(x)])) : v;

let input = args.json ? JSON.parse(readFileSync(args.json, 'utf8')) : {};
if (args.prompt) input.prompt = args.prompt;
for (const kv of args.set) { const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1); input[k] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v); }
input = fileRefs(input);
if (args.image.length) { const f = args['image-field'] ?? 'image_urls'; const imgs = args.image.map(dataUri); input[f] = f.endsWith('s') ? imgs : imgs[0]; }

const outBase = resolve(args.out);
need(!existsSync(outBase) || args.force, `${args.out} exists; pass --force to regenerate (costs credits).`);
const estimate = falEstimate(model, input, loadBudget().prices);
const spend = guard({ service: 'fal', estimate, label: `${model} → ${args.out}`, dry: !!args.dry });

const H = { authorization: `Key ${key}`, 'content-type': 'application/json' };
async function j(method, url, body) {
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) {
    if (looksExhausted(res.status, text)) markExhausted('fal', text.slice(0, 200));
    console.error(`fal ${method} ${url.replace(/requests\/.*/, 'requests/…')} failed: HTTP ${res.status} ${text.slice(0, 400)}`);
    process.exit(1);
  }
  return JSON.parse(text);
}

const t0 = Date.now();
const sub = await j('POST', `https://queue.fal.run/${model}`, input);
const timeoutMs = Number(args.timeout ?? 600) * 1000;
for (;;) {
  const st = await j('GET', `${sub.status_url}?logs=0`);
  if (st.status === 'COMPLETED') break;
  if (!['IN_QUEUE', 'IN_PROGRESS'].includes(st.status)) { console.error(`fal request ended with status ${st.status}`); process.exit(1); }
  if (Date.now() - t0 > timeoutMs) { console.error(`timed out after ${args.timeout ?? 600}s; request ${sub.request_id} may still finish on fal`); process.exit(1); }
  await new Promise((r) => setTimeout(r, 2000));
}
const result = await j('GET', sub.response_url);
clearExhausted('fal');
record(spend, { amount: estimate, estimated: true, label: model, files: [args.out] });

const urls = [];
(function walk(v) { if (!v || typeof v !== 'object') return; if (typeof v.url === 'string' && /^https?:/.test(v.url)) urls.push(v); for (const x of Object.values(v)) walk(x); })(result);
need(urls.length, `no media in result: ${JSON.stringify(result).slice(0, 300)}`);

const saved = [];
for (const [i, u] of urls.entries()) {
  const ext = extname(outBase) || extname(new URL(u.url).pathname) || '.png';
  const p = urls.length === 1 ? outBase : resolve(dirname(outBase), `${basename(outBase, extname(outBase))}-${i + 1}${ext}`);
  mkdirSync(dirname(p), { recursive: true });
  const res = await fetch(u.url); need(res.ok, `download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer()); writeFileSync(p, buf);
  saved.push(p); console.log(`saved ${p.replace(process.cwd() + '/', '')} (${Math.round(buf.length / 1024)} KB${u.width ? `, ${u.width}x${u.height}` : ''})`);
}
const creditsFile = resolve('assets/art/CREDITS.json');
mkdirSync(dirname(creditsFile), { recursive: true });
const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, 'utf8')) : [];
credits.push({ files: saved.map((p) => p.replace(process.cwd() + '/', '')), source: `fal.ai ${model} (generated)`, input: scrub(input), seed: result.seed, date: new Date().toISOString().slice(0, 10) });
writeFileSync(creditsFile, JSON.stringify(credits, null, 2));
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
