// node --test ~/src/skills/imagegen/scripts/
// Runs kit.mjs in a temp project against fake grok / muse / codex binaries and a fake ComfyUI.
// No network, no plan usage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const KIT = join(here, 'kit.mjs');
// 64x64 RGBA PNG > 0 bytes; kit.mjs only checks that the file exists and is non-empty
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082', 'hex');

// One fake agent CLI for grok and muse. FAKE_<TOOL>=ok|limit|none. Logs its argv + cwd to <tool>.calls.
const fakeAgent = (tool) => `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const argv = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_LOG_DIR + '/${tool}.calls', JSON.stringify({ argv, cwd: process.cwd() }) + '\\n');
const mode = process.env.FAKE_${tool.toUpperCase()} ?? 'ok';
if (mode === 'limit') { console.error('${tool === 'muse' ? 'Subscription quota exhausted' : 'You have hit your usage limit'}'); process.exit(1); }
if (mode === 'none') { console.log('I could not do that.'); process.exit(0); }
if (mode === 'stray') {
  const ws = ${tool === 'muse' ? "argv[argv.indexOf('--workspace') + 1]" : "argv[argv.indexOf('--cwd') + 1]"};
  fs.mkdirSync(path.join(ws, 'generated_images'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'generated_images', 'call_1.png'), Buffer.from('${PNG.toString('hex')}', 'hex'));
  process.exit(0);
}
const text = argv.join(' ');
const name = text.match(/save it as ([\\w.-]+\\.png)/i)[1];
const dir = ${tool === 'muse' ? "argv[argv.indexOf('--workspace') + 1]" : "argv[argv.indexOf('--cwd') + 1]"};
fs.writeFileSync(path.join(dir, name), Buffer.from('${PNG.toString('hex')}', 'hex'));
`;

const fakeCodex = `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
fs.appendFileSync(process.env.FAKE_LOG_DIR + '/codex.calls', JSON.stringify({ argv: process.argv.slice(2) }) + '\\n');
if (process.env.FAKE_CODEX === 'limit') { console.error("You've hit your usage limit."); process.exit(1); }
const thread = 't' + process.pid;
console.log(JSON.stringify({ type: 'thread.started', thread_id: thread }));
const d = path.join(process.env.CODEX_HOME, 'generated_images', thread);
fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(d, 'ig.png'), Buffer.from('${PNG.toString('hex')}', 'hex'));
`;

async function fakeComfy() {
  const seen = { prompts: [] };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://x');
      const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
      if (url.pathname === '/system_stats') return json({});
      if (url.pathname === '/prompt') { seen.prompts.push(JSON.parse(Buffer.concat(chunks)).prompt); return json({ prompt_id: 'p' }); }
      if (url.pathname === '/history/p') return json({ p: { status: { status_str: 'success' }, outputs: { save: { images: [{ filename: 'a.png', subfolder: '', type: 'output' }] } } } });
      if (url.pathname === '/view') return res.end(PNG);
      res.statusCode = 404; res.end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, close: () => { server.closeAllConnections(); server.close(); } };
}

