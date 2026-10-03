#!/usr/bin/env node
// Generate images with Codex's built-in image generation (gpt-image), billed to the owner's ChatGPT
// plan instead of a per-image wallet. Needs the Codex CLI logged in with ChatGPT (`codex login status`).
//
//   node codex.mjs run --prompt "..." --out assets/art/moon.png [--image ref.png ...] [--force] [--dry] [--timeout 600]
//
// Codex runs an agent around each request: about 1–2 min per image, and size is a request, not a
// guarantee (a "square" came back 1254²). Ask for a transparent background in the prompt; it does
// return real alpha.
//
// Outputs: Codex saves images to $CODEX_HOME/generated_images/<thread id>/. This script reads the
// thread id from `codex exec --json` and copies only that session's images: one → --out exactly;
// several → name-1.png, name-2.png… Each run is appended to assets/art/CREDITS.json.
// Existing files are never overwritten unless --force.
//
// Spend: not money, but the plan has usage limits shared by every game, so each run is checked
// against the project's codex_images cap (images in the last 24h, see spend.mjs) and logged to
// assets/SPEND.jsonl. A "usage limit" answer stops every other codex run for 30 min (or until
// `spend.mjs clear codex`). Don't retry into it.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { clearExhausted, guard, looksExhausted, markExhausted, record } from './spend.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const args = { image: [] };
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) continue;
  const k = rest[i].slice(2);
  const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
  if (Array.isArray(args[k])) args[k].push(v); else args[k] = v;
}
const need = (c, m, code = 2) => { if (!c) { console.error(m); process.exit(code); } };
need(cmd === 'run', 'usage: codex.mjs run --prompt "..." --out x.png [--image ref.png ...] [--force] [--dry]');
need(typeof args.prompt === 'string', '--prompt "..." is required');
need(typeof args.out === 'string', '--out <file.png> is required');
need(extname(args.out).toLowerCase() === '.png', `--out must end in .png (Codex image generation writes PNG): ${args.out}`);
const refs = args.image.map((p) => { need(existsSync(p), `image not found: ${p}`); return resolve(p); });
const outBase = resolve(args.out);
need(!existsSync(outBase) || args.force, `${args.out} exists; pass --force to regenerate (uses plan quota).`);

const spend = guard({ service: 'codex', estimate: 1, label: `image → ${args.out}`, dry: !!args.dry });

const instruction = [
  'Use your image generation tool exactly once to create the image below.',
  'Do not write code, run commands or edit files. Just generate the image and reply "done".',
  refs.length ? 'The attached images are references: keep the character, palette and style consistent with them.' : '',
  '',
  `Image request: ${args.prompt}`,
].filter((l, i) => l || i === 3).join('\n');

const work = mkdtempSync(join(tmpdir(), 'codex-img-'));
const t0 = Date.now();
const r = spawnSync(process.env.CODEX_BIN ?? 'codex', [
  'exec', '--json', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', work,
  '-c', 'model_reasoning_effort=low',
  ...refs.flatMap((p) => ['-i', p]),
  // `-i <FILE>...` is greedy in codex-cli ≥0.150: without `--` the prompt is read as another image.
  '--', instruction,
], { encoding: 'utf8', timeout: Number(args.timeout ?? 600) * 1000, maxBuffer: 64 << 20, env: process.env });
rmSync(work, { recursive: true, force: true });

const said = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
if (r.status !== 0) {
  if (looksExhausted(0, said)) {
    const m = said.match(/[^\n]*usage limit[^\n]*/i)?.[0] ?? said.slice(-300);
    markExhausted('codex', m.trim());
    console.error(`Codex usage limit reached: ${m.trim()}\nStop generating with codex; use fal (paid) only if the owner says so.`);
    process.exit(3);
  }
  need(false, `codex exec failed (${r.error?.code ?? `exit ${r.status}`}): ${said.trim().split('\n').slice(-5).join('\n')}`, 1);
}

const thread = said.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .find((e) => e?.type === 'thread.started')?.thread_id;
need(thread, 'codex exec --json did not report a thread id; cannot tell which images are ours.', 1);
const dir = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'generated_images', thread);
const made = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => join(dir, f)) : [];
need(made.length, `codex finished but produced no image (thread ${thread}). Its last words:\n${said.trim().split('\n').slice(-3).join('\n')}`, 1);
clearExhausted('codex');

const saved = made.map((src, i) => {
  const p = made.length === 1 ? outBase : resolve(dirname(outBase), `${basename(outBase, '.png')}-${i + 1}.png`);
  mkdirSync(dirname(p), { recursive: true });
  copyFileSync(src, p);
  const rel = p.replace(process.cwd() + '/', '');
  console.log(`saved ${rel}`);
  return rel;
});
record(spend, { amount: made.length, estimated: false, label: 'codex image_generation', files: saved, meta: { usd: 0 } });

const creditsFile = resolve('assets/art/CREDITS.json');
mkdirSync(dirname(creditsFile), { recursive: true });
const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, 'utf8')) : [];
credits.push({ files: saved, source: 'Codex image_generation (gpt-image, ChatGPT plan) (generated)', input: { prompt: args.prompt, references: refs.map((p) => p.replace(process.cwd() + '/', '')) }, date: new Date().toISOString().slice(0, 10) });
writeFileSync(creditsFile, JSON.stringify(credits, null, 2));
console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
