import { createHash } from "node:crypto";

// Order matters: wider shapes first so their digits never reach the <n> rule.
const RULES: Array<[RegExp, string]> = [
  [/https?:\/\/[^\s"')]+/g, "<url>"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "<email>"],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>"],
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<ip>"],
  [/\b(?=[0-9a-f]*\d)[0-9a-f]{8,}\b/gi, "<hex>"],
  [/"[^"]*"|'[^']*'/g, "<str>"],
  [/\d+/g, "<n>"],
];

/** The shape of a message with request-specific values removed: the grouping key. */
export function normalizeMessage(message: string): string {
  let out = message.split("\n", 1)[0] ?? "";
  for (const [pattern, placeholder] of RULES) out = out.replace(pattern, placeholder);
  return out.replace(/\s+/g, " ").trim().slice(0, 300);
}

export function fingerprint(service: string, message: string): string {
  return createHash("sha256").update(`${service}\n${normalizeMessage(message)}`).digest("hex").slice(0, 12);
}
