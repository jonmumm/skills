/**
 * `game-rig check`: every screen the config lists × every viewport of its role: screenshot, then
 * overlay-vs-focal, clipped/repeated text, tap feedback and (TV at 1280×720) the overscan safe area.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { type CheckName, type GameRigConfig, type RigContext, type Viewport, viewportsFor } from "./config.ts";
import { checkOverlayFocal, checkSafeArea, checkText } from "./checks/page-checks.ts";
import { checkTapFeedback } from "./checks/tap-run.ts";
import { tileSheet } from "./sheet.ts";

export type Failure = { code: string } & Record<string, unknown>;
export type ScreenResult = { screen: string; role: string; viewport: string; shot: string; failures: Failure[]; errors: string[] };
export type Report = { pass: boolean; results: ScreenResult[]; sheet?: string };

export const FAKE_MOTION = `DeviceMotionEvent.requestPermission = async () => "granted";
  setInterval(() => window.dispatchEvent(new DeviceMotionEvent("devicemotion", { acceleration: { x: 0.1, y: 0.1, z: 0 },
    accelerationIncludingGravity: { x: 0, y: 9.8, z: 0 }, interval: 100 })), 100);`;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const size = (v: Viewport) => `${v.width}x${v.height}`;

export async function launchChrome(config: GameRigConfig, extra: string[] = []): Promise<Browser> {
  const args = ["--autoplay-policy=no-user-gesture-required", ...config.chromeArgs, ...extra];
  // Real Chrome when installed (codecs, GPU paths like the user's); Playwright's Chromium otherwise.
  return chromium.launch({ channel: "chrome", args }).catch(() => chromium.launch({ args }));
}

export async function newDevice(browser: Browser, config: GameRigConfig, role: string, viewport: Viewport, extra: Parameters<Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  const kind = config.roles[role]?.kind ?? "tv";
  const touch = kind !== "tv";
  const ctx = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: touch, deviceScaleFactor: 1, ...extra });
  if (touch) await ctx.addInitScript(FAKE_MOTION);
  return ctx;
}

type Opened = { page: Page; contexts: BrowserContext[] };

/** Brings one screen up from scratch: its own device plus any others its setup opens. */
async function openScreen(browser: Browser, config: GameRigConfig, screen: GameRigConfig["screens"][number], viewport: Viewport): Promise<Opened> {
  const contexts: BrowserContext[] = [];
  const ctx = await newDevice(browser, config, screen.role, viewport);
  contexts.push(ctx);
  const page = await ctx.newPage();
  const rig: RigContext = {
    page,
    role: screen.role,
    baseUrl: config.baseUrl,
    viewport,
    browser,
    wait,
    open: async (role, path) => {
      const vp = viewportsFor(config, role)[0];
      if (!vp) throw new Error(`role ${role} has no viewport`);
      const other = await newDevice(browser, config, role, vp);
      contexts.push(other);
      const p = await other.newPage();
      if (path) await p.goto(new URL(path, config.baseUrl).href);
      return p;
    },
  };
  if (screen.path) await page.goto(new URL(screen.path, config.baseUrl).href);
  if (screen.setup) await screen.setup(rig);
  await wait(screen.settleMs);
  return { page, contexts };
}

const closeAll = (o: Opened) => Promise.all(o.contexts.map((c) => c.close().catch(() => undefined)));

export type RunOpts = { out: string; only?: string[]; checks?: CheckName[]; noChecks?: boolean; log?: (line: string) => void };

export async function runChecks(config: GameRigConfig, opts: RunOpts): Promise<Report> {
  const log = opts.log ?? (() => undefined);
  mkdirSync(opts.out, { recursive: true });
  const browser = await launchChrome(config);
  const results: ScreenResult[] = [];
  try {
    for (const screen of config.screens) {
      if (opts.only && !opts.only.includes(screen.name)) continue;
      const kind = config.roles[screen.role]?.kind;
      const checks = opts.noChecks ? [] : screen.checks.filter((c) => !opts.checks || opts.checks.includes(c));
      const viewports = viewportsFor(config, screen.role, screen);
      for (const [vi, viewport] of viewports.entries()) {
        const dir = join(opts.out, screen.name);
        mkdirSync(dir, { recursive: true });
        const shot = join(dir, `${screen.role}-${size(viewport)}.png`);
        const result: ScreenResult = { screen: screen.name, role: screen.role, viewport: size(viewport), shot, failures: [], errors: [] };
        results.push(result);
        let opened: Opened | null = null;
        try {
          opened = await openScreen(browser, config, screen, viewport);
          const page = opened.page;
          page.on("pageerror", (e) => result.errors.push(e.message));
          await page.screenshot({ path: shot });
          const add = (v: { failures: object[] }) => result.failures.push(...v.failures.map((f) => ({ code: "unknown", ...f })));
          if (checks.includes("overlay") && screen.focal && kind === "tv") add(await checkOverlayFocal(page, { focal: config.focal, ignore: config.ignore.overlay }));
          if (checks.includes("text")) add(await checkText(page, { ignore: config.ignore.text, allowRepeated: config.allowRepeatedLabels }));
          if (checks.includes("safe-area") && kind === "tv" && viewport.width === 1280 && viewport.height === 720)
            add(await checkSafeArea(page, { ignore: config.ignore.safeArea, fraction: config.safeAreaInset }));
          // Tapping is slow (a fresh screen per button): once per screen, at its first viewport.
          if (checks.includes("tap") && vi === 0) {
            await closeAll(opened);
            opened = null;
            const pending: Opened[] = [];
            const tap = await checkTapFeedback(
              async () => {
                const o = await openScreen(browser, config, screen, viewport);
                pending.push(o);
                return o.page;
              },
              { ignore: config.ignore.tap, holdSelector: config.holdSelector, maxButtons: config.maxTapsPerScreen, close: false },
            );
            await Promise.all(pending.map(closeAll));
            add(tap);
          }
        } catch (e) {
          result.failures.push({ code: "screen_error", message: e instanceof Error ? e.message.split("\n")[0] : String(e) });
        } finally {
          if (opened) await closeAll(opened);
        }
        log(`${result.failures.length ? "FAIL" : "ok  "} ${screen.name} @ ${result.viewport}${result.failures.map((f) => `\n     - ${describe(f)}`).join("")}`);
      }
    }
  } finally {
    await browser.close();
  }
  const sheet = join(opts.out, "sheet.png");
  const shots = results.map((r) => ({ path: r.shot, label: `${r.screen} ${r.viewport}${r.failures.length ? ` (${r.failures.length} issues)` : ""}` }));
  const made = tileSheet(shots, sheet);
  const report: Report = { pass: results.every((r) => r.failures.length === 0), results, ...(made ? { sheet } : {}) };
  writeFileSync(join(opts.out, "report.json"), JSON.stringify(report, null, 2));
  return report;
}

function describe(f: Failure): string {
  const bits = Object.entries(f)
    .filter(([k]) => k !== "code" && k !== "rect")
    .map(([k, v]) => `${k}=${typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v)}`);
  return `${f.code} ${bits.join(" ")}`;
}
