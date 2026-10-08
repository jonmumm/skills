// node --test ~/src/skills/ai-art-assets/scripts/
// Runs the real scripts in a temp project with a temp state dir. No network: every case stops before a request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { falEstimate, elevenlabsEstimate, withLock } from './spend.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const FAL = join(here, 'fal.mjs');
const SPEND = join(here, 'spend.mjs');

function project({ budget, ledger = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'spend-proj-'));
  const state = mkdtempSync(join(tmpdir(), 'spend-state-'));
  writeFileSync(join(root, 'package.json'), '{}');
  if (budget) writeFileSync(join(root, '.asset-budget.json'), JSON.stringify(budget));
  if (ledger.length) { mkdirSync(join(root, 'assets')); writeFileSync(join(root, 'assets/SPEND.jsonl'), ledger.map((e) => JSON.stringify(e)).join('\n') + '\n'); }
  const run = (script, ...args) => spawnSync('node', [script, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, FAL_KEY: 'test-not-a-key', GAME_ASSETS_STATE: state } });
  return { root, state, run };
}

test('fal --dry prints the estimate against the project cap and spends nothing', () => {
  const p = project({ budget: { fal_usd: 2 } });
  const r = p.run(FAL, 'run', 'fal-ai/nano-banana-pro', '--prompt', 'x', '--out', 'a.png', '--dry');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[dry\] fal .*≈\$0\.15 · spent \$0\.00 of \$2\.00 fal_usd/);
  assert.equal(existsSync(join(p.root, 'assets/SPEND.jsonl')), false);
});

test('fal refuses a run that would pass the cap, before any request', () => {
  const p = project({ budget: { fal_usd: 1 }, ledger: [{ service: 'fal', amount: 0.9 }] });
  const r = p.run(FAL, 'run', 'fal-ai/nano-banana-pro', '--prompt', 'x', '--out', 'a.png');
  assert.equal(r.status, 3);
  assert.match(r.stderr, /Over budget: .*spent \$0\.90 of \$1\.00/);
  assert.match(r.stderr, /Ask the owner to raise fal_usd/);
});

test('without .asset-budget.json the default cap ($5) applies', () => {
  const p = project({ ledger: [{ service: 'fal', amount: 4.95 }] });
  const r = p.run(FAL, 'run', 'fal-ai/nano-banana-2', '--prompt', 'x', '--out', 'a.png');
  assert.equal(r.status, 3);
  assert.match(r.stderr, /default caps/);
});

test('other services in the ledger do not count against fal', () => {
  const p = project({ budget: { fal_usd: 1 }, ledger: [{ service: 'meshy', amount: 900 }, { service: 'elevenlabs', amount: 5000 }] });
  const r = p.run(FAL, 'run', 'fal-ai/nano-banana-2', '--prompt', 'x', '--out', 'a.png', '--dry');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /spent \$0\.00 of \$1\.00/);
});

test('an exhausted balance stops every later run until cleared', () => {
  const p = project({ budget: { fal_usd: 50 } });
  writeFileSync(join(p.state, 'fal.exhausted'), 'User is locked. Reason: Exhausted balance');
  const blocked = p.run(FAL, 'run', 'fal-ai/nano-banana-2', '--prompt', 'x', '--out', 'a.png');
  assert.equal(blocked.status, 3);
  assert.match(blocked.stderr, /balance is exhausted/);
  assert.equal(p.run(SPEND, 'clear', 'fal').status, 0);
  const dry = p.run(FAL, 'run', 'fal-ai/nano-banana-2', '--prompt', 'x', '--out', 'a.png', '--dry');
  assert.doesNotMatch(dry.stdout, /EXHAUSTED/);
});

test('budget shows spent and caps per service', () => {
  const p = project({ budget: { fal_usd: 10, meshy_credits: 150 }, ledger: [{ service: 'fal', amount: 1.25 }, { service: 'meshy', amount: 30 }] });
  const r = p.run(SPEND, 'budget');
  assert.match(r.stdout, /fal\s+1\.25 of 10 fal_usd/);
  assert.match(r.stdout, /meshy\s+30 of 150 meshy_credits/);
  assert.match(r.stdout, /elevenlabs\s+0 of 10000 elevenlabs_credits/);
});

