// node --test ~/src/skills/ai-art-assets/scripts/
// Runs codex.mjs in a temp project against a fake `codex` binary (CODEX_BIN) and a temp CODEX_HOME.
// No network and no ChatGPT usage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, chmodSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CODEX = join(here, 'codex.mjs');
const SPEND = join(here, 'spend.mjs');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082', 'hex');

// FAKE_CODEX: ok (one image) | two (two images) | none (no image) | limit (usage-limit error)
const FAKE = `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
fs.writeFileSync(process.env.FAKE_ARGS, JSON.stringify(process.argv.slice(2)));
const mode = process.env.FAKE_CODEX;
if (mode === 'limit') { console.error("ERROR: You've hit your usage limit. Try again in 3 hours."); process.exit(1); }
const n = { ok: 1, two: 2, none: 0 }[mode];
// a stray image from another session must never be picked up
const other = path.join(process.env.CODEX_HOME, 'generated_images', 'other-session');
fs.mkdirSync(other, { recursive: true }); fs.writeFileSync(path.join(other, 'ig_x.png'), 'not ours');
const thread = 'thread-' + process.pid;
console.log(JSON.stringify({ type: 'thread.started', thread_id: thread }));
for (let i = 0; i < n; i++) {
  const d = path.join(process.env.CODEX_HOME, 'generated_images', thread);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'ig_' + i + '.png'), Buffer.from('${PNG.toString('hex')}', 'hex'));
}
`;

function project({ budget, ledger = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'codex-proj-'));
  const state = mkdtempSync(join(tmpdir(), 'codex-state-'));
  const home = mkdtempSync(join(tmpdir(), 'codex-home-'));
  const bin = join(home, 'fake-codex');
  writeFileSync(bin, FAKE); chmodSync(bin, 0o755);
  writeFileSync(join(root, 'package.json'), '{}');
  if (budget) writeFileSync(join(root, '.asset-budget.json'), JSON.stringify(budget));
  if (ledger.length) { mkdirSync(join(root, 'assets')); writeFileSync(join(root, 'assets/SPEND.jsonl'), ledger.map((e) => JSON.stringify(e)).join('\n') + '\n'); }
  const argsFile = join(home, 'args.json');
  const run = (mode, ...args) => spawnSync('node', [CODEX, ...args], {
    cwd: root, encoding: 'utf8',
    env: { ...process.env, CODEX_BIN: bin, CODEX_HOME: home, FAKE_CODEX: mode, FAKE_ARGS: argsFile, GAME_ASSETS_STATE: state },
  });
  const codexArgs = () => JSON.parse(readFileSync(argsFile, 'utf8'));
  const ledgerRows = () => existsSync(join(root, 'assets/SPEND.jsonl'))
    ? readFileSync(join(root, 'assets/SPEND.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { root, state, home, run, codexArgs, ledgerRows };
}
const today = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86400e3).toISOString();

test('run copies the generated image to --out, logs one image at $0 and a credit', () => {
  const p = project();
  const r = p.run('ok', 'run', '--prompt', 'a paper moon', '--out', 'assets/art/moon.png');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readFileSync(join(p.root, 'assets/art/moon.png')), PNG);
  const [row] = p.ledgerRows();
  assert.equal(row.service, 'codex');
  assert.equal(row.unit, 'codex_images');
  assert.equal(row.amount, 1);
  assert.deepEqual(row.files, ['assets/art/moon.png']);
  const [credit] = JSON.parse(readFileSync(join(p.root, 'assets/art/CREDITS.json'), 'utf8'));
  assert.match(credit.source, /codex/i);
  assert.equal(credit.input.prompt, 'a paper moon');
  assert.deepEqual(credit.files, ['assets/art/moon.png']);
});

test('the prompt reaches codex, and reference images go through -i', () => {
  const p = project();
  writeFileSync(join(p.root, 'ref.png'), PNG);
  const r = p.run('ok', 'run', '--prompt', 'pose B', '--image', 'ref.png', '--image', 'ref.png', '--out', 'x.png');
  assert.equal(r.status, 0, r.stderr);
  const a = p.codexArgs();
  assert.equal(a[0], 'exec');
  assert.equal(a.filter((x) => x === '-i').length, 2);
  assert.ok(a.includes(join(realpathSync(p.root), 'ref.png')));
  assert.ok(a.some((x) => x.includes('pose B')), 'prompt passed to codex');
  assert.ok(a.includes('--skip-git-repo-check'));
});

test('a missing reference image fails before codex runs', () => {
  const p = project();
  const r = p.run('ok', 'run', '--prompt', 'x', '--image', 'nope.png', '--out', 'x.png');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /image not found: nope\.png/);
  assert.equal(existsSync(join(p.home, 'args.json')), false);
});

