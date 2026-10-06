import { type Rect, type Sides, type Size, inset, outsideBy } from "../geometry.ts";
import type { Painted } from "./overlay-focal.ts";
import { verdict, type Verdict } from "./verdict.ts";

export type SafeAreaFailure = { code: "outside_tv_safe_area"; selector: string; text: string; rect: Rect; by: Sides };

/** TV overscan: every piece of content inside a `fraction` inset (5% at 1280×720 = 64 / 36 px). */
export function judgeSafeArea(content: Painted[], viewport: Size, fraction = 0.05): Verdict<SafeAreaFailure> {
  const safe = inset({ x: 0, y: 0, ...viewport }, fraction);
  const failures: SafeAreaFailure[] = [];
  for (const c of content) {
    const by = outsideBy(c.rect, safe, 1);
    if (by) failures.push({ code: "outside_tv_safe_area", selector: c.selector, text: c.text, rect: c.rect, by });
  }
  return verdict(failures);
}