test('falEstimate: price table, quality tiers, 4K, num_images and project overrides', () => {
  assert.equal(falEstimate('fal-ai/nano-banana-pro/edit', {}), 0.15);
  assert.equal(falEstimate('fal-ai/nano-banana-pro', { resolution: '4K' }), 0.3);
  assert.equal(falEstimate('fal-ai/nano-banana-2', { num_images: 4 }), 0.32);
  assert.equal(falEstimate('openai/gpt-image-2.5/sunburst/edit', { quality: 'high' }), 0.25);
  assert.equal(falEstimate('openai/gpt-image-2.5/sunburst/edit', { quality: 'low' }), 0.02);
  assert.equal(falEstimate('fal-ai/birefnet/v2', {}), 0.01);
  assert.equal(falEstimate('someone/new-model', {}), 0.2);
  assert.equal(falEstimate('someone/new-model', {}, { 'someone/new-model': 0.04 }), 0.04);
});

test('elevenlabsEstimate: characters for tts, seconds for sfx and music, project overrides', () => {
  assert.equal(elevenlabsEstimate('tts', { text: 'Your turn!' }), 10);
  assert.equal(elevenlabsEstimate('sfx', {}), 100);
  assert.equal(elevenlabsEstimate('sfx', { duration_seconds: 1.5 }), 60);
  assert.equal(elevenlabsEstimate('sfx', { duration_seconds: 2 }, { elevenlabs_sfx_per_s: 11 }), 22);
  assert.equal(elevenlabsEstimate('music', { music_length_ms: 30000 }), 500);
  assert.equal(elevenlabsEstimate('music', {}, { elevenlabs_music_per_min: 800 }), 800);
});

test('withLock runs callers one at a time', async () => {
  process.env.GAME_ASSETS_STATE = mkdtempSync(join(tmpdir(), 'spend-lock-'));
  let inside = 0, max = 0;
  const job = () => withLock('t', async () => { inside++; max = Math.max(max, inside); await new Promise((r) => setTimeout(r, 30)); inside--; });
  await Promise.all([job(), job(), job()]);
  assert.equal(max, 1);
});

// gemini-tts.mjs: batch text-to-speech with Gemini, guarded like the others.
const GEMINI = join(here, 'gemini-tts.mjs');
function geminiProject(budget, lines, existing = []) {
  const p = project({ budget });
  writeFileSync(join(p.root, 'lines.json'), JSON.stringify(lines));
  mkdirSync(join(p.root, 'voice'), { recursive: true });
  for (const id of existing) writeFileSync(join(p.root, 'voice', `${id}.m4a`), 'x');
  return p;
}
const LINES = [
  { id: 'a1', text: 'How many acorns are there?' },
  { id: 'b2', text: 'What number comes after 39?' },
  { id: 'c3', text: 'Nice trying! Next one.' },
];

test('gemini-tts --dry counts the lines still to make, estimates cost against gemini_usd, spends nothing', () => {
  const p = geminiProject({ gemini_usd: 2 }, LINES, ['a1']);
  const r = p.run(GEMINI, 'batch', '--lines', 'lines.json', '--out-dir', 'voice', '--voice', 'Sulafat', '--dry');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 of 3 lines to make/);
  assert.match(r.stdout, /\[dry\] gemini .*spent \$0\.00 of \$2\.00 gemini_usd/);
});

test('gemini-tts refuses a batch whose estimate passes the cap, before any request', () => {
  const many = Array.from({ length: 4000 }, (_, i) => ({ id: `l${i}`, text: 'Which group has the same number as this one? '.repeat(3) }));
  const p = geminiProject({ gemini_usd: 0.05 }, many);
  const r = p.run(GEMINI, 'batch', '--lines', 'lines.json', '--out-dir', 'voice', '--voice', 'Sulafat');
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /Over budget/);
});

test('gemini-tts needs GEMINI_API_KEY for a real run (and never prints it)', () => {
  const p = geminiProject({ gemini_usd: 2 }, LINES);
  const r = spawnSync('node', [GEMINI, 'batch', '--lines', 'lines.json', '--out-dir', 'voice', '--voice', 'Sulafat'], { cwd: p.root, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: '', GAME_ASSETS_STATE: p.state } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /GEMINI_API_KEY is not set/);
});

test('budget lists gemini with its default cap', () => {
  const p = project();
  const r = p.run(SPEND, 'budget');
  assert.match(r.stdout, /gemini\s+0 of 2 gemini_usd/);
});
