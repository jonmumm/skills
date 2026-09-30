#!/usr/bin/env node
// Load the game headlessly, fail on console/page errors, confirm the canvas isn't blank,
// and sample frame-time stats. Exit code 1 on any failure, so agents can gate on it.
//
//   node scripts/check.mjs --url dist/index.html [--seconds 4] [--gpu] [--quality medium] [--json]
//
// Prints one summary line (agent output is context the agent pays for on every later turn);
// the full report is written to check-report.json. --json prints the full report instead.
//
// --gpu uses the machine's real GPU (run on your own computer). Without it, Chromium uses
// SwiftShader (software WebGL), which works in cloud sandboxes but is slow: FPS numbers there
// are NOT meaningful — only errors, blankness and draw-call/triangle counts are.
import { launch, parseArgs, toUrl, gpuInfo } from './lib.mjs';
import { statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = parseArgs(process.argv.slice(2));
const url = toUrl(args.url ?? 'dist/index.html');
const seconds = Number(args.seconds ?? 4);
const q = new URLSearchParams({ capture: '1', seed: args.seed ?? '1337', quality: args.quality ?? 'medium' });

const browser = await launch(args);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => { if (!r.url().startsWith('data:')) errors.push(`requestfailed: ${r.url()}`); });

const t0 = Date.now();
await page.goto(`${url}${url.includes('?') ? '&' : '?'}${q}`);
try {
  await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: Number(args.timeout ?? 120000) });
} catch {
  errors.push('game never reported ready (window.__game.ready) — black screen or init crash?');
}
const bootMs = Date.now() - t0;
// Software rendering can take seconds per frame; wait for real frames before judging the canvas.
await page.waitForFunction(() => (window.__game?.stats?.().frame ?? 0) >= 5, null, { timeout: Number(args.timeout ?? 120000) })
  .catch(() => errors.push('fewer than 5 frames rendered — render loop stalled?'));
await page.waitForTimeout(seconds * 1000);

const result = await page.evaluate(() => {
  const g = window.__game;
  const c = document.querySelector('canvas');
  let blank = true, meanLum = 0;
  if (c) {
    const s = document.createElement('canvas'); s.width = 64; s.height = 36;
    const x = s.getContext('2d'); x.drawImage(c, 0, 0, 64, 36);
    const d = x.getImageData(0, 0, 64, 36).data;
    let min = 255, max = 0;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; meanLum += l; min = Math.min(min, l); max = Math.max(max, l); }
    meanLum /= d.length / 4; blank = max - min < 8;
  }
  return { stats: g?.stats?.(), systems: g?.systems, views: g?.views?.(), blank, meanLum };
});
const gpu = await gpuInfo(page);
await browser.close();

if (result.blank) errors.push(`canvas looks blank/uniform (mean luminance ${result.meanLum.toFixed(1)})`);
const fileKB = url.startsWith('file:') ? Math.round(statSync(fileURLToPath(url.split('?')[0])).size / 1024) : null;
const report = { ok: errors.length === 0, bootMs, fileKB, renderer: gpu.renderer, softwareRendered: gpu.software, ...result, errors };
// Keep stored errors deduplicated and short; the count stays exact.
const uniqueErrors = [...new Set(errors)].slice(0, 20).map((e) => e.slice(0, 500));
const full = { ...report, errorCount: errors.length, errors: uniqueErrors };
writeFileSync(args.report ?? 'check-report.json', JSON.stringify(full, null, 2));
if (args.json) console.log(JSON.stringify(full, null, 2));
else {
  const st = result.stats ?? {};
  console.log(`${report.ok ? 'OK  ' : 'FAIL'} boot ${bootMs}ms · ${fileKB ?? '?'}KB · ${st.drawCalls ?? '?'} draws · ${((st.triangles ?? 0) / 1e6).toFixed(2)}M tris · ${st.programs ?? '?'} programs · ${result.blank ? 'BLANK' : 'not blank'} · ${errors.length} errors · ${gpu.software ? 'SOFTWARE render (fps invalid)' : `GPU: ${gpu.renderer}`}`);
  for (const e of uniqueErrors.slice(0, 5)) console.log(`  - ${e.slice(0, 200)}`);
  if (uniqueErrors.length > 5) console.log(`  … ${uniqueErrors.length - 5} more in check-report.json`);
}
process.exit(report.ok ? 0 : 1);
