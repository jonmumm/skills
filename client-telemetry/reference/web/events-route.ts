import { z } from "zod";
import { ClientEventSchema, type ClientEvent } from "./telemetry";

/**
 * POST /events on the project's Worker. Parses a batch of client events with Zod and re-emits each
 * one as a wide event (one structured log line) in Workers Logs: console.error for error events,
 * console.log for the rest. Product events also count in Analytics Engine when a binding is given.
 *
 * Reference copy from the client-telemetry skill. Each project owns its copy.
 */

const BatchSchema = z.object({ events: z.array(ClientEventSchema).max(500) });
const MAX_BODY = 1_000_000;

/** Keys a client must never send (kids play these games). Dropped even if a bug sends them. */
const FORBIDDEN_KEY = /name|email|token|password|input|message|(^|_)text($|_)/i;

export type ClientLine = {
  event: string;
  service: string;
  version: string;
  source: "client";
  outcome: "ok" | "error";
  session_id: string;
  client_at: number;
  error?: { type: string; message: string; stack?: string };
  [context: string]: unknown;
};

export type Logger = { log(line: ClientLine): void; error(line: ClientLine): void };
/** The part of an Analytics Engine binding this route uses. */
export type Counts = { writeDataPoint(p: { indexes?: string[]; blobs?: string[]; doubles?: number[] }): void };

export type EventsContext = {
  service: string;
  logger?: Logger;
  counts?: Counts;
  headers?: Record<string, string>;
};

function safeData(data: ClientEvent["data"]): Record<string, string | number | boolean | null> {
  return Object.fromEntries(Object.entries(data).filter(([k]) => !FORBIDDEN_KEY.test(k)));
}

/** One wide event per client event. Reserved fields are written last so data cannot overwrite them. */
export function toLines(events: ClientEvent[], service: string): ClientLine[] {
  return events.map((e): ClientLine => ({
    ...safeData(e.data),
    event: `client.${e.type}`,
    service,
    version: e.version,
    source: "client",
    outcome: e.error ? "error" : "ok",
    session_id: e.session,
    client_at: e.at,
    ...(e.error ? { error: e.error } : {}),
  }));
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "content-type": "application/json" } });

export async function handleEvents(req: Request, ctx: EventsContext): Promise<Response> {
  const logger: Logger = ctx.logger ?? { log: (l) => console.log(l), error: (l) => console.error(l) };
  const h = ctx.headers ?? {};
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: "too big" }, 413, h);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad json" }, 400, h);
  }
  const parsed = BatchSchema.safeParse(body);
  if (!parsed.success) return json({ error: "bad events" }, 400, h);

  for (const line of toLines(parsed.data.events, ctx.service)) {
    // Log the object, not a JSON string: Workers Logs indexes its fields.
    if (line.outcome === "error") logger.error(line);
    else logger.log(line);
    ctx.counts?.writeDataPoint({
      indexes: [ctx.service],
      blobs: [line.event, line.outcome, line.version, line.error?.type ?? ""],
      doubles: [1],
    });
  }
  return json({ ok: true, received: parsed.data.events.length }, 200, h);
}
