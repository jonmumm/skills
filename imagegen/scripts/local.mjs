#!/usr/bin/env node
// Local image generation with Qwen-Image 2.1 Turbo through ComfyUI on this Mac. No per-image cost,
// no plan quota, no network after the one-time weight download.
//
//   node local.mjs run --prompt "..." --out x.png [--model qwen|z-image] [--w 1024 --h 1024]
//                      [--seed N] [--rgba] [--image ref.png ...] [--style ref.png ...] [--force] [--dry]
//   node local.mjs cutout in.png --out x.png      # remove the background (Qwen edit), real alpha
//   node local.mjs serve | stop | status
//
// --rgba    wraps the prompt in the model card's transparency phrasing; the PNG has real alpha.
//           If the border still comes back opaque, one background-removal pass runs on the result.
// --image   edit / multi-reference mode (up to 10): "replace her shirt with the one in image 2".
//           The output keeps the first --image's aspect at ~1 MP unless --w/--h are given.
// --style   a reference for look only: the prompt tells the model not to draw its subject.
// --model   qwen (default): Qwen-Image 2.1 Turbo, edits and alpha, NON-COMMERCIAL licence.
//           z-image: Z-Image-Turbo, Apache-2.0 (shippable), text-to-image only.
//
// Every CREDITS.json row carries the model's licence, so shipped assets can be audited.
//
// Env: COMFY_URL (default http://127.0.0.1:8188), COMFY_DIR (default ~/src/ComfyUI, with .venv),
// COMFY_AUTOSTART=0 to never start the server. Setup is in SKILL.md "Local models".
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { inflateSync } from 'node:zlib';
import { basename, dirname, extname, join, resolve } from 'node:path';

const URL_ = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const DIR = process.env.COMFY_DIR ?? join(homedir(), 'src/ComfyUI');
const LOG = join(homedir(), '.cache/comfyui.log');
const QWEN = {
  unet: 'qwen_image_2.1_turbo_int8_convrot.safetensors',
  clip: 'qwen3vl_8b_int8_convrot.safetensors',
  vae: 'qwen_image_2.1_vae_bf16.safetensors',
  // The turbo checkpoint's distilled 8-step schedule (Comfy-Org template). Don't change steps without it.
  sigmas: '1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0',
};
const MODELS = {
  qwen: { source: 'Qwen-Image 2.1 Turbo (local ComfyUI, int8) (generated)', license: 'Qwen Research License: non-commercial (research or evaluation) only' },
  'z-image': {
    source: 'Z-Image-Turbo (local ComfyUI, int8) (generated)', license: 'Apache-2.0',
    unet: 'z_image_turbo_int8_convrot.safetensors', clip: 'qwen_3_4b.safetensors', vae: 'ae.safetensors',
  },
};
const CUTOUT_PROMPT = 'Remove the background, and output a PNG image'; // Comfy-Org background-removal template

const [cmd, ...rest] = process.argv.slice(2);
const args = { image: [], style: [], _: [] };
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) { args._.push(rest[i]); continue; }
  const k = rest[i].slice(2);
  const v = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
  if (Array.isArray(args[k])) args[k].push(v); else args[k] = v;
}
const die = (m, code = 1) => { console.error(m); process.exit(code); };
const need = (c, m, code = 2) => { if (!c) die(m, code); };