async function project(manifest, { comfy = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'kit-proj-'));
  const bin = mkdtempSync(join(tmpdir(), 'kit-bin-'));
  const logs = mkdtempSync(join(tmpdir(), 'kit-logs-'));
  const codexHome = mkdtempSync(join(tmpdir(), 'kit-codex-'));
  const state = mkdtempSync(join(tmpdir(), 'kit-state-'));
  for (const t of ['grok', 'muse']) { writeFileSync(join(bin, t), fakeAgent(t)); chmodSync(join(bin, t), 0o755); }
  writeFileSync(join(bin, 'codex'), fakeCodex); chmodSync(join(bin, 'codex'), 0o755);
  writeFileSync(join(root, 'package.json'), '{}');
  writeFileSync(join(root, 'kit.json'), JSON.stringify(manifest));
  const c = comfy ? await fakeComfy() : null;
  const run = (env = {}, ...args) => new Promise((resolve) => {
    const p = spawn('node', [KIT, 'kit.json', ...args], {
      cwd: root,
      env: { ...process.env, GROK_BIN: join(bin, 'grok'), MUSE_BIN: join(bin, 'muse'), CODEX_BIN: join(bin, 'codex'), CODEX_HOME: codexHome, GAME_ASSETS_STATE: state, FAKE_LOG_DIR: logs, COMFY_URL: c ? c.url : 'http://127.0.0.1:9', COMFY_AUTOSTART: '0', ...env },
    });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; }); p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  const calls = (t) => existsSync(join(logs, `${t}.calls`)) ? readFileSync(join(logs, `${t}.calls`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const credits = () => JSON.parse(readFileSync(join(root, 'assets/art/CREDITS.json'), 'utf8'));
  return { root, run, calls, credits, comfy: c, close: () => c?.close() };
}

test('each job goes to its tool, lands at <outDir>/<name>.png, and is credited', async () => {
  const p = await project({ outDir: 'art', jobs: [
    { name: 'a', tool: 'grok', prompt: 'a moss texture' },
    { name: 'b', tool: 'muse', prompt: 'a sky plate' },
    { name: 'c', tool: 'local', prompt: 'a rocket', rgba: true },
    { name: 'd', tool: 'codex', prompt: 'an icon' },
  ] });
  const r = await p.run();
  p.close();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const n of 'abcd') assert.ok(existsSync(join(p.root, `art/${n}.png`)), n);
  assert.equal(p.calls('grok').length, 1);
  assert.equal(p.calls('muse').length, 1);
  assert.equal(p.calls('codex').length, 1);
  assert.equal(p.comfy.seen.prompts.length, 1);
  const sources = p.credits().map((c) => `${c.files[0]} ${c.source}`).sort();
  assert.match(sources.join('\n'), /art\/a\.png Grok/);
  assert.match(sources.join('\n'), /art\/b\.png Muse/);
  assert.match(sources.join('\n'), /art\/c\.png Qwen-Image/);
  assert.match(sources.join('\n'), /art\/d\.png Codex/);
});

test('the manifest prefix starts every prompt', async () => {
  const p = await project({ prefix: 'Gouache picture book, soft grain.', jobs: [{ name: 'a', tool: 'local', prompt: 'a fox' }] });
  await p.run();
  p.close();
  const enc = Object.values(p.comfy.seen.prompts[0]).find((n) => n.class_type === 'TextEncodeQwenImage21');
  assert.equal(enc.inputs.prompt, 'Gouache picture book, soft grain. a fox');
});

test('a job without a tool uses the manifest default, else local first', async () => {
  const p = await project({ jobs: [{ name: 'a', prompt: 'x' }] });
  await p.run();
  p.close();
  assert.equal(p.comfy.seen.prompts.length, 1);
  const p2 = await project({ tool: 'grok', jobs: [{ name: 'a', prompt: 'x' }] });
  await p2.run();
  p2.close();
  assert.equal(p2.calls('grok').length, 1);
  assert.equal(p2.comfy.seen.prompts.length, 0);
});

test('a usage limit moves that job and the rest of the tool\'s jobs to the next tool', async () => {
  const p = await project({ jobs: [{ name: 'a', tool: 'grok', prompt: 'x' }, { name: 'b', tool: 'grok', prompt: 'y' }] });
  const r = await p.run({ FAKE_GROK: 'limit', GEN_PARALLEL: '1' });
  p.close();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(p.calls('grok').length, 1, 'grok is not asked again after its limit');
  assert.ok(existsSync(join(p.root, 'assets/gen/a.png')));
  assert.ok(existsSync(join(p.root, 'assets/gen/b.png')));
  assert.match(r.stderr, /grok: usage limit/);
});

test('license "commercial" never uses the non-commercial local model, even as a fallback', async () => {
  const p = await project({ license: 'commercial', jobs: [{ name: 'a', tool: 'local', prompt: 'x' }, { name: 'b', tool: 'grok', prompt: 'y' }] });
  const r = await p.run({ FAKE_GROK: 'limit' });
  p.close();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(p.comfy.seen.prompts.length, 0);
  assert.ok(existsSync(join(p.root, 'assets/gen/a.png')));
  assert.ok(existsSync(join(p.root, 'assets/gen/b.png')));
  assert.match(r.stderr, /non-commercial/);
});

