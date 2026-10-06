import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const FONT = ["/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find(existsSync);

/** Text that is safe inside an ffmpeg drawtext `text='...'` option. */
export const drawtextSafe = (s: string): string => s.replace(/[\\':%,;[\]]/g, " ");

export function drawtext(text: string, size: number, at = "x=(w-tw)/2:y=10"): string {
  const font = FONT ? `fontfile='${FONT}':` : "";
  return `drawtext=${font}text='${drawtextSafe(text)}':fontcolor=white:fontsize=${size}:box=1:boxcolor=black@0.6:boxborderw=6:${at}`;
}

/** Labeled grid of screenshots (letterboxed into equal cells). Returns false when there is nothing to tile. */
export function tileSheet(shots: { path: string; label: string }[], out: string, opts: { cols?: number; cellW?: number; cellH?: number } = {}): boolean {
  const files = shots.filter((s) => existsSync(s.path));
  if (files.length === 0) return false;
  const cols = Math.min(opts.cols ?? 4, files.length);
  const w = opts.cellW ?? 480;
  const h = opts.cellH ?? 300;
  const inputs = files.flatMap((f) => ["-i", f.path]);
  const cells = files.map(
    (f, i) => `[${i}:v]scale=${w}:${h - 30}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:30+(oh-30-ih)/2:color=0x202020,${drawtext(f.label, 16, "x=6:y=4")}[c${i}]`,
  );
  const layout = files.map((_, i) => `${(i % cols) * w}_${Math.floor(i / cols) * h}`).join("|");
  const filter = files.length === 1 ? `${cells[0]};[c0]null` : `${cells.join(";")};${files.map((_, i) => `[c${i}]`).join("")}xstack=inputs=${files.length}:layout=${layout}:fill=0x101010`;
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...inputs, "-filter_complex", filter, "-frames:v", "1", out]);
  return true;
}
