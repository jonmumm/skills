import type { Config } from "./schemas.ts";

// Common places projects put an error's message and type, most specific first.
const MESSAGE_PATHS = ["error.message", "err.message", "exception.message", "error", "message", "msg"];
const TYPE_PATHS = ["error.type", "error.name", "err.type", "err.name", "exception.type", "exception.name", "errorType", "event", "type"];

type Fields = Record<string, unknown>;

const isRecord = (v: unknown): v is Fields => typeof v === "object" && v !== null && !Array.isArray(v);

function lookup(obj: Fields, path: string): string | undefined {
  let cur: unknown = obj;
  for (const key of path.split(".")) cur = isRecord(cur) ? cur[key] : undefined;
  return typeof cur === "string" && cur !== "" ? cur : undefined;
}

const first = (obj: Fields, paths: string[]) => paths.map((p) => lookup(obj, p)).find((v) => v !== undefined);

function parseObject(raw: string): Fields | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The text that identifies an error, whatever shape the project logs it in: plain text as-is,
 * structured lines as "type: message". A structured line with no recognizable message names its
 * fields instead, so it becomes one issue asking for an errorFields mapping.
 */
export function identifyError(raw: string, extracted: Fields | undefined, mapping: Config["errorFields"]): string {
  const messagePaths = [...mapping.message, ...MESSAGE_PATHS];
  const typePaths = [...mapping.type, ...TYPE_PATHS];
  const line = parseObject(raw);
  for (const obj of [extracted, line]) {
    if (!obj) continue;
    const message = first(obj, messagePaths);
    if (message === undefined) continue;
    const type = first(obj, typePaths);
    return type ? `${type}: ${message}` : message;
  }
  if (!line) return raw;
  return `sre-agent could not find the error message in this log line. Fields: ${Object.keys(line).sort().join(", ")}. Map them with errorFields in .github/sre-agent.yml.`;
}
