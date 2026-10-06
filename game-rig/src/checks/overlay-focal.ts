import { z } from "zod";
import { Rect, area, intersection } from "../geometry.ts";
import { verdict, type Verdict } from "./verdict.ts";

export const Painted = z.object({ selector: z.string(), text: z.string(), rect: Rect });
export type Painted = z.infer<typeof Painted>;
export type OverlayFailure =
  | { code: "overlay_covers_focal"; selector: string; text: string; rect: Rect; overlapPx: number }
  | { code: "no_focal_rect" };

/** Overlap below this many px² is anti-aliasing and box-shadow bleed, not an overlay. */
const MIN_OVERLAP_PX = 64;

export function judgeOverlays(overlays: Painted[], focal: Rect | null): Verdict<OverlayFailure> {
  if (!focal) return verdict<OverlayFailure>([{ code: "no_focal_rect" }]);
  const failures: OverlayFailure[] = [];
  for (const o of overlays) {
    const hit = intersection(o.rect, focal);
    if (hit && area(hit) >= MIN_OVERLAP_PX)
      failures.push({ code: "overlay_covers_focal", selector: o.selector, text: o.text, rect: o.rect, overlapPx: Math.round(area(hit)) });
  }
  return verdict(failures);
}