async function up() {
  try { return (await fetch(`${URL_}/system_stats`, { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
}

async function serve() {
  if (await up()) return;
  need(existsSync(join(DIR, '.venv/bin/python')), `ComfyUI not found at ${DIR} (.venv). Set COMFY_DIR or see SKILL.md "Local models".`, 1);
  mkdirSync(dirname(LOG), { recursive: true });
  const port = new URL(URL_).port || '8188';
  const out = openSync(LOG, 'a');
  spawn(join(DIR, '.venv/bin/python'), ['main.py', '--listen', '127.0.0.1', '--port', port], { cwd: DIR, detached: true, stdio: ['ignore', out, out] }).unref();
  for (let i = 0; i < 90; i++) { if (await up()) { console.error(`ComfyUI started at ${URL_} (log ${LOG})`); return; } await new Promise((r) => setTimeout(r, 2000)); }
  die(`ComfyUI did not come up in 3 min; see ${LOG}`);
}

// Width and height of a PNG or JPEG, from its header.
function imageSize(b) {
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  for (let i = 2; b[0] === 0xff && b[1] === 0xd8 && i < b.length;) {
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + b.readUInt16BE(i + 2);
  }
  die('reference image must be a PNG or JPEG to size the edit; pass --w and --h');
}

// Scale [w, h] to about `area` pixels, each side a multiple of 16.
const fitArea = ([w, h], area) => { const k = Math.sqrt(area / (w * h)); return [w, h].map((v) => Math.max(16, Math.round((v * k) / 16) * 16)); };

function qwenGraph({ prompt, w, h, seed, refs }) {
  const g = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: QWEN.unet, weight_dtype: 'default' } },
    cache: { class_type: 'QwenImage21Cache', inputs: { model: ['unet', 0], device: 'auto', dtype: 'default' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: QWEN.clip, type: 'qwen_image', device: 'default' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: QWEN.vae } },
    enc: { class_type: 'TextEncodeQwenImage21', inputs: { clip: ['clip', 0], prompt, negative_prompt: '', resolution: 1024 } },
    latent: { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    noise: { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    guider: { class_type: 'CFGGuider', inputs: { model: ['cache', 0], positive: ['enc', 0], negative: ['enc', 1], cfg: 1 } },
    sampler: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    sigmas: { class_type: 'ManualSigmas', inputs: { sigmas: QWEN.sigmas } },
    sample: { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['noise', 0], guider: ['guider', 0], sampler: ['sampler', 0], sigmas: ['sigmas', 0], latent_image: ['latent', 0] } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['vae', 0] } },
    save: { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'imagegen' } },
  };
  if (refs.length) {
    // Edit mode (official turbo edit template): references keep their own size and go in as latents.
    Object.assign(g.enc.inputs, { vae: ['vae', 0], resolution: 0 });
    refs.forEach((name, i) => {
      g[`ref${i + 1}`] = { class_type: 'LoadImage', inputs: { image: name } };
      g.enc.inputs[`images.image_${i + 1}`] = [`ref${i + 1}`, 0];
    });
  }
  return g;
}

// Z-Image-Turbo, as Comfy-Org's image_z_image_turbo_int8 template: 8 steps, res_multistep, shift 3.
function zImageGraph({ prompt, w, h, seed }) {
  const m = MODELS['z-image'];
  return {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: m.unet, weight_dtype: 'default' } },
    shift: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['unet', 0], shift: 3 } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: m.clip, type: 'lumina2', device: 'default' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: m.vae } },
    enc: { class_type: 'CLIPTextEncode', inputs: { clip: ['clip', 0], text: prompt } },
    neg: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['enc', 0] } },
    latent: { class_type: 'EmptySD3LatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    sample: { class_type: 'KSampler', inputs: { model: ['shift', 0], seed, steps: 8, cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple', positive: ['enc', 0], negative: ['neg', 0], latent_image: ['latent', 0], denoise: 1 } },
    decode: { class_type: 'VAEDecode', inputs: { samples: ['sample', 0], vae: ['vae', 0] } },
    save: { class_type: 'SaveImage', inputs: { images: ['decode', 0], filename_prefix: 'imagegen' } },
  };
}

