import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { LogEvent } from "../schemas.ts";

export function parseNdjson(text: string): { events: LogEvent[]; invalidLines: number } {
  const events: LogEvent[] = [];
  let invalidLines = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = LogEvent.safeParse(JSON.parse(line));
      if (parsed.success) events.push(parsed.data);
      else invalidLines++;
    } catch {
      invalidLines++;
    }
  }
  return { events, invalidLines };
}

/** Escape hatch for any log store: run a repo-owned command that prints NDJSON LogEvents. */
export async function runCommandSource(run: string, window: { from: number; to: number }) {
  const { stdout } = await promisify(execFile)("bash", ["-c", run], {
    env: { ...process.env, SRE_FROM: String(window.from), SRE_TO: String(window.to) },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
  return parseNdjson(stdout);
}
