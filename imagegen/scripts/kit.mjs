#!/usr/bin/env node
// Generate a kit of images with the no-per-image-cost tools: the local model, Codex, Grok and Muse.
// Never a paid wallet (fal, Gemini API): those stay explicit, one call at a time, through fal.mjs.
//
//   node kit.mjs <kit.json> [--only a,b] [--dry]
//
// kit.json: {
//   "outDir": "assets/gen",              // default assets/gen; outputs are <outDir>/<name>.png
//   "prefix": "Gouache picture book…",   // style bible prefix, prepended to every prompt
//   "tool": "local",                     // default tool; else "local"
//   "license": "commercial",             // shipped in a paid/App Store product → never the
//                                        // non-commercial local Qwen model, not even as a fallback
//   "jobs": [{ "name", "prompt", "tool"?, "refs"?: [paths], "w"?, "h"?, "rgba"? }]
// }   (a bare array of jobs also works)
//
// Tools: local (Qwen-Image 2.1 Turbo via local.mjs, non-commercial), z-image (Z-Image-Turbo via
// local.mjs, Apache-2.0, text-to-image only: named explicitly, never a fallback), codex (codex.mjs),
// grok (`grok -p`), muse (`muse exec`). Each job tries its tool, then the rest of CHAIN. A usage limit (or a local server
// that isn't up) takes that tool out for the rest of the run and moves its jobs on. An answer with
// no image retries once on the next tool. Existing outputs are skipped. Every image is credited in
// assets/art/CREDITS.json (codex.mjs and local.mjs write their own rows).
// Env: GROK_BIN, MUSE_BIN, GEN_PARALLEL (grok/muse concurrency, default 3).
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const file = argv[0];
if (!file || !existsSync(file)) { console.error('usage: kit.mjs <kit.json> [--only a,b] [--dry]'); process.exit(2); }
const raw = JSON.parse(readFileSync(file, 'utf8'));
const kit = Array.isArray(raw) ? { jobs: raw } : raw;
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const dry = argv.includes('--dry');
const OUT = resolve(kit.outDir ?? 'assets/gen');
const N = Number(process.env.GEN_PARALLEL ?? 3);
const CHAIN = ['local', 'codex', 'grok', 'muse'];
const LIMIT = { local: 1, 'z-image': 1, codex: 1, grok: N, muse: N };
const SOURCE = { grok: 'Grok Imagine (grok -p, plan usage)', muse: 'Muse (muse exec, plan usage)' };
const LIMIT_RE = /usage limit|rate limit|quota|exhausted/i;
const commercial = kit.license === 'commercial';
const exhausted = new Set(commercial ? ['local'] : []);
if (commercial) console.error('license "commercial": skipping local Qwen-Image 2.1 (non-commercial license)');

function run(cmd, args, { cwd, timeout = 900e3 } = {}) {
  return new Promise((res) => {
    const c = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (out += d));
    const t = setTimeout(() => c.kill('SIGKILL'), timeout);
    c.on('error', (e) => { clearTimeout(t); res({ code: 127, out: String(e) }); });
    c.on('close', (code) => { clearTimeout(t); res({ code, out }); });
  });
}

function credit(job, tool, dest) {
  const f = resolve('assets/art/CREDITS.json');
  mkdirSync(dirname(f), { recursive: true });
  const all = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : [];
  all.push({ files: [dest.replace(process.cwd() + '/', '')], source: `${SOURCE[tool]} (generated)`, input: { prompt: job.prompt, references: job.refs ?? [] }, date: new Date().toISOString().slice(0, 10) });
  writeFileSync(f, JSON.stringify(all, null, 2) + '\n');
}

const promptOf = (job) => (kit.prefix ? `${kit.prefix} ${job.prompt}` : job.prompt);

