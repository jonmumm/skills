// node --test ~/src/skills/imagegen/scripts/
// Runs local.mjs in a temp project against a fake ComfyUI HTTP server. No GPU, no models.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const LOCAL = join(here, 'local.mjs');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c50000000049454e44ae426082', 'hex');

// mode: ok | error (execution error in history)
// views: the PNGs /view returns, in order (the last one repeats). Default: a 1x1 opaque PNG.
async function fakeComfy(mode = 'ok', views = [PNG]) {
  const seen = { prompts: [], uploads: [], views: 0 };
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, 'http://x');
      const json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
      if (url.pathname === '/system_stats') return json({ system: { comfyui_version: 'fake' } });
      if (url.pathname === '/upload/image') {
        const name = `up${seen.uploads.length}.png`;
        seen.uploads.push(body.length);
        return json({ name, subfolder: '', type: 'input' });
      }
      if (url.pathname === '/prompt') { seen.prompts.push(JSON.parse(body).prompt); return json({ prompt_id: 'p1' }); }
      if (url.pathname === '/history/p1') {
        if (mode === 'error') return json({ p1: { status: { status_str: 'error', messages: [['execution_error', { exception_message: 'boom: out of memory' }]] }, outputs: {} } });
        return json({ p1: { status: { status_str: 'success' }, outputs: { save: { images: [{ filename: 'a_00001_.png', subfolder: '', type: 'output' }] } } } });
      }
      if (url.pathname === '/view') { res.setHeader('content-type', 'image/png'); return res.end(views[Math.min(seen.views++, views.length - 1)]); }
      res.statusCode = 404; res.end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, close: () => { server.closeAllConnections(); server.close(); } };
}

function project() {
  const root = mkdtempSync(join(tmpdir(), 'local-proj-'));
  writeFileSync(join(root, 'package.json'), '{}');
  return root;
}

