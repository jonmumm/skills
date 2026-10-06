import { z } from "zod";
import { identifyError } from "../identify.ts";
import type { Config, LogEvent } from "../schemas.ts";

const LIMIT = 2000;

// Parsed loosely on purpose: the API documents these fields but not every one is always present.
const CfEvent = z.looseObject({
  $metadata: z.object({
    id: z.string(),
    message: z.string().optional(),
    error: z.string().optional(),
    level: z.string().optional(),
    service: z.string().optional(),
    timestamp: z.union([z.string(), z.number()]).optional(),
  }),
  $workers: z.object({ outcome: z.string().optional(), versionId: z.string().optional(), scriptName: z.string().optional() }).optional(),
  timestamp: z.number().optional(),
});

const CfResponse = z.object({
  success: z.boolean(),
  errors: z.array(z.object({ message: z.string() })).optional(),
  result: z
    .object({ events: z.union([z.array(CfEvent), z.object({ events: z.array(CfEvent) })]) })
    .optional(),
});

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type CloudflareQuery = {
  accountId: string;
  token: string;
  service: string;
  levels: string[];
  outcomes: string[];
  from: number;
  to: number;
  errorFields?: Config["errorFields"];
  fetch?: Fetch;
};

const eq = (key: string, value: string) => ({ key, operation: "eq", type: "string", value });

/**
 * Workers Logs via POST /accounts/{id}/workers/observability/telemetry/query.
 * One query per error level and per failing outcome keeps each under the 2000-event cap.
 */
export async function fetchCloudflareEvents(q: CloudflareQuery): Promise<{ events: LogEvent[]; truncated: boolean }> {
  const fetch = q.fetch ?? globalThis.fetch;
  const filters = [
    ...q.levels.map((level) => eq("$metadata.level", level)),
    ...q.outcomes.map((outcome) => eq("$workers.outcome", outcome)),
  ];
  const byId = new Map<string, LogEvent>();
  let truncated = false;

  for (const filter of filters) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${q.accountId}/workers/observability/telemetry/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${q.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        queryId: "sre-agent",
        view: "events",
        limit: LIMIT,
        timeframe: { from: q.from, to: q.to },
        parameters: { filterCombination: "and", filters: [eq("$metadata.service", q.service), filter] },
      }),
    });
    const parsed = CfResponse.parse(await res.json());
    if (!res.ok || !parsed.success || !parsed.result) {
      throw new Error(`Cloudflare ${res.status}: ${(parsed.errors ?? []).map((e) => e.message).join("; ") || "query failed"}`);
    }
    const raw = Array.isArray(parsed.result.events) ? parsed.result.events : parsed.result.events.events;
    if (raw.length >= LIMIT) truncated = true;
    for (const e of raw) byId.set(e.$metadata.id, toLogEvent(e, q.service, q.errorFields ?? { message: [], type: [] }));
  }
  return { events: [...byId.values()], truncated };
}

function toLogEvent(e: z.infer<typeof CfEvent>, service: string, errorFields: Config["errorFields"]): LogEvent {
  const m = e.$metadata;
  const ts = e.timestamp ?? (typeof m.timestamp === "number" ? m.timestamp : m.timestamp ? Date.parse(m.timestamp) : Date.now());
  return {
    id: m.id,
    timestamp: ts,
    level: m.level ?? (m.error ? "error" : "info"),
    message: identifyError(m.message ?? m.error ?? "", extractedFields(e), errorFields),
    service: m.service ?? service,
    ...(e.$workers?.outcome ? { outcome: e.$workers.outcome } : {}),
    ...(e.$workers?.versionId ? { versionId: e.$workers.versionId } : {}),
  };
}

/** Fields Workers Logs extracted from a structured log line: everything outside its own $-prefixed metadata. */
function extractedFields(e: z.infer<typeof CfEvent>): Record<string, unknown> | undefined {
  const entries = Object.entries(e).filter(([k]) => !k.startsWith("$") && k !== "timestamp");
  return entries.length ? Object.fromEntries(entries) : undefined;
}
