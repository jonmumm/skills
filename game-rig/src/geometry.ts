import { z } from "zod";

export const Rect = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
export type Rect = z.infer<typeof Rect>;
export type Size = { width: number; height: number };
export type Sides = { left: number; top: number; right: number; bottom: number };

export const area = (a: Rect): number => Math.max(0, a.width) * Math.max(0, a.height);

export function intersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** `frame` shrunk by `fraction` of its width/height on every side. */
export function inset(frame: Rect, fraction: number): Rect {
  const dx = frame.width * fraction;
  const dy = frame.height * fraction;
  return { x: frame.x + dx, y: frame.y + dy, width: frame.width - 2 * dx, height: frame.height - 2 * dy };
}

/** How far `a` pokes out of `frame` on each side, or null when it is inside. */
export function outsideBy(a: Rect, frame: Rect, tolerance = 0): Sides | null {
  const sides = {
    left: Math.max(0, frame.x - a.x),
    top: Math.max(0, frame.y - a.y),
    right: Math.max(0, a.x + a.width - (frame.x + frame.width)),
    bottom: Math.max(0, a.y + a.height - (frame.y + frame.height)),
  };
  return Object.values(sides).some((v) => v > tolerance) ? sides : null;
}
