#!/usr/bin/env node
// Scripted playtest: turns a stage's acceptance walkthrough ("swim out, climb into the boat,
// cast off, dock") into steps a headless browser actually performs, with assertions on game
// state and screenshots along the way. Exit code 1 if any step fails.
//
//   node scripts/playtest.mjs --url dist/index.html --steps playtests/boat.json [--out shots/playtest] [--gpu]
//
// Steps file: a JSON array. Each step is one of:
//   { "key": "KeyW", "holdFrames": 30 }          press a key and hold it for n rendered frames
//                                                (prefer this over "hold": ms — frame-based holds
//                                                behave the same on a fast GPU and in slow headless runs)
//   { "key": "KeyW", "hold": 1500 }              ...or hold for n milliseconds of real time
//   { "click": [640, 360] }                      click at viewport x,y
//   { "drag": [[640,360],[900,360]] }            drag from -> to
//   { "call": "setView", "args": ["shore"] }     call window.__game.<fn>(...args)
//   { "wait": 800 }                              wait ms (real time)
//   { "frames": 30 }                             wait n rendered frames
//   { "expect": "__game.ctx.camera.position.y > 1", "label": "camera above water", "timeout": 5000 }
//                                                poll a JS expression until truthy
//   { "shot": "after-dock" }                     save a screenshot
// Games should expose whatever state their walkthroughs need, e.g. __game.state() returning
// { player: { inWater, inBoat, air }, boat: { speed, moored } }.
import { launch, parseArgs, toUrl } from './lib.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const args = parseArgs(process.argv.slice(2));
if (!args.steps) { console.error('usage: playtest.mjs --steps <file.json> [--url dist/index.html]'); process.exit(2); }
const steps = JSON.parse(readFileSync(resolve(args.steps), 'utf8'));
const url = toUrl(args.url ?? 'dist/index.html');
const out = resolve(args.out ?? 'shots/playtest');
mkdirSync(out, { recursive: true });

const browser = await launch(args);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const q = new URLSearchParams({ capture: '1', seed: args.seed ?? '1337', quality: args.quality ?? 'low' });
await page.goto(`${url}${url.includes('?') ? '&' : '?'}${q}`);
await page.waitForFunction(() => window.__game?.ready === true, null, { timeout: Number(args.timeout ?? 180000) });
await page.mouse.click(640, 360); // first gesture: starts audio, focuses canvas

const results = [];
let failed = false;
for (const [i, s] of steps.entries()) {
  const label = s.label ?? JSON.stringify(s);
  try {
    if (s.key) {
      await page.keyboard.down(s.key);
      if (s.holdFrames) await page.evaluate((n) => window.__game.frames(n), s.holdFrames);
      else await page.waitForTimeout(s.hold ?? 50);
      await page.keyboard.up(s.key);
    } else if (s.click) {
      await page.mouse.click(s.click[0], s.click[1]);
    } else if (s.drag) {
      await page.mouse.move(...s.drag[0]); await page.mouse.down();
      await page.mouse.move(...s.drag[1], { steps: 12 }); await page.mouse.up();
    } else if (s.call) {
      await page.evaluate(([fn, a]) => window.__game[fn](...a), [s.call, s.args ?? []]);
    } else if (s.wait) {
      await page.waitForTimeout(s.wait);
    } else if (s.frames) {
      await page.evaluate((n) => window.__game.frames(n), s.frames);
    } else if (s.expect) {
      await page.waitForFunction((expr) => { try { return !!new Function(`return (${expr})`)(); } catch { return false; } },
        s.expect.replace(/(^|[^.\w])__game/g, '$1window.__game'), { timeout: s.timeout ?? 5000 });
    } else if (s.shot) {
      await page.screenshot({ path: join(out, `${String(i).padStart(2, '0')}-${s.shot}.png`) });
    }
    results.push({ step: i, ok: true, label });
    console.log(`ok   ${i} ${label}`);
  } catch (e) {
    failed = true;
    const shot = join(out, `${String(i).padStart(2, '0')}-FAILED.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    results.push({ step: i, ok: false, label, error: e.message.split('\n')[0], shot });
    console.log(`FAIL ${i} ${label}\n     ${e.message.split('\n')[0]}`);
    if (!args['keep-going']) break;
  }
}
await browser.close();
if (errors.length) failed = true;
writeFileSync(join(out, 'playtest.json'), JSON.stringify({ ok: !failed, results, errors }, null, 2));
if (errors.length) console.log(`page errors:\n- ${errors.join('\n- ')}`);
process.exit(failed ? 1 : 0);
