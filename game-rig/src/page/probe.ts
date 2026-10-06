import { readFileSync } from "node:fs";
import type { Page } from "playwright";
import { z } from "zod";
import { Rect } from "../geometry.ts";
import { Painted } from "../checks/overlay-focal.ts";
import { TextScan } from "../checks/text.ts";

const SOURCE = readFileSync(new URL("./probe.js", import.meta.url), "utf8");

export async function injectProbe(page: Page): Promise<void> {
  await page.evaluate(SOURCE);
}

/** Calls window.__gameRigProbe[name](arg) in the page and parses the answer at the boundary. */
export async function probe<T>(page: Page, name: string, arg: unknown, schema: z.ZodType<T>): Promise<T> {
  await injectProbe(page);
  const raw: unknown = await page.evaluate(`window.__gameRigProbe.${name}(${JSON.stringify(arg ?? {})})`);
  return schema.parse(raw);
}

export const PaintedList = z.array(Painted);
export { TextScan };
export const Tappable = z.object({ index: z.number(), selector: z.string(), label: z.string(), rect: Rect, holdOnly: z.boolean() });
export type Tappable = z.infer<typeof Tappable>;
export const MonitorRead = z.object({
  now: z.number(),
  downAt: z.number().nullable(),
  events: z.array(z.object({ kind: z.enum(["dom", "audio"]), t: z.number(), sig: z.string() })),
});
export type MonitorRead = z.infer<typeof MonitorRead>;

export const DEFAULT_FOCAL = "window.__focalRect?.() ?? null";

export async function readFocal(page: Page, expression = DEFAULT_FOCAL): Promise<Rect | null> {
  const raw: unknown = await page.evaluate(`(() => { try { return ${expression}; } catch { return null; } })()`);
  return Rect.nullable().parse(raw ?? null);
}
