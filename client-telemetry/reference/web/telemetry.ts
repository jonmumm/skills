import { z } from "zod";

/**
 * Client telemetry that survives offline play. Events are buffered in storage (localStorage on the
 * web) and posted to the project's own Worker when there is a network. The Worker re-emits each one
 * as a wide event in Workers Logs, where /sre-agent reads it.
 *
 * Reference copy from the client-telemetry skill. Each project owns its copy: change it freely.
 */

const Primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const ClientErrorSchema = z.object({
  type: z.string().max(100),
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
});
export type ClientError = z.infer<typeof ClientErrorSchema>;

export const ClientEventSchema = z.object({
  at: z.number(),
  type: z.string().max(100),
  version: z.string().max(100),
  session: z.string().max(100),
  data: z.record(z.string(), Primitive),
  error: ClientErrorSchema.optional(),
});
export type ClientEvent = z.infer<typeof ClientEventSchema>;
export type EventData = Record<string, z.infer<typeof Primitive>>;

const AliveSchema = z.object({ session: z.string(), since: z.number(), last: z.number() });

/** The subset of Storage the buffer needs. localStorage fits; so does an AsyncStorage/MMKV shim. */
export type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };

export interface Telemetry {
  /** A product event ("round_started") or session event. Data is ids, counts and flags only. */
  track(type: string, data?: EventData): void;
  /** An error event. Dropped after `maxPerFingerprint` repeats of the same type + message. */
  error(err: unknown, data?: EventData, type?: string): void;
  pending(): ClientEvent[];
  /** Send what is buffered. Keeps everything if `send` fails or throws. */
  flush(send: (events: ClientEvent[]) => Promise<boolean>): Promise<boolean>;
  /** Marks the page as running and reports the previous session if it never closed. */
  sessionStart(): void;
  heartbeat(): void;
  sessionEnd(): void;
}

export type TelemetryOptions = {
  kv: KV;
  version: string;
  prefix?: string;
  now?: () => number;
  /** Buffer size; oldest events drop first. */
  max?: number;
  /** Same error type + message more than this many times in one session is dropped. */
  maxPerFingerprint?: number;
  /** Error events per minute, across all fingerprints. */
  maxErrorsPerMinute?: number;
  newSessionId?: () => string;
};

/** Normalizes anything thrown into { type, message, stack }. */
export function toClientError(err: unknown, type?: string): ClientError {
  if (err instanceof Error) {
    return { type: type ?? err.name, message: err.message.slice(0, 500), stack: err.stack?.slice(0, 4000) };
  }
  return { type: type ?? "NonError", message: String(err).slice(0, 500) };
}

export function createTelemetry(opts: TelemetryOptions): Telemetry {
  const { kv, version } = opts;
  const prefix = opts.prefix ?? "telemetry";
  const EVENTS = `${prefix}:events`;
  const ALIVE = `${prefix}:alive`;
  const now = opts.now ?? Date.now;
  const max = opts.max ?? 400;
  const maxPerFingerprint = opts.maxPerFingerprint ?? 3;
  const maxErrorsPerMinute = opts.maxErrorsPerMinute ?? 20;
  const session = (opts.newSessionId ?? (() => Math.random().toString(36).slice(2, 10)))();
  const seen = new Map<string, number>();
  let errorTimes: number[] = [];
  let startedAt = 0;

  const read = (): ClientEvent[] => {
    try {
      const parsed = z.array(ClientEventSchema).safeParse(JSON.parse(kv.getItem(EVENTS) ?? "[]"));
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  };
  const write = (events: ClientEvent[]) => {
    try {
      kv.setItem(EVENTS, JSON.stringify(events.slice(-max)));
    } catch {
      // Storage full or blocked: drop silently. Telemetry must never break the game.
    }
  };
  const push = (event: ClientEvent) => write([...read(), event]);
  const alive = () => {
    try {
      kv.setItem(ALIVE, JSON.stringify({ session, since: startedAt, last: now() }));
    } catch {
      // ignore
    }
  };
  const allowError = (e: ClientError): boolean => {
    const key = `${e.type}\u0000${e.message}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > maxPerFingerprint) return false;
    const t = now();
    errorTimes = errorTimes.filter((x) => t - x < 60_000);
    if (errorTimes.length >= maxErrorsPerMinute) return false;
    errorTimes.push(t);
    return true;
  };
  const pushError = (e: ClientError, data: EventData) => {
    if (allowError(e)) push({ at: now(), type: "error", version, session, data, error: e });
  };
  const error = (err: unknown, data: EventData = {}, type?: string) => pushError(toClientError(err, type), data);

  return {
    track: (type, data = {}) => push({ at: now(), type, version, session, data }),
    error,
    pending: read,
    async flush(send) {
      const batch = read();
      if (!batch.length) return true;
      let ok = false;
      try {
        ok = await send(batch);
      } catch {
        ok = false;
      }
      if (ok) write(read().slice(batch.length));
      return ok;
    },
    sessionStart() {
      try {
        const prev = AliveSchema.safeParse(JSON.parse(kv.getItem(ALIVE) ?? "null"));
        if (prev.success) {
          pushError(
            { type: "PreviousSessionCrashed", message: "Previous session ended without closing" },
            { previous_session: prev.data.session, last_alive: prev.data.last, ran_for_ms: prev.data.last - prev.data.since },
          );
        }
      } catch {
        // ignore
      }
      startedAt = now();
      alive();
      push({ at: startedAt, type: "session_start", version, session, data: {} });
    },
    heartbeat: alive,
    sessionEnd() {
      try {
        kv.removeItem(ALIVE);
      } catch {
        // ignore
      }
      push({ at: now(), type: "session_end", version, session, data: { duration_ms: now() - startedAt } });
    },
  };
}
