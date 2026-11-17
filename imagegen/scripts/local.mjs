#!/usr/bin/env node
// Local image generation with Qwen-Image 2.1 Turbo through ComfyUI on this Mac. No per-image cost,
// no plan quota, no network after the one-time weight download.
//
//   node local.mjs run --prompt "..." --out x.png [--w 1024 --h 1024] [--seed N] [--rgba]
//                      [--image ref.png ...] [--force] [--dry]
//   node local.mjs serve | stop | status
//
// --rgba    wraps the prompt in the model card's transparency phrasing; the PNG has real alpha.
// --image   edit / multi-reference mode (up to 10): "replace her shirt with the one in image 2".
//
// LICENSE: Qwen-Image 2.1 is "Qwen Research License", non-commercial (research or evaluation) only.
// Every CREDITS.json row says so, so shipped assets can be audited. See SKILL.md "Licensing".
//
// Env: COMFY_URL (default http://127.0.0.1:8188), COMFY_DIR (default ~/src/ComfyUI, with .venv),
// COMFY_AUTOSTART=0 to never start the server. Setup is in SKILL.md "Local models".
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';

const URL_ = process.env.COMFY_URL ?? 'http://127.0.0.1:8188';
const DIR = process.env.COMFY_DIR ?? join(homedir(), 'src/ComfyUI');
const LOG = join(homedir(), '.cache/comfyui.log');
const MODEL = {
  unet: 'qwen_image_2.1_turbo_int8_convrot.safetensors',
  clip: 'qwen3vl_8b_int8_convrot.safetensors',
  vae: 'qwen_image_2.1_vae_bf16.safetensors',
  // The turbo checkpoint's distilled 8-step schedule (Comfy-Org template). Don't change steps without it.
  sigmas: '1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0',
};
const SOURCE = 'Qwen-Image 2.1 Turbo (local ComfyUI, int8) (generated)';
const LICENSE = 'Qwen Research License: non-commercial (research or evaluation) only';

const [cmd, ...rest] = process.argv.slice(2);
const args = { image: [] };
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) continue;
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

function graph({ prompt, w, h, seed, refs }) {
  const g = {
    unet: { class_type: 'UNETLoader', inputs: { unet_name: MODEL.unet, weight_dtype: 'default' } },
    cache: { class_type: 'QwenImage21Cache', inputs: { model: ['unet', 0], device: 'auto', dtype: 'default' } },
    clip: { class_type: 'CLIPLoader', inputs: { clip_name: MODEL.clip, type: 'qwen_image', device: 'default' } },
    vae: { class_type: 'VAELoader', inputs: { vae_name: MODEL.vae } },
    enc: { class_type: 'TextEncodeQwenImage21', inputs: { clip: ['clip', 0], prompt, negative_prompt: '', resolution: 1024 } },
    latent: { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: 1 } },
    noise: { class_type: 'RandomNoise', inputs: { noise_seed: seed } },
    guider: { class_type: 'CFGGuider', inputs: { model: ['cache', 0], positive: ['enc', 0], negative: ['enc', 1], cfg: 1 } },
    sampler: { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
    sigmas: { class_type: 'ManualSigmas', inputs: { sigmas: MODEL.sigmas } },
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

async function json(path, init) {
  const r = await fetch(`${URL_}${path}`, init);
  if (!r.ok) die(`ComfyUI ${path} → HTTP ${r.status}: ${(await r.text()).slice(0, 500)}`);
  return r.json();
}

async function run() {
  need(typeof args.prompt === 'string', '--prompt "..." is required');
  need(typeof args.out === 'string', '--out <file.png> is required');
  need(extname(args.out).toLowerCase() === '.png', `--out must end in .png: ${args.out}`);
  need(args.image.length <= 10, 'at most 10 --image references');
  const refPaths = args.image.map((p) => { need(existsSync(p), `image not found: ${p}`); return resolve(p); });
  const outPath = resolve(args.out);
  need(!existsSync(outPath) || args.force, `${args.out} exists; pass --force to regenerate.`);
  const w = Number(args.w ?? 1024), h = Number(args.h ?? 1024);
  need(w % 16 === 0 && h % 16 === 0, '--w and --h must be multiples of 16 (32 preferred)');
  const seed = args.seed != null ? Number(args.seed) : Math.floor(Math.random() * 2 ** 32);
  const prompt = args.rgba
    ? `This is an RGBA format image with transparency. ${args.prompt}. The image has an alpha channel and a transparent background.`
    : args.prompt;

  if (args.dry) {
    console.log(`[dry] local qwen-image-2.1-turbo ${w}x${h} seed=${seed}${refPaths.length ? ` refs=${refPaths.length}` : ''} → ${args.out} · $0 (non-commercial license)`);
    return;
  }
  if (!(await up())) {
    if (process.env.COMFY_AUTOSTART === '0') die(`ComfyUI is not reachable at ${URL_}. Start it: node ${process.argv[1]} serve`);
    await serve();
  }

  const refs = [];
  for (const p of refPaths) {
    const form = new FormData();
    form.append('image', new Blob([readFileSync(p)], { type: 'image/png' }), basename(p));
    form.append('overwrite', 'true');
    refs.push((await json('/upload/image', { method: 'POST', body: form })).name);
  }

  const t0 = Date.now();
  const { prompt_id: id } = await json('/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: graph({ prompt, w, h, seed, refs }) }) });
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
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(await r.arrayBuffer()));
  const rel = outPath.replace(process.cwd() + '/', '');
  console.log(`saved ${rel} in ${Math.round((Date.now() - t0) / 1000)}s seed=${seed}`);

  const creditsFile = resolve('assets/art/CREDITS.json');
  mkdirSync(dirname(creditsFile), { recursive: true });
  const credits = existsSync(creditsFile) ? JSON.parse(readFileSync(creditsFile, 'utf8')) : [];
  credits.push({ files: [rel], source: SOURCE, license: LICENSE, input: { prompt: args.prompt, rgba: !!args.rgba, w, h, seed, references: refPaths.map((p) => p.replace(process.cwd() + '/', '')) }, date: new Date().toISOString().slice(0, 10) });
  writeFileSync(creditsFile, JSON.stringify(credits, null, 2));
}

if (cmd === 'run') await run();
else if (cmd === 'serve') await serve();
else if (cmd === 'status') console.log((await up()) ? `up ${URL_}` : `down ${URL_}`);
else if (cmd === 'stop') {
  const r = await new Promise((res) => spawn('pkill', ['-f', `${DIR}/.venv/bin/python main.py`]).on('close', res));
  console.log(r === 0 ? 'ComfyUI stopped' : 'ComfyUI was not running (started by local.mjs)');
} else die('usage: local.mjs run --prompt "..." --out x.png [--w --h --seed --rgba --image ref.png ...] | serve | stop | status', 2);
