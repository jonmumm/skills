import { z } from "zod";

export type Frame = { image: string; symbol: string; file?: string; line?: number };
export type CrashLog = { exception: string | null; process: string | null; frames: Frame[]; symbolicated: boolean };

const EMPTY: CrashLog = { exception: null, process: null, frames: [], symbolicated: false };
const TOP_FRAMES = 3;

/** An Apple crash report, in the text format or the JSON .ips format (a JSON header line, then a JSON body). */
export function parseCrashLog(text: string): CrashLog {
  const lines = text.trim().split(/\r?\n/);
  return lines[0]?.startsWith("{") ? parseIps(lines.slice(1).join("\n")) : parseText(lines);
}

const ADDRESS_ONLY = /^0x[0-9a-f]+ \+ (\d+)$/i;

function parseText(lines: string[]): CrashLog {
  const text = lines.join("\n");
  const process = text.match(/^Process:\s+(.+?)\s+\[\d+\]/m)?.[1] ?? null;
  const exception = text.match(/^Exception Type:\s+(.+)$/m)?.[1]?.trim() ?? null;
  const crashed = text.match(/^(?:Triggered by Thread|Crashed Thread):\s+(\d+)/m)?.[1];
  const start = lines.findIndex((l) => crashed !== undefined ? l.startsWith(`Thread ${crashed} Crashed:`) : /^Thread \d+ Crashed:/.test(l));
  const frames: Frame[] = [];
  if (start >= 0) {
    for (const line of lines.slice(start + 1)) {
      const m = line.match(/^\d+\s+(\S+)\s+0x[0-9a-f]+\s+(.+)$/i);
      if (!m) break;
      frames.push(textFrame(m[1]!, m[2]!.trim()));
    }
  }
  if (!exception && !frames.length) return EMPTY;
  return { exception, process, frames, symbolicated: isSymbolicated(frames, process) };
}

function textFrame(image: string, rest: string): Frame {
  const bare = rest.match(ADDRESS_ONLY);
  if (bare) return { image, symbol: `${image} + ${bare[1]}` };
  const m = rest.match(/^(.*?) \+ \d+(?: \(([^():]+):(\d+)\))?$/);
  if (!m) return { image, symbol: rest };
  return { image, symbol: m[1]!, ...(m[2] ? { file: m[2], line: Number(m[3]) } : {}) };
}

const IpsBody = z.object({
  procName: z.string().optional(),
  exception: z.object({ type: z.string(), signal: z.string().optional() }).optional(),
  faultingThread: z.number().int().optional(),
  threads: z
    .array(
      z.object({
        triggered: z.boolean().optional(),
        frames: z.array(
          z.object({
            imageIndex: z.number().int(),
            imageOffset: z.number().optional(),
            symbol: z.string().optional(),
            sourceFile: z.string().optional(),
            sourceLine: z.number().int().optional(),
          }),
        ),
      }),
    )
    .default([]),
  usedImages: z.array(z.object({ name: z.string().optional() })).default([]),
});

function parseIps(json: string): CrashLog {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return EMPTY;
  }
  const parsed = IpsBody.safeParse(raw);
  if (!parsed.success) return EMPTY;
  const body = parsed.data;
  const thread = body.threads.find((t) => t.triggered) ?? (body.faultingThread !== undefined ? body.threads[body.faultingThread] : undefined);
  const frames = (thread?.frames ?? []).map((f): Frame => {
    const image = body.usedImages[f.imageIndex]?.name ?? "???";
    if (!f.symbol) return { image, symbol: `${image} + ${f.imageOffset ?? 0}` };
    return { image, symbol: f.symbol, ...(f.sourceFile ? { file: f.sourceFile } : {}), ...(f.sourceLine !== undefined ? { line: f.sourceLine } : {}) };
  });
  const exception = body.exception ? `${body.exception.type}${body.exception.signal ? ` (${body.exception.signal})` : ""}` : null;
  const process = body.procName ?? null;
  return { exception, process, frames, symbolicated: isSymbolicated(frames, process) };
}

const isBare = (f: Frame) => f.symbol === `${f.image} + ${f.symbol.split(" + ")[1]}`;

function isSymbolicated(frames: Frame[], process: string | null): boolean {
  const app = frames.filter((f) => f.image === process);
  return (app.length ? app : frames).some((f) => !isBare(f));
}

/** A crash's title, its grouping key (exception kind + top app frames, no line numbers) and a readable stack. */
export function crashSignature(log: CrashLog): { headline: string; key: string; stack: string } {
  if (!log.exception && !log.frames.length) return { headline: "crash (no readable crash log)", key: "unknown", stack: "" };
  const app = log.frames.filter((f) => f.image === log.process);
  const top = (app.length ? app : log.frames).slice(0, TOP_FRAMES);
  const kind = (log.exception ?? "crash").split(" ")[0];
  const where = top[0] ? ` in ${top[0].symbol}${log.symbolicated ? "" : " (unsymbolicated)"}` : "";
  return {
    headline: `${log.exception ?? "crash"}${where}`,
    key: [kind, ...top.map((f) => f.symbol)].join("|"),
    stack: log.frames.map((f, i) => `${i} ${f.image} ${f.symbol}${f.file ? ` (${f.file}:${f.line})` : ""}`).join("\n"),
  };
}
