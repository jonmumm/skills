import type { Page } from "playwright";
import { PaintedList, TextScan, probe, readFocal } from "../page/probe.ts";
import { judgeOverlays } from "./overlay-focal.ts";
import { judgeSafeArea } from "./safe-area.ts";
import { judgeText } from "./text.ts";

export type CheckOpts = { ignore?: string[] };

export async function checkOverlayFocal(page: Page, opts: CheckOpts & { focal?: string }) {
  const focal = await readFocal(page, opts.focal);
  const overlays = await probe(page, "overlays", { ignore: opts.ignore ?? [] }, PaintedList);
  return judgeOverlays(overlays, focal);
}

export async function checkText(page: Page, opts: CheckOpts & { allowRepeated?: string[] }) {
  const scan = await probe(page, "textScan", { ignore: opts.ignore ?? [] }, TextScan);
  return judgeText(scan, { allowRepeated: opts.allowRepeated });
}

export async function checkSafeArea(page: Page, opts: CheckOpts & { fraction?: number }) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("safe-area check needs a fixed viewport");
  const content = await probe(page, "content", { ignore: opts.ignore ?? [] }, PaintedList);
  return judgeSafeArea(content, viewport, opts.fraction);
}
