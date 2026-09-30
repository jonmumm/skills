// Shared helpers for check.mjs and shoot.mjs.
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// Launch Chromium.
// Playwright's default headless mode uses chromium_headless_shell, which has no GPU backend and
// silently renders on SwiftShader (CPU): FPS and frame times from it are fiction. So with --gpu we
// try channel:'chromium' first (full Chromium in new headless mode, on the real GPU; install it
// with `npx playwright install --no-shell chromium`). Without --gpu we force SwiftShader, which
// works in cloud sandboxes with no GPU. Reports always say which renderer actually drew the frames.
// (Learned from majidmanzarpour/threejs-game-skills.)
export async function launch(args) {
  const flags = args.gpu
    ? ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
    : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const attempts = [
    ...(args.chrome || process.env.CHROMIUM_PATH ? [{ executablePath: args.chrome || process.env.CHROMIUM_PATH }] : []),
    ...(args.gpu ? [{ channel: 'chromium' }] : []),
    {},
    { channel: 'chrome' },
  ];
  let last;
  for (const extra of attempts) {
    try { return await chromium.launch({ args: flags, ...extra }); } catch (e) { last = e; }
  }
  throw last;
}

// Which GPU actually rasterized the page. Reuses the game's own WebGL context.
export async function gpuInfo(page) {
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    let gl = null;
    try { gl = c && (c.getContext('webgl2') ?? c.getContext('webgl')); } catch { gl = null; }
    if (!gl) return null;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  return { renderer: info, software: info ? /swiftshader|llvmpipe|software|basic render/i.test(info) : null };
}

export function parseArgs(a) {
  const o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) { const k = a[i].slice(2); o[k] = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; }
  return o;
}

export function toUrl(u) {
  if (/^https?:|^file:/.test(u)) return u;
  const p = resolve(u);
  if (!existsSync(p)) { console.error(`not found: ${p} (run npm run build first)`); process.exit(2); }
  return `file://${p}`;
}
