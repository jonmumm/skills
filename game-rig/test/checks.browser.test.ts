import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { checkOverlayFocal, checkSafeArea, checkText } from "../src/checks/page-checks.ts";
import { checkTapFeedback } from "../src/checks/tap-run.ts";

let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});

async function pageWith(html: string, viewport = { width: 1280, height: 720 }): Promise<Page> {
  const page = await browser.newPage({ viewport });
  await page.setContent(html);
  return page;
}

// A TV scene: full-screen canvas, focal rect exposed by the game, a HUD layer on top.
const tv = (hud: string) => `<!doctype html><style>body{margin:0;background:#123} canvas{position:fixed;inset:0;width:100vw;height:100vh}
  .hud{position:fixed;inset:0;pointer-events:none} .chip{position:absolute;background:#fff;padding:8px;font:20px sans-serif}</style>
  <canvas width="1280" height="720"></canvas><div class="hud">${hud}</div>
  <script>window.__focalRect = () => ({ x: innerWidth * 0.25, y: innerHeight * 0.2, width: innerWidth * 0.5, height: innerHeight * 0.6 });</script>`;

describe("overlay vs focal", () => {
  test("a banner across the middle of the scene fails", async () => {
    const page = await pageWith(tv(`<div class="chip" style="left:40%;top:45%">Your turn, Juneau!</div>`));
    const v = await checkOverlayFocal(page, {});
    expect(v.pass).toBe(false);
    expect(v.failures[0]).toMatchObject({ code: "overlay_covers_focal", text: "Your turn, Juneau!" });
    await page.close();
  });
  test("a panel over the focal rect is one finding, not one per child", async () => {
    const page = await pageWith(tv(`<div class="chip" style="left:30%;top:30%;width:40%"><h1>Bake Shop</h1><p>Scan to join <b>ABCD</b></p></div>`));
    const v = await checkOverlayFocal(page, {});
    expect(v.failures).toHaveLength(1);
    await page.close();
  });
  test("a corner chip and a transparent full-screen HUD wrapper pass", async () => {
    const page = await pageWith(tv(`<div class="chip" style="left:16px;top:16px">3</div><div style="position:absolute;inset:0"></div>`));
    expect(await checkOverlayFocal(page, {})).toEqual({ pass: true, failures: [] });
    await page.close();
  });
  test("ignored selectors and a game without a focal hook", async () => {
    const page = await pageWith(tv(`<div class="chip toast" style="left:40%;top:45%">Saved</div>`));
    expect((await checkOverlayFocal(page, { ignore: [".toast"] })).pass).toBe(true);
    await page.evaluate("delete window.__focalRect");
    expect((await checkOverlayFocal(page, {})).failures[0]?.code).toBe("no_focal_rect");
    await page.close();
  });
});

describe("clipped text and repeated labels", () => {
  test("an ellipsised button and a label shown twice fail", async () => {
    const page = await pageWith(`<style>button{width:90px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style>
      <button>Start the whole adventure</button><h2>Ready</h2><p><span>ready</span></p>`);
    const v = await checkText(page, {});
    expect(v.failures.map((f) => f.code).sort()).toEqual(["clipped_text", "repeated_label"]);
    await page.close();
  });
  test("a label hidden on a screen underneath does not count twice; short text fits", async () => {
    const page = await pageWith(`<style>.screen{position:fixed;inset:0;background:#fff}</style>
      <div class="screen"><h2>Ready</h2></div><div class="screen"><h2>Ready</h2><button>Go</button></div>`);
    expect(await checkText(page, {})).toEqual({ pass: true, failures: [] });
    await page.close();
  });
});

describe("TV safe area", () => {
  test("a room code in the overscan corner fails", async () => {
    const page = await pageWith(`<body style="margin:0"><div style="position:fixed;right:8px;top:8px;font:24px sans-serif">ABCD</div></body>`);
    const v = await checkSafeArea(page, {});
    expect(v.failures[0]).toMatchObject({ code: "outside_tv_safe_area", text: "ABCD" });
    await page.close();
  });
  test("content inside the inset passes; a full-bleed backdrop is fine", async () => {
    const page = await pageWith(`<body style="margin:0"><img style="position:fixed;inset:0;width:100vw;height:100vh" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><div style="position:fixed;right:80px;top:50px;font:24px sans-serif">ABCD</div></body>`);
    expect((await checkSafeArea(page, {})).pass).toBe(true);
    await page.close();
  });
});

describe("tap feedback", () => {
  const html = `<style>button{appearance:none;border:0;background:#ddd;font:20px sans-serif;margin:20px;padding:20px}</style>
    <button id="dead">Dead</button>
    <button id="lit" onpointerdown="this.style.background='gold'">Lit</button>
    <button id="beep" onpointerdown="const c=new AudioContext();const o=c.createOscillator();o.connect(c.destination);o.start();o.stop(c.currentTime+0.05)">Beep</button>
    <button id="hold" data-hold>Hold to launch</button>
    <button id="hint" data-hold onpointerup="document.getElementById('msg').textContent='Keep holding!'">Hold me</button>
    <p id="msg"></p>`;
  test("game-specific controls (not buttons) are tapped when the selector names them", async () => {
    const page = () => pageWith(`<div data-key="cake" style="width:120px;height:120px;background:#c96">cake</div>`, { width: 600, height: 400 });
    expect((await checkTapFeedback(page, { close: true })).results).toEqual([]);
    const v = await checkTapFeedback(page, { close: true, selector: "[data-key]" });
    expect(v.failures.map((f) => f.code)).toEqual(["no_tap_feedback"]);
  });
  test("dead button and silent hold-only control fail; lit, beep and hinted hold pass", async () => {
    const v = await checkTapFeedback(async () => pageWith(html, { width: 900, height: 700 }), { close: true });
    const byLabel = Object.fromEntries(v.results.map((r) => [r.label, r]));
    expect(v.failures.map((f) => `${f.code}:${f.label}`).sort()).toEqual(["hold_without_hint:Hold to launch", "no_tap_feedback:Dead"]);
    expect(byLabel["Lit"]?.visual || byLabel["Lit"]?.dom).toBe(true);
    expect(byLabel["Beep"]?.audio).toBe(true);
    expect(byLabel["Hold me"]?.hint).toBe(true);
  });
});
