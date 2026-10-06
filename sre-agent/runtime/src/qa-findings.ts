import { readFileSync } from "node:fs";
import { z } from "zod";
import type { LogEvent } from "./schemas.ts";

/**
 * The handoff from qa-agent's local run: findings from `e2e explore` (tester-army/e2e) after the
 * verification pass. Confirmed and unverified findings become error events that sre-agent files as
 * issues; rejected ones are dropped.
 */
const Finding = z.object({
  title: z.string().min(1).max(300),
  severity: z.number().int().min(1).max(5),
  expected: z.string().max(1000),
  actual: z.string().max(1000),
  reproduction: z.array(z.string().max(500)).max(20),
  path: z.string().max(300).optional(),
  target: z.string().min(1).max(40),
  charter: z.string().max(500),
  verification: z.discriminatedUnion("status", [
    z.object({ status: z.literal("confirmed"), test: z.string().min(1).max(300) }),
    z.object({ status: z.literal("unverified"), note: z.string().min(1).max(500) }),
    z.object({ status: z.literal("rejected"), note: z.string().max(500) }),
  ]),
});

const Batch = z.object({
  runId: z.string().min(1).max(100),
  foundAt: z.iso.datetime(),
  findings: z.array(Finding).max(50),
});

export function toLogEvents(input: unknown): LogEvent[] {
  const batch = Batch.parse(input);
  return batch.findings.flatMap((f, i): LogEvent[] => {
    if (f.verification.status === "rejected") return [];
    const proof = f.verification.status === "confirmed" ? `confirmed by ${f.verification.test}` : `not reproduced: ${f.verification.note}`;
    const message = [
      f.path ? `${f.title} (${f.path})` : f.title,
      `Severity: ${f.severity} of 5 · target: ${f.target} · ${proof}`,
      `Expected: ${f.expected}`,
      `Actual: ${f.actual}`,
      "Steps:",
      ...f.reproduction.map((step, n) => `${n + 1}. ${step}`),
      `Charter: ${f.charter}`,
    ].join("\n");
    return [{ id: `${batch.runId}:${i}`, timestamp: Date.parse(batch.foundAt), level: "error", service: "qa", message }];
  });
}

// CLI for a `command` source: node src/qa-findings.ts findings.json  →  NDJSON LogEvents on stdout
if (import.meta.main) {
  const path = process.argv[2];
  if (!path) throw new Error("usage: node src/qa-findings.ts <findings.json>");
  for (const e of toLogEvents(JSON.parse(readFileSync(path, "utf8")))) process.stdout.write(`${JSON.stringify(e)}\n`);
}
