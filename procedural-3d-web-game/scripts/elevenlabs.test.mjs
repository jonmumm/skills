// node --test ~/src/skills/procedural-3d-web-game/scripts/*.test.mjs
// Runs the real elevenlabs.mjs against a fake ElevenLabs API on localhost (ELEVENLABS_BASE). Never the paid API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'elevenlabs.mjs');

/**
 * Like the real account: generations bill `cost(req)` credits, but /user/subscription keeps
 * returning the old character_count for `lagReads` reads after each generation (or forever).
 */
async function fakeElevenLabs({ cost, lagReads = 3, never = false, header = null } = {}) {
  const s = { count: 26303, pending: 0, staleReads: 0, generations: 0 };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method === 'GET' && req.url === '/user/subscription') {
        if (s.pending && !never && s.staleReads-- <= 0) { s.count += s.pending; s.pending = 0; }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ character_count: s.count, character_limit: 40000 }));
      }
      if (req.method === 'POST') {
        s.generations++;
        s.pending += cost(req.url, JSON.parse(body));
        s.staleReads = lagReads;
        res.writeHead(200, { 'content-type': 'audio/mpeg', ...(header ?? {}) });
        return res.end(Buffer.from('ID3fake'));
      }
      res.writeHead(404); res.end('{}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { s, base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

function project({ budget, ledger = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'el-proj-'));
  const state = mkdtempSync(join(tmpdir(), 'el-state-'));
  writeFileSync(join(root, 'package.json'), '{}');
  if (budget) writeFileSync(join(root, '.asset-budget.json'), JSON.stringify(budget));
  if (ledger.length) { mkdirSync(join(root, 'assets')); writeFileSync(join(root, 'assets/SPEND.jsonl'), ledger.map((e) => JSON.stringify(e)).join('\n') + '\n'); }
  const run = (api, ...args) => new Promise((done) => execFile('node', [SCRIPT, ...args], {
    cwd: root, encoding: 'utf8', timeout: 20000,
    env: { ...process.env, ELEVENLABS_API_KEY: 'test-not-a-key', ELEVENLABS_BASE: api.base, GAME_ASSETS_STATE: state, ELEVENLABS_POLL_MS: '20', ELEVENLABS_SETTLE_MS: '1500' },
  }, (err, stdout, stderr) => done({ status: err ? err.code : 0, stdout, stderr })));
  const ledgerRows = () => existsSync(join(root, 'assets/SPEND.jsonl'))
    ? readFileSync(join(root, 'assets/SPEND.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { root, run, ledgerRows };
}

const TEXT = 'The town falls asleep. Con artist, open your eyes.'; // 50 characters

test('tts: a counter that updates late is still recorded at its real cost (the Little Vigilante under-count)', async (t) => {
  const api = await fakeElevenLabs({ cost: (_, b) => b.text.length, lagReads: 3 });
  t.after(api.close);
  const p = project();
  const r = await p.run(api, 'tts', '--voice', 'v1', '--text', TEXT, '--out', 'assets/audio/vo/a.mp3');
  assert.equal(r.status, 0, r.stderr);
  const [row] = p.ledgerRows();
  assert.equal(row.amount, 50);
  assert.equal(row.estimated, false);
  assert.equal(row.source, 'counter');
});

test('a run of calls records the account counter\'s total, not ~0 per call', async (t) => {
  const api = await fakeElevenLabs({ cost: (_, b) => b.text.length, lagReads: 2 });
  t.after(api.close);
  const p = project();
  const before = api.s.count;
  for (let i = 0; i < 4; i++) {
    const r = await p.run(api, 'tts', '--voice', 'v1', '--text', TEXT.slice(0, 20 + i * 10), '--out', `vo/${i}.mp3`);
    assert.equal(r.status, 0, r.stderr);
  }
  const total = p.ledgerRows().reduce((s, e) => s + e.amount, 0);
  assert.equal(api.s.count - before, 20 + 30 + 40 + 50);
  assert.equal(total, api.s.count - before);
});

test('a cost header on the response is used as the cost, without waiting on the counter', async (t) => {
  const api = await fakeElevenLabs({ cost: () => 57, never: true, header: { 'character-cost': '57' } });
  t.after(api.close);
  const p = project();
  const r = await p.run(api, 'tts', '--voice', 'v1', '--text', TEXT, '--out', 'a.mp3');
  assert.equal(r.status, 0, r.stderr);
  const [row] = p.ledgerRows();
  assert.equal(row.amount, 57);
  assert.equal(row.estimated, false);
  assert.equal(row.source, 'header');
});

test('a counter that never moves within the timeout records the request estimate, flagged as estimated', async (t) => {
  const api = await fakeElevenLabs({ cost: () => 999, never: true });
  t.after(api.close);
  const p = project();
  const sfx = await p.run(api, 'sfx', '--prompt', 'gavel', '--duration', '2', '--out', 'gavel.mp3');
  assert.equal(sfx.status, 0, sfx.stderr);
  const auto = await p.run(api, 'sfx', '--prompt', 'owl', '--out', 'owl.mp3');
  const music = await p.run(api, 'music', '--prompt', 'noir lullaby', '--duration', '60', '--out', 'night.mp3');
  const tts = await p.run(api, 'tts', '--voice', 'v1', '--text', TEXT, '--out', 'a.mp3');
  assert.equal(auto.status + music.status + tts.status, 0);
  const rows = p.ledgerRows();
  assert.deepEqual(rows.map((e) => e.amount), [80, 100, 1000, 50]);
  assert.ok(rows.every((e) => e.estimated === true && e.source === 'estimate'));
});

test('the guard refuses once the cap is reached, before any generation request', async (t) => {
  const api = await fakeElevenLabs({ cost: () => 10 });
  t.after(api.close);
  const p = project({ budget: { elevenlabs_credits: 1875 }, ledger: [{ service: 'elevenlabs', amount: 1875 }] });
  const r = await p.run(api, 'tts', '--voice', 'v1', '--text', TEXT, '--out', 'a.mp3');
  assert.equal(r.status, 3);
  assert.match(r.stderr, /Over budget/);
  assert.equal(api.s.generations, 0);
});

test('the guard refuses a call whose estimate would pass the cap', async (t) => {
  const api = await fakeElevenLabs({ cost: () => 10 });
  t.after(api.close);
  const p = project({ budget: { elevenlabs_credits: 500 }, ledger: [{ service: 'elevenlabs', amount: 0 }] });
  const r = await p.run(api, 'music', '--prompt', 'x', '--duration', '60', '--out', 'm.mp3');
  assert.equal(r.status, 3);
  assert.match(r.stderr, /≈1000 · spent 0 of 500/);
  assert.equal(api.s.generations, 0);
});

test('measured spend makes the next call hit the cap (the cap is enforced, not just logged)', async (t) => {
  const api = await fakeElevenLabs({ cost: (_, b) => b.text.length, lagReads: 3 });
  t.after(api.close);
  const p = project({ budget: { elevenlabs_credits: 120 } });
  for (const i of [0, 1]) assert.equal((await p.run(api, 'tts', '--voice', 'v1', '--text', TEXT, '--out', `${i}.mp3`)).status, 0);
  const third = await p.run(api, 'tts', '--voice', 'v1', '--text', TEXT, '--out', '2.mp3');
  assert.equal(third.status, 3);
  assert.equal(api.s.generations, 2);
});
