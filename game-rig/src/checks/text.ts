import { z } from "zod";
import { verdict, type Verdict } from "./verdict.ts";

export const TextScan = z.object({
  clipped: z.array(z.object({ selector: z.string(), text: z.string(), kind: z.enum(["ellipsis", "overflow", "line-clamp"]) })),
  labels: z.array(z.object({ selector: z.string(), text: z.string() })),
});
export type TextScan = z.infer<typeof TextScan>;
export type TextFailure =
  | { code: "clipped_text"; selector: string; text: string; kind: string }
  | { code: "repeated_label"; label: string; count: number; selectors: string[] };

export const normalizeLabel = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();
/** Only words repeat confusingly; digits and single letters ("3", "x") are scores and keys. */
const isWordy = (s: string): boolean => (s.match(/\p{L}/gu) ?? []).length >= 2;

export function judgeText(scan: TextScan, opts: { allowRepeated?: string[] }): Verdict<TextFailure> {
  const allowed = new Set((opts.allowRepeated ?? []).map(normalizeLabel));
  const failures: TextFailure[] = scan.clipped.map((c) => ({ code: "clipped_text", ...c }));
  const groups = new Map<string, string[]>();
  for (const l of scan.labels) {
    const key = normalizeLabel(l.text);
    if (!isWordy(key) || allowed.has(key)) continue;
    groups.set(key, [...(groups.get(key) ?? []), l.selector]);
  }
  for (const [label, selectors] of groups)
    if (selectors.length >= 2) failures.push({ code: "repeated_label", label, count: selectors.length, selectors });
  return verdict(failures);
}
