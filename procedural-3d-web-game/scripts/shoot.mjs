#!/usr/bin/env node
// The evidence generator for the critic loop.
// Captures every (view x time-of-day) combination at a fixed seed and frozen clock, plus a
// "motion pair" (two frames ~0.25 s apart) per view to expose flicker, shimmer and z-fighting
// that single stills hide. Computes simple image metrics and stitches everything into one
// labeled contact sheet PNG the critic can read in a single look.
//
//   node scripts/shoot.mjs --url dist/index.html --out shots/round-03 \
//        [--views hero,shore] [--times 7,12,17.5,22] [--size 1280x720] [--gpu] [--ref refs/]
//
// Output: <out>/<view>@<time>.png, <out>/motion-<view>.png, <out>/contact-sheet.png, <out>/metrics.json
import { launch, parseArgs, toUrl } from './lib.mjs';
import { resolve, join, basename } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';

const args = parseArgs(process.argv.slice(2));
const url = toUrl(args.url ?? 'dist/index.html');
const out = resolve(args.out ?? `shots/${stamp()}`);
mkdirSync(out, { recursive: true });
const [W, H] = (args.size ?? '1280x720').split('x').map(Number);
const times = (args.times ?? '7,12,17.5,22').split(',').map(Number);
const settle = Number(args.settle ?? 6);
// Contact sheet width in px. Image tokens scale with pixels: 1600 keeps every cell legible for a
// critic while costing far less than a full-resolution sheet.
const sheetWidth = Number(args['sheet-width'] ?? 1600);

const browser = await launch(args);
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const q = new URLSearchParams({ capture: '1', seed: args.seed ?? '1337', quality: args.quality ?? 'medium', freeze: '10' });
await page.goto(`${url}${url.includes('?') ? '&' : '?'}${q}`);
await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: Number(args.timeout ?? 180000) });
const views = args.views ? args.views.split(',') : await page.evaluate(() => window.__game.views());

const shots = [];
for (const view of views) {
  for (const t of times) {
    await page.evaluate(async ([v, h]) => { window.__game.setView(v); window.__game.setTimeOfDay(h); await window.__game.frames(6); }, [view, t]);
    await page.evaluate((n) => window.__game.frames(n), settle);
    const file = join(out, `${view}@${t}.png`);
    await page.screenshot({ path: file });
    shots.push({ view, time: t, file, metrics: await metricsOf(page, file) });
  }
  // Motion pair: unfreeze, grab two frames 250 ms apart, diff them. A high diff in areas
  // that should be static (buildings, terrain) means flicker / z-fighting / shadow acne.
  await page.evaluate(async ([v, h]) => { window.__game.setView(v); window.__game.setTimeOfDay(h); window.__game.unfreeze(); await window.__game.frames(10); }, [view, times[Math.floor(times.length / 2)]]);
  const a = await page.screenshot(); await page.waitForTimeout(400); const b = await page.screenshot();
  const motion = await diffOf(page, a, b);
  writeFileSync(join(out, `motion-${view}.png`), Buffer.from(motion.heatmap, 'base64'));
  shots.push({ view, time: 'motion', file: join(out, `motion-${view}.png`), metrics: { changedPct: motion.changedPct } });
  await page.evaluate(() => window.__game.freeze(10));
}

const stats = await page.evaluate(() => window.__game.stats());
const refs = args.ref && existsSync(resolve(args.ref)) ? readdirSync(resolve(args.ref)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => join(resolve(args.ref), f)) : [];
await contactSheet(browser, shots, refs, join(out, 'contact-sheet.png'));
await browser.close();

writeFileSync(join(out, 'metrics.json'), JSON.stringify({ url, views, times, stats, errors, renderer: args.gpu ? 'gpu' : 'swiftshader',
  shots: shots.map((s) => ({ view: s.view, time: s.time, file: basename(s.file), ...s.metrics })) }, null, 2));
const stills = shots.filter((s) => s.time !== 'motion');
const flicker = shots.filter((s) => s.time === 'motion').map((s) => `${s.view} ${s.metrics.changedPct}%`).join(', ');
const worst = (k) => stills.reduce((a, b) => (b.metrics[k] > a.metrics[k] ? b : a));
const uniq = [...new Set(errors)];
console.log(`${uniq.length ? 'FAIL' : 'OK  '} ${stills.length} shots · sheet ${join(out, 'contact-sheet.png')}`);
console.log(`  most crushed: ${worst('crushedBlackPct').view}@${worst('crushedBlackPct').time} ${worst('crushedBlackPct').metrics.crushedBlackPct}% · most blown: ${worst('blownWhitePct').view}@${worst('blownWhitePct').time} ${worst('blownWhitePct').metrics.blownWhitePct}% · motion: ${flicker}`);
for (const e of uniq.slice(0, 5)) console.log(`  - ${e.slice(0, 200)}`);
if (uniq.length > 5) console.log(`  … ${uniq.length - 5} more errors in metrics.json`);
process.exit(errors.length ? 1 : 0);

