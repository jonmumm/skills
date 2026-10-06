import { z } from "zod";
import { verdict, type Verdict } from "./verdict.ts";

export const TAP_BUDGET_MS = 300;

export const TapResult = z.object({
  label: z.string(),
  selector: z.string(),
  holdOnly: z.boolean(),
  /** ms from pointerdown to the first signal seen (or to the last sample when there was none). */
  elapsedMs: z.number(),
  dom: z.boolean(),
  visual: z.boolean(),
  audio: z.boolean(),
  hint: z.boolean(),
});
export type TapResult = z.infer<typeof TapResult>;
export type TapFailure = { code: "no_tap_feedback" | "hold_without_hint" | "tap_feedback_late"; label: string; selector: string; elapsedMs: number };

export function judgeTap(results: TapResult[]): Verdict<TapFailure> {
  const failures: TapFailure[] = [];
  for (const t of results) {
    const f = { label: t.label, selector: t.selector, elapsedMs: Math.round(t.elapsedMs) };
    if (t.holdOnly) {
      if (!t.hint) failures.push({ code: "hold_without_hint", ...f });
    } else if (!(t.dom || t.visual || t.audio)) failures.push({ code: "no_tap_feedback", ...f });
    else if (t.elapsedMs > TAP_BUDGET_MS) failures.push({ code: "tap_feedback_late", ...f });
  }
  return verdict(failures);
}
