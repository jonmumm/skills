import type { Page } from "playwright";
import { PNG } from "pngjs";
import { z } from "zod";
import type { Rect } from "../geometry.ts";
import { MonitorRead, Tappable, probe } from "../page/probe.ts";
import { TAP_BUDGET_MS, judgeTap, type TapResult } from "./tap-feedback.ts";

export type TapOpts = {
  ignore?: string[];
  holdSelector?: string;
  /** Close each page after its tap (true when `open` makes a fresh context per call). */
  close?: boolean;
  maxButtons?: number;
  /** How long a hold-only control has to show its hint after a plain tap. */
  hintWithinMs?: number;
};

/** Share of pixels whose colour moved by more than `threshold` in any channel. */
export function pixelChange(a: Buffer, b: Buffer, threshold = 24): number {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return 1;
  let changed = 0;
  for (let i = 0; i < pa.data.length; i += 4) {
    const d = Math.max(
      Math.abs((pa.data[i] ?? 0) - (pb.data[i] ?? 0)),
      Math.abs((pa.data[i + 1] ?? 0) - (pb.data[i + 1] ?? 0)),
      Math.abs((pa.data[i + 2] ?? 0) - (pb.data[i + 2] ?? 0)),
    );
    if (d > threshold) changed++;
  }
  return changed / (pa.width * pa.height);
}

/** A tap changed the picture when it moved clearly more than the scene moves on its own. */
export const visualSignal = (baseline: number, tapped: number): boolean => tapped > Math.max(2 * baseline, 0.002);

function around(r: Rect, page: Page): Rect {
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  const x = Math.max(0, r.x - 24);
  const y = Math.max(0, r.y - 24);
  return { x, y, width: Math.max(1, Math.min(vp.width - x, r.width + 48)), height: Math.max(1, Math.min(vp.height - y, r.height + 48)) };
}

const TextList = z.array(z.string());
const Now = z.number();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function tapOne(page: Page, target: Tappable, opts: TapOpts): Promise<TapResult> {
  const clip = around(target.rect, page);
  const shot = () => page.screenshot({ clip, animations: "allow" });
  const textsBefore = new Set(await probe(page, "visibleTexts", {}, TextList));
  // Baseline: how much the screen and the DOM change in 300 ms with nobody touching it.
  await probe(page, "monitorStart", {}, Now);
  const a1 = await shot();
  await wait(TAP_BUDGET_MS);
  const a2 = await shot();
  const base = await probe(page, "monitorRead", {}, MonitorRead);
  const baseSigs = new Set(base.events.map((e) => `${e.kind}|${e.sig}`));
  const baseline = pixelChange(a1, a2);

  await probe(page, "monitorStart", {}, Now);
  const x = target.rect.x + target.rect.width / 2;
  const y = target.rect.y + target.rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  const shotAt = await probe(page, "now", {}, Now);
  const pressed = await shot();
  await wait(60);
  await page.mouse.up();
  await wait(Math.max(0, TAP_BUDGET_MS - 60));
  const read = await probe(page, "monitorRead", {}, MonitorRead);
  const downAt = read.downAt ?? shotAt;
  const after = await shot();
  const soon = read.events.filter((e) => e.t >= downAt && e.t <= downAt + TAP_BUDGET_MS);
  const dom = soon.filter((e) => e.kind === "dom" && !baseSigs.has(`dom|${e.sig}`));
  const audio = soon.filter((e) => e.kind === "audio");
  const visual = visualSignal(baseline, pixelChange(a2, pressed)) || visualSignal(baseline, pixelChange(a2, after));
  const firsts = [...dom, ...audio].map((e) => e.t - downAt);
  if (visual) firsts.push(Math.max(0, shotAt - downAt));
  const elapsedMs = firsts.length ? Math.min(...firsts) : read.now - downAt;

  let hint = false;
  if (target.holdOnly) {
    const deadline = Date.now() + (opts.hintWithinMs ?? 1000);
    while (!hint && Date.now() < deadline) {
      const now = await probe(page, "visibleTexts", {}, TextList);
      hint = now.some((t) => !textsBefore.has(t));
      if (!hint) await wait(100);
    }
  }
  return { label: target.label, selector: target.selector, holdOnly: target.holdOnly, elapsedMs, dom: dom.length > 0, visual, audio: audio.length > 0, hint };
}

/**
 * Taps every visible button / [role=button] once, each on a fresh page from `open` (a tap usually
 * changes the screen, so the next button must start from the same state).
 */
export async function checkTapFeedback(open: () => Promise<Page>, opts: TapOpts = {}) {
  const arg = { ignore: opts.ignore ?? [], ...(opts.holdSelector ? { holdSelector: opts.holdSelector } : {}) };
  const first = await open();
  const targets = (await probe(first, "tappables", arg, z.array(Tappable))).slice(0, opts.maxButtons ?? 16);
  if (opts.close) await first.close();
  const results: TapResult[] = [];
  for (const [i, t] of targets.entries()) {
    const page = i === 0 && !opts.close ? first : await open();
    const now = await probe(page, "tappables", arg, z.array(Tappable));
    const same = now.find((n) => n.index === t.index && n.label === t.label) ?? now.find((n) => n.label === t.label);
    if (same) results.push(await tapOne(page, same, opts));
    if (opts.close) await page.close();
  }
  return { ...judgeTap(results), results };
}