test('existing outputs are skipped; --only limits the run; --dry generates nothing', async () => {
  const p = await project({ jobs: [{ name: 'a', tool: 'grok', prompt: 'x' }, { name: 'b', tool: 'grok', prompt: 'y' }, { name: 'c', tool: 'grok', prompt: 'z' }] });
  mkdirSync(join(p.root, 'assets/gen'), { recursive: true });
  writeFileSync(join(p.root, 'assets/gen/a.png'), 'old');
  const dry = await p.run({}, '--dry');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /2 to generate/);
  assert.equal(p.calls('grok').length, 0);
  await p.run({}, '--only', 'b');
  p.close();
  assert.equal(readFileSync(join(p.root, 'assets/gen/a.png'), 'utf8'), 'old');
  assert.equal(p.calls('grok').length, 1);
  assert.ok(existsSync(join(p.root, 'assets/gen/b.png')));
  assert.ok(!existsSync(join(p.root, 'assets/gen/c.png')));
});

test('references are copied into the agent workspace and named in the prompt', async () => {
  const p = await project({ jobs: [{ name: 'a', tool: 'grok', prompt: 'repaint', refs: ['ref.png'] }, { name: 'b', tool: 'muse', prompt: 'sky', refs: ['ref.png'] }] });
  writeFileSync(join(p.root, 'ref.png'), PNG);
  await p.run();
  p.close();
  const [g] = p.calls('grok');
  assert.match(g.argv.join(' '), /ref0\.png/);
  const [m] = p.calls('muse');
  const img = m.argv[m.argv.indexOf('--image') + 1];
  assert.match(img, /ref0\.png$/);
});

test('an image the agent left in its own folder (generated_images/, images/) is still picked up', async () => {
  const p = await project({ jobs: [{ name: 'a', tool: 'muse', prompt: 'x', refs: ['ref.png'] }] });
  writeFileSync(join(p.root, 'ref.png'), PNG);
  const r = await p.run({ FAKE_MUSE: 'stray' });
  p.close();
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.deepEqual(readFileSync(join(p.root, 'assets/gen/a.png')), PNG, 'the stray image, not the reference');
  assert.equal(p.credits().length, 1);
});

test('a tool that answers without an image is retried once on the next tool, then reported', async () => {
  const p = await project({ jobs: [{ name: 'a', tool: 'grok', prompt: 'x' }] });
  const r = await p.run({ FAKE_GROK: 'none', FAKE_MUSE: 'none', FAKE_CODEX: 'limit', COMFY_URL: 'http://127.0.0.1:9' });
  p.close();
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /a.*(fail|no tool)/);
});

test('every tool exhausted → exit 1, and the plan is to stop, not to use paid services', async () => {
  const p = await project({ jobs: [{ name: 'a', tool: 'grok', prompt: 'x' }] }, { comfy: false });
  const r = await p.run({ FAKE_GROK: 'limit', FAKE_MUSE: 'limit', FAKE_CODEX: 'limit' });
  p.close();
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /no tool left/);
  assert.match(r.stderr, /ask the owner/i);
});

test('tool "z-image" runs the Apache-2.0 local model, also in a commercial kit', async () => {
  const p = await project({ license: 'commercial', jobs: [{ name: 'a', tool: 'z-image', prompt: 'deck planks', w: 1344, h: 768 }] });
  const r = await p.run();
  p.close();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(p.comfy.seen.prompts.length, 1);
  const g = Object.values(p.comfy.seen.prompts[0]);
  assert.equal(g.find((n) => n.class_type === 'UNETLoader').inputs.unet_name, 'z_image_turbo_int8_convrot.safetensors');
  assert.deepEqual(['width', 'height'].map((k) => g.find((n) => n.class_type === 'EmptySD3LatentImage').inputs[k]), [1344, 768]);
  assert.equal(p.credits()[0].license, 'Apache-2.0');
});

test('a z-image job with refs or rgba goes to the next tool (z-image has neither); commercial skips local too', async () => {
  const p = await project({ license: 'commercial', jobs: [{ name: 'a', tool: 'z-image', prompt: 'x', rgba: true }] });
  const r = await p.run();
  p.close();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(p.comfy.seen.prompts.length, 0);
  assert.equal(p.calls('codex').length, 1);
});