async function generate(job, tool) {
  const dest = join(OUT, `${job.name}.png`);
  const prompt = promptOf(job);
  if (tool === 'local' || tool === 'z-image' || tool === 'codex') {
    const script = join(here, tool === 'codex' ? 'codex.mjs' : 'local.mjs');
    const extra = tool !== 'codex'
      ? [...(tool === 'z-image' ? ['--model', 'z-image'] : []), ...(job.w ? ['--w', String(job.w)] : []), ...(job.h ? ['--h', String(job.h)] : []), ...(job.rgba ? ['--rgba'] : [])]
      : [];
    const prompt2 = tool === 'codex' && job.rgba ? `${prompt}. Transparent background.` : prompt;
    const r = await run('node', [script, 'run', '--prompt', prompt2, '--out', dest, ...(job.refs ?? []).flatMap((p) => ['--image', p]), ...extra], { timeout: 900e3 });
    if (r.code === 0 && existsSync(dest)) return 'ok';
    if (r.code === 3 || LIMIT_RE.test(r.out) || /not reachable|did not come up|ComfyUI not found/.test(r.out)) return 'limit';
    console.error(`${job.name} (${tool}): ${r.out.trim().split('\n').slice(-3).join(' | ')}`);
    return 'fail';
  }
  // grok / muse: agent CLIs that save the image into a fresh workspace
  const dir = mkdtempSync(join(tmpdir(), `imagegen-${tool}-`));
  const refs = (job.refs ?? []).map((p, i) => { const q = join(dir, `ref${i}.png`); copyFileSync(p, q); return q; });
  const ask = `Use your image generation tool to generate exactly one image (do not draw it with code). ${prompt}`;
  const save = `Save it as ${job.name}.png in the current directory.`;
  const r = tool === 'muse'
    ? await run(process.env.MUSE_BIN ?? 'muse', ['exec', '--workspace', dir, '--reasoning-effort', 'low', ...refs.flatMap((p) => ['--image', p]), `${ask}. ${save}`], { cwd: dir })
    : await run(process.env.GROK_BIN ?? 'grok', ['--always-approve', '--cwd', dir, '-p', `${ask}. ${save}${refs.length ? ` Reference images: ${refs.join(', ')}.` : ''}`], { cwd: dir });
  // Asked-for name first; else the newest image the agent left in its own folder (Muse:
  // generated_images/call_*.jpg, Grok: images/N.jpg), never one of our references.
  const asked = [`${job.name}.png`, `${job.name}.jpg`, `${job.name}.jpeg`].map((f) => join(dir, f)).find(existsSync);
  const stray = readdirSync(dir, { recursive: true })
    .map((f) => join(dir, String(f)))
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f) && !refs.includes(f) && statSync(f).isFile())
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  const made = asked ?? stray;
  let status = 'fail';
  if (made && statSync(made).size > 0) {
    mkdirSync(OUT, { recursive: true });
    if (made.toLowerCase().endsWith('.png')) { copyFileSync(made, dest); status = 'ok'; }
    else if ((await run('sips', ['-s', 'format', 'png', made, '--out', dest])).code === 0) status = 'ok';
    if (status === 'ok') credit(job, tool, dest);
  } else if (LIMIT_RE.test(r.out)) status = 'limit';
  else console.error(`${job.name} (${tool}): no image. ${readdirSync(dir).join(' ')} | ${r.out.trim().split('\n').slice(-3).join(' | ')}`);
  rmSync(dir, { recursive: true, force: true });
  return status;
}

const jobs = kit.jobs.filter((j) => (!only || only.includes(j.name)) && !existsSync(join(OUT, `${j.name}.png`)));
console.log(`${jobs.length} to generate`);
if (dry) {
  for (const j of jobs) console.log(`[dry] ${j.name} → ${j.tool ?? kit.tool ?? 'local'}${j.refs?.length ? ` (${j.refs.length} refs)` : ''}`);
  process.exit(0);
}

const next = (job) => {
  const first = job.tool ?? kit.tool ?? 'local';
  const zOk = !job.rgba && !job.refs?.length; // z-image has no alpha and no edits
  return [first, ...CHAIN.filter((t) => t !== first)].find((t) => !exhausted.has(t) && !job.tried?.has(t) && (t !== 'z-image' || zOk));
};
const active = { local: 0, 'z-image': 0, codex: 0, grok: 0, muse: 0 };
const results = {};
await new Promise((done) => {
  let running = 0;
  const queue = [...jobs];
  const pump = () => {
    for (let i = 0; i < queue.length; i++) {
      const job = queue[i];
      const tool = next(job);
      if (!tool) { results[job.name] = 'no tool left'; console.log(job.name, results[job.name]); queue.splice(i--, 1); continue; }
      if (active[tool] >= LIMIT[tool]) continue;
      queue.splice(i--, 1); active[tool]++; running++;
      const t0 = Date.now();
      generate(job, tool).then((status) => {
        active[tool]--; running--;
        if (status === 'limit') {
          if (!exhausted.has(tool)) console.error(`${tool}: usage limit / unavailable; moving its jobs to the next tool`);
          exhausted.add(tool); queue.push(job);
        } else if (status === 'fail' && !job.retried) {
          job.retried = true; (job.tried ??= new Set()).add(tool); queue.push(job);
        } else {
          results[job.name] = `${status} (${tool}, ${Math.round((Date.now() - t0) / 1000)}s)`;
          console.log(job.name, results[job.name]);
        }
        pump();
      });
    }
    if (!running && !queue.length) done();
  };
  pump();
});
const bad = Object.entries(results).filter(([, v]) => !v.startsWith('ok'));
if (bad.length) {
  if (bad.some(([, v]) => v === 'no tool left')) console.error('Every free tool is out (usage limits). Stop here and ask the owner; do not switch to fal or another paid service on your own.');
  process.exit(1);
}