// Share of border pixels that are (nearly) opaque, for an 8-bit RGBA PNG; 1 for anything without alpha.
function opaqueBorder(png) {
  if (png.readUInt32BE(0) !== 0x89504e47) return 1;
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 6 || png[28] !== 0) return 1;
  const idat = [];
  for (let i = 8; i < png.length;) {
    const len = png.readUInt32BE(i), type = png.toString('latin1', i + 4, i + 8);
    if (type === 'IDAT') idat.push(png.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat)), stride = 4 * w, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= 4 && y ? px[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      px[y * stride + x] = (row[x] + pred) & 255;
    }
  }
  let n = 0, opaque = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (y && y < h - 1 && x && x < w - 1) continue;
    n++; if (px[y * stride + 4 * x + 3] > 240) opaque++;
  }
  return opaque / n;
}

async function json(path, init) {
  const r = await fetch(`${URL_}${path}`, init);
  if (!r.ok) die(`ComfyUI ${path} → HTTP ${r.status}: ${(await r.text()).slice(0, 500)}`);
  return r.json();
}

async function upload(p) {
  const form = new FormData();
  form.append('image', new Blob([readFileSync(p)], { type: 'image/png' }), basename(p));
  form.append('overwrite', 'true');
  return (await json('/upload/image', { method: 'POST', body: form })).name;
}

