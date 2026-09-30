#!/usr/bin/env node
// 3D models with Meshy, saved as project files. Preview first, refine (texture) only what you approved.
// The key comes from the MESHY_API_KEY environment variable. It is never printed, never written to disk,
// and must never be shipped in a client bundle, committed, logged or pasted into chat.
//
//   node meshy.mjs check                                   balance + this project's meshy_credits budget
//   node meshy.mjs preview --prompt "..." --out assets-src/meshy/frog.glb [--model meshy-6|meshy-6-lite] [--polycount 8000]
//        → untextured mesh + frog.png thumbnail + frog.task (the preview id). Cheap: review these on a contact sheet.
//   node meshy.mjs refine --out assets-src/meshy/frog.glb [--pbr]
//        → textures the preview recorded in frog.task and overwrites frog.glb. Only for approved previews.
//   node meshy.mjs image-to-3d --image assets/art/pip-front.png --out assets/models/pip.glb [--lowpoly] [--pose a-pose|t-pose] [--no-texture] [--pbr] [--model latest]
//   node meshy.mjs status <task-id> [--kind text-to-3d|image-to-3d]
//   Every paid command takes --dry (print the estimate and budget, spend nothing) and --force (overwrite).
//
// API: https://docs.meshy.ai. Credit estimates below are Sep 2026 list prices; the ledger records what the
// task reports as consumed. Each model is appended to assets/models/CREDITS.json and assets/SPEND.jsonl.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { guard, record, looksExhausted, markExhausted, clearExhausted } from './spend.mjs';

const EST = { preview: { 'meshy-6': 20, 'meshy-6-lite': 5 }, refine: 10, image: 30, imageNoTexture: 20 };
const [cmd, ...rest] = process.argv.slice(2);
const args = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) { const k = rest[i].slice(2); args[k] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true; } else args._ = rest[i];
const need = (c, m) => { if (!c) { console.error(m); process.exit(2); } };
need(['check', 'preview', 'refine', 'image-to-3d', 'status'].includes(cmd), 'usage: meshy.mjs <check|preview|refine|image-to-3d|status> [options]');
const key = process.env.MESHY_API_KEY;
need(key, 'MESHY_API_KEY is not set in this shell. It belongs in ~/.zshenv (read by every shell, including non-interactive ones); ask the owner to add it there and restart the session; never paste the key into chat or files.');
const H = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
async function j(method, path, body) {
  const res = await fetch(`https://api.meshy.ai/openapi${path}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) {
    if (looksExhausted(res.status, text)) markExhausted('meshy', text.slice(0, 200));
    console.error(`Meshy ${method} ${path} failed: HTTP ${res.status} ${text.slice(0, 400)}`);
    process.exit(1);
  }
  return JSON.parse(text);
}
const balance = async () => (await j('GET', '/v1/balance')).balance;

async function waitFor(path) {
  const t0 = Date.now();
  for (;;) {
    const t = await j('GET', path);
    if (t.status === 'SUCCEEDED') return t;
    if (['FAILED', 'CANCELED', 'EXPIRED'].includes(t.status)) { console.error(`Meshy task ${t.status}: ${t.task_error?.message ?? ''}`); process.exit(1); }
    if (Date.now() - t0 > 20 * 60e3) { console.error(`timed out; check later with: meshy.mjs status ${t.id}`); process.exit(1); }
    await new Promise((r) => setTimeout(r, 5000));
  }
}
async function download(url, file) {
  const res = await fetch(url); need(res.ok, `download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, buf);
  return buf.length;
}
/** Budget + live balance check before paying (Meshy refuses mid-batch otherwise). */
async function pay(estimate, label) {
  const spend = guard({ service: 'meshy', estimate, label, dry: !!args.dry });
  const b = await balance();
  if (b < estimate) { markExhausted('meshy', `balance ${b} < ${estimate}`); console.error(`Meshy balance is ${b} credits, this needs ≈${estimate}. Ask the owner to top up; use existing models or 2.5D cutouts meanwhile.`); process.exit(3); }
  clearExhausted('meshy');
  return spend;
}
function credit(file, source, extra) {
  const cf = resolve('assets/models/CREDITS.json'); mkdirSync(dirname(cf), { recursive: true });
  const credits = existsSync(cf) ? JSON.parse(readFileSync(cf, 'utf8')) : [];
  credits.push({ file, source, ...extra, date: new Date().toISOString().slice(0, 10) });
  writeFileSync(cf, JSON.stringify(credits, null, 2));
}
const outFile = () => { need(args.out, '--out is required'); return resolve(args.out); };
const taskFile = (out) => out.replace(/\.glb$/i, '') + '.task';