test('existing --out is never overwritten without --force', () => {
  const p = project();
  writeFileSync(join(p.root, 'x.png'), 'old');
  const r = p.run('ok', 'run', '--prompt', 'x', '--out', 'x.png');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /exists; pass --force/);
  assert.equal(readFileSync(join(p.root, 'x.png'), 'utf8'), 'old');
  assert.equal(p.run('ok', 'run', '--prompt', 'x', '--out', 'x.png', '--force').status, 0);
  assert.deepEqual(readFileSync(join(p.root, 'x.png')), PNG);
});

test('--out must be a .png (gpt-image writes PNG)', () => {
  const p = project();
  const r = p.run('ok', 'run', '--prompt', 'x', '--out', 'x.webp');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /\.png/);
});

test('--dry prints today\'s count against the daily cap and runs nothing', () => {
  const p = project({ budget: { codex_images: 10 }, ledger: [{ service: 'codex', amount: 1, date: today() }, { service: 'codex', amount: 1, date: daysAgo(2) }] });
  const r = p.run('ok', 'run', '--prompt', 'x', '--out', 'x.png', '--dry');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[dry\] codex .*≈1 · spent 1 of 10 codex_images/);
  assert.equal(existsSync(join(p.home, 'args.json')), false);
  assert.equal(p.ledgerRows().length, 2);
});

test('the daily cap refuses a run; yesterday\'s images do not count', () => {
  const full = project({ budget: { codex_images: 2 }, ledger: [{ service: 'codex', amount: 1, date: today() }, { service: 'codex', amount: 1, date: today() }] });
  const r = full.run('ok', 'run', '--prompt', 'x', '--out', 'x.png');
  assert.equal(r.status, 3);
  assert.match(r.stderr, /Over budget: .*spent 2 of 2 codex_images/);
  assert.equal(existsSync(join(full.home, 'args.json')), false);

  const old = project({ budget: { codex_images: 2 }, ledger: [{ service: 'codex', amount: 5, date: daysAgo(1.5) }] });
  assert.equal(old.run('ok', 'run', '--prompt', 'x', '--out', 'x.png').status, 0);
});

test('without .asset-budget.json the default daily cap applies', () => {
  const p = project();
  const r = p.run('ok', 'run', '--prompt', 'x', '--out', 'x.png', '--dry');
  assert.match(r.stdout, /of 30 codex_images \(last 24h\) \(default caps\)/);
});

test('fal spend does not count against codex, and codex images do not count against fal', () => {
  const p = project({ budget: { fal_usd: 1, codex_images: 5 }, ledger: [{ service: 'fal', amount: 0.9, date: today() }] });
  assert.match(p.run('ok', 'run', '--prompt', 'x', '--out', 'x.png', '--dry').stdout, /spent 0 of 5/);
  p.run('ok', 'run', '--prompt', 'x', '--out', 'x.png');
  const b = spawnSync('node', [SPEND, 'budget'], { cwd: p.root, encoding: 'utf8', env: { ...process.env, GAME_ASSETS_STATE: p.state } });
  assert.match(b.stdout, /fal\s+0\.9 of 1 fal_usd/);
  assert.match(b.stdout, /codex\s+1 of 5 codex_images \(last 24h\)/);
});

test('no image produced: fails, records nothing, writes nothing', () => {
  const p = project();
  const r = p.run('none', 'run', '--prompt', 'x', '--out', 'x.png');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no image/i);
  assert.equal(existsSync(join(p.root, 'x.png')), false);
  assert.equal(p.ledgerRows().length, 0);
});

test('several images: saved as name-1, name-2 and counted', () => {
  const p = project();
  const r = p.run('two', 'run', '--prompt', 'x', '--out', 'art/x.png');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(p.root, 'art/x-1.png')) && existsSync(join(p.root, 'art/x-2.png')));
  assert.equal(p.ledgerRows()[0].amount, 2);
});

test('a usage-limit answer stops every later codex run until cleared', () => {
  const p = project();
  const r = p.run('limit', 'run', '--prompt', 'x', '--out', 'x.png');
  assert.equal(r.status, 3);
  assert.match(r.stderr, /usage limit/i);
  assert.ok(existsSync(join(p.state, 'codex.exhausted')));
  const blocked = p.run('ok', 'run', '--prompt', 'x', '--out', 'x.png');
  assert.equal(blocked.status, 3);
  assert.match(blocked.stderr, /balance is exhausted/);
  assert.equal(spawnSync('node', [SPEND, 'clear', 'codex'], { cwd: p.root, env: { ...process.env, GAME_ASSETS_STATE: p.state } }).status, 0);
  assert.equal(p.run('ok', 'run', '--prompt', 'x', '--out', 'x.png').status, 0);
});