// ---------- helpers (all image math runs in the page: no extra npm deps) ----------
async function metricsOf(page, file) {
  const b64 = readFileSync(file).toString('base64');
  return page.evaluate(async (data) => {
    const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const c = new OffscreenCanvas(256, Math.round((256 * img.height) / img.width)); const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height).data; const n = d.length / 4;
    let sum = 0, sum2 = 0, dark = 0, bright = 0, rg = 0, yb = 0, rg2 = 0, yb2 = 0, edges = 0;
    const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; lum[i] = l;
      sum += l; sum2 += l * l; if (l < 12) dark++; if (l > 245) bright++;
      const a = r - g, bb = 0.5 * (r + g) - b; rg += a; yb += bb; rg2 += a * a; yb2 += bb * bb;
    }
    for (let y = 1; y < c.height; y++) for (let xx = 1; xx < c.width; xx++) { const i = y * c.width + xx; if (Math.abs(lum[i] - lum[i - 1]) + Math.abs(lum[i] - lum[i - c.width]) > 40) edges++; }
    const mean = sum / n, std = Math.sqrt(sum2 / n - mean * mean);
    const srg = Math.sqrt(rg2 / n - (rg / n) ** 2), syb = Math.sqrt(yb2 / n - (yb / n) ** 2);
    const colorfulness = Math.sqrt(srg ** 2 + syb ** 2) + 0.3 * Math.sqrt((rg / n) ** 2 + (yb / n) ** 2);
    return { meanLum: +mean.toFixed(1), contrast: +std.toFixed(1), crushedBlackPct: +((100 * dark) / n).toFixed(1),
      blownWhitePct: +((100 * bright) / n).toFixed(1), colorfulness: +colorfulness.toFixed(1), edgeDensityPct: +((100 * edges) / n).toFixed(1) };
  }, b64);
}

async function diffOf(page, a, b) {
  return page.evaluate(async ([A, B]) => {
    const load = async (s) => createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
    const [ia, ib] = await Promise.all([load(A), load(B)]);
    const w = 480, h = Math.round((480 * ia.height) / ia.width);
    const ca = new OffscreenCanvas(w, h), cb = new OffscreenCanvas(w, h);
    ca.getContext('2d').drawImage(ia, 0, 0, w, h); cb.getContext('2d').drawImage(ib, 0, 0, w, h);
    const da = ca.getContext('2d').getImageData(0, 0, w, h), db = cb.getContext('2d').getImageData(0, 0, w, h);
    const out = new ImageData(w, h); let changed = 0;
    for (let i = 0; i < da.data.length; i += 4) {
      const dv = (Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2])) / 3;
      if (dv > 8) changed++;
      const g = da.data[i] * 0.25; out.data[i] = Math.min(255, g + dv * 4); out.data[i + 1] = g; out.data[i + 2] = g; out.data[i + 3] = 255;
    }
    const oc = new OffscreenCanvas(w, h); oc.getContext('2d').putImageData(out, 0, 0);
    const blob = await oc.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 32768) s += String.fromCharCode(...buf.subarray(i, i + 32768));
    return { changedPct: +((100 * changed) / (w * h)).toFixed(1), heatmap: btoa(s) };
  }, [a.toString('base64'), b.toString('base64')]);
}

async function contactSheet(browser, shots, refs, file) {
  const cell = (src, label) => `<figure><img src="data:image/png;base64,${readFileSync(src).toString('base64')}"><figcaption>${label}</figcaption></figure>`;
  const refCells = refs.map((r) => `<figure><img src="data:image/${r.endsWith('png') ? 'png' : 'jpeg'};base64,${readFileSync(r).toString('base64')}"><figcaption>REFERENCE ${basename(r)}</figcaption></figure>`).join('');
  const cells = shots.map((s) => cell(s.file, s.time === 'motion'
    ? `${s.view} · motion diff (red = changed) · ${s.metrics.changedPct}% px`
    : `${s.view} @ ${s.time}h · contrast ${s.metrics.contrast} · color ${s.metrics.colorfulness} · crushed ${s.metrics.crushedBlackPct}% · blown ${s.metrics.blownWhitePct}%`)).join('');
  const html = `<html><body style="margin:0;background:#111;color:#ddd;font:13px ui-monospace,monospace">
    <style>main{display:grid;grid-template-columns:repeat(${Math.min(5, times.length + 1)},1fr);gap:6px;padding:6px}figure{margin:0}img{width:100%;display:block}figcaption{padding:3px 2px}</style>
    <main>${refCells}${cells}</main></body></html>`;
  const p2 = await browser.newPage({ viewport: { width: sheetWidth, height: 600 } });
  await p2.setContent(html);
  await p2.screenshot({ path: file, fullPage: true });
  await p2.close();
}

function stamp() { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`; }