if (cmd === 'check') {
  console.log(`key OK · balance ${await balance()} credits`);
  guard({ service: 'meshy', label: 'check', dry: true });
} else if (cmd === 'status') {
  need(args._, 'status <task-id>');
  const t = await j('GET', `/${args.kind === 'image-to-3d' ? 'v1/image-to-3d' : 'v2/text-to-3d'}/${args._}`);
  console.log(`${t.status} ${t.progress ?? ''}%`);
} else if (cmd === 'preview') {
  need(args.prompt, '--prompt is required');
  const out = outFile();
  need(!existsSync(out) || args.force, `${args.out} exists; pass --force to regenerate (costs credits).`);
  const model = args.model ?? 'meshy-6';
  const est = EST.preview[model] ?? 20;
  const spend = await pay(est, `preview ${args.out}`);
  const { result: id } = await j('POST', '/v2/text-to-3d', { mode: 'preview', prompt: args.prompt, ai_model: model, topology: 'triangle', target_polycount: Number(args.polycount ?? 8000), should_remesh: true });
  writeFileSync(taskFile(out), JSON.stringify({ preview: id, prompt: args.prompt, model }));
  const t = await waitFor(`/v2/text-to-3d/${id}`);
  const kb = Math.round((await download(t.model_urls.glb, out)) / 1024);
  if (t.thumbnail_url) await download(t.thumbnail_url, out.replace(/\.glb$/i, '.png'));
  record(spend, { amount: t.consumed_credits ?? est, estimated: t.consumed_credits == null, label: 'text-to-3d preview', files: [args.out] });
  console.log(`preview saved ${args.out} (${kb} KB, untextured) + thumbnail. Review before: meshy.mjs refine --out ${args.out}`);
} else if (cmd === 'refine') {
  const out = outFile();
  need(existsSync(taskFile(out)), `no ${taskFile(args.out)}: run preview first`);
  const task = JSON.parse(readFileSync(taskFile(out), 'utf8'));
  need(!task.refined || args.force, `${args.out} is already refined; pass --force to pay again.`);
  const spend = await pay(EST.refine, `refine ${args.out}`);
  const { result: id } = await j('POST', '/v2/text-to-3d', { mode: 'refine', preview_task_id: task.preview, enable_pbr: !!args.pbr });
  const t = await waitFor(`/v2/text-to-3d/${id}`);
  const kb = Math.round((await download(t.model_urls.glb, out)) / 1024);
  writeFileSync(taskFile(out), JSON.stringify({ ...task, refined: id }));
  record(spend, { amount: t.consumed_credits ?? EST.refine, estimated: t.consumed_credits == null, label: 'text-to-3d refine', files: [args.out] });
  credit(args.out, 'Meshy text-to-3d (generated)', { prompt: task.prompt, model: task.model });
  console.log(`saved ${args.out} (${kb} KB)`);
} else {
  need(args.image, '--image is required');
  const out = outFile();
  need(!existsSync(out) || args.force, `${args.out} exists; pass --force to regenerate (costs credits).`);
  const est = args['no-texture'] ? EST.imageNoTexture : EST.image;
  const spend = await pay(est, `image-to-3d ${args.out}`);
  const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
  const local = !/^https?:|^data:/.test(args.image);
  const image_url = local ? `data:${MIME[extname(args.image).toLowerCase()] ?? 'image/png'};base64,${readFileSync(args.image).toString('base64')}` : args.image;
  const body = { image_url, ai_model: args.model ?? 'latest', should_texture: !args['no-texture'], enable_pbr: !!args.pbr, target_formats: ['glb'] };
  if (args.lowpoly) body.model_type = 'lowpoly';
  if (args.pose) body.pose_mode = args.pose;
  const t0 = Date.now();
  const { result: id } = await j('POST', '/v1/image-to-3d', body);
  console.log(`task ${id} submitted`);
  const t = await waitFor(`/v1/image-to-3d/${id}`);
  need(t.model_urls?.glb, 'no glb in result');
  const kb = Math.round((await download(t.model_urls.glb, out)) / 1024);
  record(spend, { amount: t.consumed_credits ?? est, estimated: t.consumed_credits == null, label: 'image-to-3d', files: [args.out] });
  credit(args.out, 'Meshy image-to-3d (generated)', { image: local ? args.image : image_url, credits: t.consumed_credits });
  console.log(`saved ${args.out} (${kb} KB) in ${Math.round((Date.now() - t0) / 1000)}s`);
}