function run(root, comfyUrl, ...args) {
  return new Promise((resolve) => {
    const p = spawn('node', [LOCAL, ...args], { cwd: root, env: { ...process.env, COMFY_URL: comfyUrl, COMFY_AUTOSTART: '0' } });
    let stdout = '', stderr = '';
    p.stdout.on('data', (d) => { stdout += d; });
    p.stderr.on('data', (d) => { stderr += d; });
    p.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

// An 8-bit RGBA PNG of w x h whose alpha at (x, y) is alpha(x, y).
function rgbaPng(w, h, alpha) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.concat([Buffer.from(type), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(t)); return Buffer.concat([len, t, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + 4 * w));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (1 + 4 * w) + 1 + 4 * x; raw[o] = 200; raw[o + 3] = alpha(x, y); }
  return Buffer.concat([PNG.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const OPAQUE = rgbaPng(8, 8, () => 255);
const CUTOUT = rgbaPng(8, 8, (x, y) => (x > 1 && x < 6 && y > 1 && y < 6 ? 255 : 0)); // subject in the middle, clear border

const node = (graph, type) => Object.values(graph).find((n) => n.class_type === type);

test('run sends the turbo graph and saves the image to --out with a credit', async () => {
  const c = await fakeComfy(); const root = project();
  const r = await run(root, c.url, 'run', '--prompt', 'a paper moon', '--out', 'assets/art/moon.png', '--w', '1344', '--h', '768', '--seed', '5');
  c.close();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readFileSync(join(root, 'assets/art/moon.png')), PNG);
  const g = c.seen.prompts[0];
  assert.equal(node(g, 'TextEncodeQwenImage21').inputs.prompt, 'a paper moon');
  assert.deepEqual([node(g, 'EmptyLatentImage').inputs.width, node(g, 'EmptyLatentImage').inputs.height], [1344, 768]);
  assert.equal(node(g, 'RandomNoise').inputs.noise_seed, 5);
  assert.equal(node(g, 'CFGGuider').inputs.cfg, 1);
  assert.match(node(g, 'UNETLoader').inputs.unet_name, /turbo/);
  assert.match(node(g, 'ManualSigmas').inputs.sigmas, /^1\.0, .*, 0$/);
  const [credit] = JSON.parse(readFileSync(join(root, 'assets/art/CREDITS.json'), 'utf8'));
  assert.deepEqual(credit.files, ['assets/art/moon.png']);
  assert.equal(credit.input.prompt, 'a paper moon');
  assert.equal(credit.input.seed, 5);
  assert.match(credit.source, /qwen-image 2\.1/i);
  assert.match(credit.license, /non-commercial/i);
});

test('--rgba wraps the prompt in the model card transparency phrasing', async () => {
  const c = await fakeComfy(); const root = project();
  const r = await run(root, c.url, 'run', '--prompt', 'a toy rocket', '--rgba', '--out', 'r.png');
  c.close();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(node(c.seen.prompts[0], 'TextEncodeQwenImage21').inputs.prompt,
    'This is an RGBA format image with transparency. a toy rocket. The image has an alpha channel and a transparent background.');
});

test('--image uploads each reference and wires them into the encoder in order (edit mode)', async () => {
  const c = await fakeComfy(); const root = project();
  writeFileSync(join(root, 'a.png'), PNG); writeFileSync(join(root, 'b.png'), PNG);
  const r = await run(root, c.url, 'run', '--prompt', 'put the hat on her', '--image', 'a.png', '--image', 'b.png', '--out', 'e.png');
  c.close();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(c.seen.uploads.length, 2);
  const g = c.seen.prompts[0];
  const enc = node(g, 'TextEncodeQwenImage21').inputs;
  assert.deepEqual(g[enc['images.image_1'][0]].inputs.image, 'up0.png');
  assert.deepEqual(g[enc['images.image_2'][0]].inputs.image, 'up1.png');
  assert.ok(enc.vae, 'edit mode passes the VAE so references become latents');
  assert.equal(enc.resolution, 0, 'references keep their own size');
});

test('without --image no reference inputs are sent', async () => {
  const c = await fakeComfy(); const root = project();
  await run(root, c.url, 'run', '--prompt', 'x', '--out', 'x.png');
  c.close();
  const enc = node(c.seen.prompts[0], 'TextEncodeQwenImage21').inputs;
  assert.equal(Object.keys(enc).filter((k) => k.startsWith('images.')).length, 0);
  assert.equal(enc.vae, undefined);
});

test('refuses to overwrite without --force, and --force overwrites', async () => {
  const c = await fakeComfy(); const root = project();
  writeFileSync(join(root, 'x.png'), 'old');
  const r1 = await run(root, c.url, 'run', '--prompt', 'x', '--out', 'x.png');
  assert.notEqual(r1.status, 0);
  assert.match(r1.stderr, /--force/);
  assert.equal(c.seen.prompts.length, 0);
  const r2 = await run(root, c.url, 'run', '--prompt', 'x', '--out', 'x.png', '--force');
  c.close();
  assert.equal(r2.status, 0, r2.stderr);
  assert.deepEqual(readFileSync(join(root, 'x.png')), PNG);
});

test('--dry sends nothing and writes nothing', async () => {
  const c = await fakeComfy(); const root = project();
  const r = await run(root, c.url, 'run', '--prompt', 'x', '--out', 'x.png', '--dry');
  c.close();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[dry\]/);
  assert.equal(c.seen.prompts.length, 0);
  assert.equal(existsSync(join(root, 'x.png')), false);
});

test('a ComfyUI execution error exits 1 with its message and saves nothing', async () => {
  const c = await fakeComfy('error'); const root = project();
  const r = await run(root, c.url, 'run', '--prompt', 'x', '--out', 'x.png');
  c.close();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /out of memory/);
  assert.equal(existsSync(join(root, 'x.png')), false);
});

test('an unreachable server with autostart off says how to start it', async () => {
  const root = project();
  const r = await run(root, 'http://127.0.0.1:9', 'run', '--prompt', 'x', '--out', 'x.png');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /local\.mjs serve|ComfyUI/);
});

test('rejects a non-png --out and a missing reference image', async () => {
  const c = await fakeComfy(); const root = project();
  const r1 = await run(root, c.url, 'run', '--prompt', 'x', '--out', 'x.jpg');
  const r2 = await run(root, c.url, 'run', '--prompt', 'x', '--image', 'nope.png', '--out', 'x.png');
  c.close();
  assert.equal(r1.status, 2); assert.match(r1.stderr, /\.png/);
  assert.equal(r2.status, 2); assert.match(r2.stderr, /not found/);
});

test('an edit without --w/--h keeps the first reference aspect at about 1 MP (png and jpeg)', async () => {
  const root = project();
  const mk = spawn('python3', ['-I', '-c', `from PIL import Image
Image.new('RGB',(1672,941)).save('wide.png'); Image.new('RGB',(600,900)).save('tall.jpg', quality=80)`], { cwd: root });
  await new Promise((r) => mk.on('close', r));
  for (const [ref, want] of [['wide.png', [1360, 768]], ['tall.jpg', [832, 1248]]]) {
    const c = await fakeComfy();
    const r = await run(root, c.url, 'run', '--prompt', 'repaint', '--image', ref, '--out', `${ref}.out.png`);
    c.close();
    assert.equal(r.status, 0, r.stderr);
    const l = node(c.seen.prompts[0], 'EmptyLatentImage').inputs;
    assert.deepEqual([l.width, l.height], want, ref);
  }
  const c = await fakeComfy();
  await run(root, c.url, 'run', '--prompt', 'x', '--image', 'wide.png', '--w', '512', '--h', '512', '--out', 'forced.png');
  c.close();
  const l = node(c.seen.prompts[0], 'EmptyLatentImage').inputs;
  assert.deepEqual([l.width, l.height], [512, 512], 'explicit --w/--h still win');
});

test('--rgba with an opaque background runs one background-removal pass on the result', async () => {
  const c = await fakeComfy('ok', [OPAQUE, CUTOUT]); const root = project();
  const r = await run(root, c.url, 'run', '--prompt', 'a moonstone', '--rgba', '--out', 'm.png');
  c.close();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(c.seen.prompts.length, 2);
  assert.match(r.stderr, /background/i);
  const enc = node(c.seen.prompts[1], 'TextEncodeQwenImage21').inputs;
  assert.match(enc.prompt, /Remove the background/);
  assert.ok(enc['images.image_1'], 'the first result goes in as the reference');
  assert.deepEqual(readFileSync(join(root, 'm.png')), CUTOUT);
  const credits = JSON.parse(readFileSync(join(root, 'assets/art/CREDITS.json'), 'utf8'));
  assert.equal(credits.length, 1);
  assert.equal(credits[0].input.cutout, true);
});

test('--rgba with a clear border makes no second pass', async () => {
  const c = await fakeComfy('ok', [CUTOUT]); const root = project();
  const r = await run(root, c.url, 'run', '--prompt', 'a moonstone', '--rgba', '--out', 'm.png');
  c.close();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(c.seen.prompts.length, 1);
});

test('cutout removes the background of any image (one edit pass)', async () => {
  const c = await fakeComfy('ok', [CUTOUT]); const root = project();
  writeFileSync(join(root, 'in.png'), OPAQUE);
  const r = await run(root, c.url, 'cutout', 'in.png', '--out', 'cut.png');
  c.close();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(c.seen.prompts.length, 1);
  assert.equal(c.seen.uploads.length, 1);
  assert.match(node(c.seen.prompts[0], 'TextEncodeQwenImage21').inputs.prompt, /Remove the background/);
  assert.deepEqual(readFileSync(join(root, 'cut.png')), CUTOUT);
});

test('--style references come after --image ones and the prompt says not to draw them', async () => {
  const c = await fakeComfy(); const root = project();
  writeFileSync(join(root, 'a.png'), PNG); writeFileSync(join(root, 's.png'), PNG);
  const r = await run(root, c.url, 'run', '--prompt', 'a rowboat', '--image', 'a.png', '--style', 's.png', '--out', 'b.png');
  c.close();
  assert.equal(r.status, 0, r.stderr);
  const g = c.seen.prompts[0]; const enc = node(g, 'TextEncodeQwenImage21').inputs;
  assert.equal(g[enc['images.image_1'][0]].inputs.image, 'up0.png');
  assert.equal(g[enc['images.image_2'][0]].inputs.image, 'up1.png');
  assert.match(enc.prompt, /^Image 2 is only a style reference: do not draw its subject\. Draw a new, separate subject: a rowboat/);
});

test('--style alone does not take the reference aspect (1024 square default)', async () => {
  const root = project();
  const mk = spawn('python3', ['-I', '-c', "from PIL import Image; Image.new('RGB',(1672,941)).save('wide.png')"], { cwd: root });
  await new Promise((r) => mk.on('close', r));
  const c = await fakeComfy();
  const r = await run(root, c.url, 'run', '--prompt', 'a boat', '--style', 'wide.png', '--out', 'b.png');
  c.close();
  assert.equal(r.status, 0, r.stderr);
  const l = node(c.seen.prompts[0], 'EmptyLatentImage').inputs;
  assert.deepEqual([l.width, l.height], [1024, 1024]);
  assert.match(node(c.seen.prompts[0], 'TextEncodeQwenImage21').inputs.prompt, /^Image 1 is only a style reference/);
});

test('--model z-image sends the Z-Image Turbo graph and credits it Apache-2.0', async () => {
  const c = await fakeComfy(); const root = project();
  const r = await run(root, c.url, 'run', '--model', 'z-image', '--prompt', 'deck planks', '--w', '1344', '--h', '768', '--seed', '7', '--out', 'z.png');
  c.close();
  assert.equal(r.status, 0, r.stderr);
  const g = c.seen.prompts[0];
  assert.equal(node(g, 'UNETLoader').inputs.unet_name, 'z_image_turbo_int8_convrot.safetensors');
  assert.equal(node(g, 'CLIPLoader').inputs.type, 'lumina2');
  assert.equal(node(g, 'CLIPTextEncode').inputs.text, 'deck planks');
  assert.equal(node(g, 'ModelSamplingAuraFlow').inputs.shift, 3);
  const k = node(g, 'KSampler').inputs;
  assert.deepEqual([k.steps, k.cfg, k.sampler_name, k.scheduler, k.seed], [8, 1, 'res_multistep', 'simple', 7]);
  const l = node(g, 'EmptySD3LatentImage').inputs;
  assert.deepEqual([l.width, l.height], [1344, 768]);
  assert.equal(node(g, 'TextEncodeQwenImage21'), undefined);
  const [row] = JSON.parse(readFileSync(join(root, 'assets/art/CREDITS.json'), 'utf8'));
  assert.equal(row.license, 'Apache-2.0');
  assert.match(row.source, /Z-Image-Turbo/);
});

test('--model z-image refuses edits, style references and --rgba (it has neither)', async () => {
  const root = project();
  writeFileSync(join(root, 'a.png'), PNG);
  for (const extra of [['--image', 'a.png'], ['--style', 'a.png'], ['--rgba']]) {
    const r = await run(root, 'http://127.0.0.1:9', 'run', '--model', 'z-image', '--prompt', 'x', '--out', 'x.png', ...extra);
    assert.equal(r.status, 2, extra.join(' '));
    assert.match(r.stderr, /z-image/);
  }
  const bad = await run(root, 'http://127.0.0.1:9', 'run', '--model', 'sdxl', '--prompt', 'x', '--out', 'x.png');
  assert.equal(bad.status, 2);
});