// One ComfyUI job; returns the PNG bytes.
async function generate({ model, prompt, w, h, seed, refPaths }) {
  const refs = [];
  for (const p of refPaths) refs.push(await upload(p));
  const g = model === 'z-image' ? zImageGraph({ prompt, w, h, seed }) : qwenGraph({ prompt, w, h, seed, refs });
  const { prompt_id: id } = await json('/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: g }) });
  let entry;
  for (;;) {
    entry = (await json(`/history/${id}`))[id];
    if (entry) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (entry.status?.status_str === 'error') {
    const msg = (entry.status.messages ?? []).filter(([k]) => k === 'execution_error').map(([, m]) => m.exception_message).join('\n');
    die(`ComfyUI execution failed: ${msg || JSON.stringify(entry.status).slice(0, 800)}`);
  }
  const img = entry.outputs?.save?.images?.[0];
  need(img, `ComfyUI returned no image for ${id}`, 1);
  const r = await fetch(`${URL_}/view?${new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? '', type: img.type ?? 'output' })}`);
  need(r.ok, `ComfyUI /view → HTTP ${r.status}`, 1);
  return Buffer.from(await r.arrayBuffer());
}

const rgbaPrompt = (p) => `This is an RGBA format image with transparency. ${p}. The image has an alpha channel and a transparent background.`;

async function run() {
  const cutoutOnly = cmd === 'cutout';
  if (cutoutOnly) {
    need(args._.length === 1, 'usage: local.mjs cutout in.png --out x.png');
    Object.assign(args, { image: [args._[0]], prompt: CUTOUT_PROMPT, rgba: true });
  }
  const model = args.model ?? 'qwen';
  need(MODELS[model], `--model must be one of: ${Object.keys(MODELS).join(', ')}`);
  need(typeof args.prompt === 'string', '--prompt "..." is required');
  need(typeof args.out === 'string', '--out <file.png> is required');
  need(extname(args.out).toLowerCase() === '.png', `--out must end in .png: ${args.out}`);
  if (model === 'z-image') need(!args.image.length && !args.style.length && !args.rgba, 'z-image is text-to-image only: no --image, --style or --rgba. Use --model qwen (non-commercial) or codex.mjs for those.');
  need(args.image.length + args.style.length <= 10, 'at most 10 --image/--style references');
  const imagePaths = args.image.map((p) => { need(existsSync(p), `image not found: ${p}`); return resolve(p); });
  const stylePaths = args.style.map((p) => { need(existsSync(p), `image not found: ${p}`); return resolve(p); });
  const refPaths = [...imagePaths, ...stylePaths];
  const outPath = resolve(args.out);
  need(!existsSync(outPath) || args.force, `${args.out} exists; pass --force to regenerate.`);
  // An edit keeps the first reference's aspect (a 16:9 screenshot stays 16:9) unless --w/--h say otherwise.
  const fit = imagePaths.length && args.w == null && args.h == null ? fitArea(imageSize(readFileSync(imagePaths[0])), 1024 * 1024) : null;
  const w = Number(args.w ?? fit?.[0] ?? 1024), h = Number(args.h ?? fit?.[1] ?? 1024);
  need(w % 16 === 0 && h % 16 === 0, '--w and --h must be multiples of 16 (32 preferred)');
  const seed = args.seed != null ? Number(args.seed) : Math.floor(Math.random() * 2 ** 32);
  let prompt = args.prompt;
  if (stylePaths.length) {
    const nums = stylePaths.map((_, i) => imagePaths.length + i + 1);
    prompt = `Image${nums.length > 1 ? 's' : ''} ${nums.join(', ')} ${nums.length > 1 ? 'are' : 'is'} only a style reference: do not draw ${nums.length > 1 ? 'their subjects' : 'its subject'}. Draw a new, separate subject: ${prompt}`;
  }
  if (args.rgba) prompt = rgbaPrompt(prompt);

  if (args.dry) {
    console.log(`[dry] local ${model} ${w}x${h} seed=${seed}${refPaths.length ? ` refs=${refPaths.length}` : ''} → ${args.out} · $0 (${MODELS[model].license})`);
    return;
  }
  if (!(await up())) {
    if (process.env.COMFY_AUTOSTART === '0') die(`ComfyUI is not reachable at ${URL_}. Start it: node ${process.argv[1]} serve`);
    await serve();
  }

  const t0 = Date.now();
  let png = await generate({ model, prompt, w, h, seed, refPaths });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, png);
  // Qwen sometimes ignores the transparency phrasing (scene or lighting words); cut the result out once.
  let cutout = cutoutOnly;
  if (args.rgba && !cutoutOnly && opaqueBorder(png) > 0.5) {
    console.error('--rgba came back with an opaque background; running one background-removal pass');
    const [cw, ch] = fitArea(imageSize(png), 1024 * 1024);
    png = await generate({ model, prompt: rgbaPrompt(CUTOUT_PROMPT), w: cw, h: ch, seed, refPaths: [outPath] });
    writeFileSync(outPath, png);
    cutout = true;
  }
  const rel = outPath.replace(process.cwd() + '/', '');
  console.log(`saved ${rel} in ${Math.round((Date.now() - t0) / 1000)}s seed=${seed}`);

  const creditsFile = resolve('assets/art/CREDITS.json');
  mkdirSync(dirname(creditsFile), { recursive: true });
  const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, 'utf8')) : [];
  const rels = (ps) => ps.map((p) => p.replace(process.cwd() + '/', ''));
  credits.push({ files: [rel], source: MODELS[model].source, license: MODELS[model].license, input: { prompt: args.prompt, rgba: !!args.rgba, ...(cutout ? { cutout: true } : {}), w, h, seed, references: rels(imagePaths), ...(stylePaths.length ? { style: rels(stylePaths) } : {}) }, date: new Date().toISOString().slice(0, 10) });
  writeFileSync(creditsFile, JSON.stringify(credits, null, 2));
}

if (cmd === 'run' || cmd === 'cutout') await run();
else if (cmd === 'serve') await serve();
else if (cmd === 'status') console.log((await up()) ? `up ${URL_}` : `down ${URL_}`);
else if (cmd === 'stop') {
  const r = await new Promise((res) => spawn('pkill', ['-f', `${DIR}/.venv/bin/python main.py`]).on('close', res));
  console.log(r === 0 ? 'ComfyUI stopped' : 'ComfyUI was not running (started by local.mjs)');
} else die('usage: local.mjs run --prompt "..." --out x.png [--model qwen|z-image --w --h --seed --rgba --image ref.png ... --style ref.png ...] | cutout in.png --out x.png | serve | stop | status', 2);
