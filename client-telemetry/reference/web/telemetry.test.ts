import { describe, expect, it } from "vitest";
import { createTelemetry, toClientError } from "./telemetry";

function memoryKv() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
}

describe("client telemetry", () => {
  it("buffers events on the device, keeping the newest when full", () => {
    const t = createTelemetry({ kv: memoryKv(), version: "v1", now: () => 1000, max: 3 });
    for (let i = 0; i < 5; i++) t.track("round_started", { round: i });
    const events = t.pending();
    expect(events.map((e) => e.data.round)).toEqual([2, 3, 4]);
    expect(events[0]).toMatchObject({ type: "round_started", version: "v1", at: 1000 });
  });

  it("flushes and drops only what was sent", async () => {
    const t = createTelemetry({ kv: memoryKv(), version: "v1", now: () => 1 });
    t.track("a");
    t.track("b");
    const sent: string[] = [];
    const ok = await t.flush(async (events) => {
      t.track("c"); // recorded while the request is in flight
      sent.push(...events.map((e) => e.type));
      return true;
    });
    expect(ok).toBe(true);
    expect(sent).toEqual(["a", "b"]);
    expect(t.pending().map((e) => e.type)).toEqual(["c"]);
  });

  it("keeps everything when the send fails or throws (offline)", async () => {
    const t = createTelemetry({ kv: memoryKv(), version: "v1", now: () => 1 });
    t.track("a");
    expect(await t.flush(async () => false)).toBe(false);
    expect(await t.flush(async () => Promise.reject(new Error("offline")))).toBe(false);
    expect(t.pending()).toHaveLength(1);
  });

  it("records errors as { type, message, stack }", () => {
    const t = createTelemetry({ kv: memoryKv(), version: "v1", now: () => 1 });
    t.error(new TypeError("x is undefined"), { scene: "map" });
    t.error("plain string rejection");
    const [first, second] = t.pending();
    expect(first).toMatchObject({ type: "error", data: { scene: "map" }, error: { type: "TypeError", message: "x is undefined" } });
    expect(first?.error?.stack).toContain("TypeError");
    expect(second?.error).toEqual({ type: "NonError", message: "plain string rejection" });
  });

  it("lets the caller name the error type (WebGLContextLost)", () => {
    expect(toClientError(new Error("context lost"), "WebGLContextLost")).toMatchObject({ type: "WebGLContextLost", message: "context lost" });
  });

  it("dedupes the same error on the device", () => {
    const t = createTelemetry({ kv: memoryKv(), version: "v1", now: () => 1, maxPerFingerprint: 2 });
    for (let i = 0; i < 10; i++) t.error(new Error("boom"));
    t.error(new Error("other"));
    expect(t.pending().map((e) => e.error?.message)).toEqual(["boom", "boom", "other"]);
  });

  it("rate limits errors per minute across fingerprints", () => {
    let clock = 0;
    const t = createTelemetry({ kv: memoryKv(), version: "v1", now: () => clock, maxErrorsPerMinute: 2 });
    t.error(new Error("a"));
    t.error(new Error("b"));
    t.error(new Error("c"));
    clock = 61_000;
    t.error(new Error("d"));
    expect(t.pending().map((e) => e.error?.message)).toEqual(["a", "b", "d"]);
  });

  it("reports a previous session that never closed as PreviousSessionCrashed", () => {
    const kv = memoryKv();
    let clock = 0;
    const first = createTelemetry({ kv, version: "v1", now: () => clock, newSessionId: () => "s1" });
    first.sessionStart();
    clock = 60_000;
    first.heartbeat();
    // No sessionEnd: the page died.
    clock = 120_000;
    const second = createTelemetry({ kv, version: "v1", now: () => clock, newSessionId: () => "s2" });
    second.sessionStart();
    const crashes = () => second.pending().filter((e) => e.error?.type === "PreviousSessionCrashed");
    expect(crashes()).toHaveLength(1);
    expect(crashes()[0]).toMatchObject({ session: "s2", data: { previous_session: "s1", last_alive: 60_000, ran_for_ms: 60_000 } });
    // A clean close leaves no report next time.
    second.sessionEnd();
    const third = createTelemetry({ kv, version: "v1", now: () => clock });
    third.sessionStart();
    expect(third.pending().filter((e) => e.error?.type === "PreviousSessionCrashed")).toHaveLength(1);
  });

  it("records session start and end", () => {
    let clock = 10;
    const t = createTelemetry({ kv: memoryKv(), version: "v1", now: () => clock });
    t.sessionStart();
    clock = 70;
    t.sessionEnd();
    expect(t.pending().map((e) => [e.type, e.data])).toEqual([
      ["session_start", {}],
      ["session_end", { duration_ms: 60 }],
    ]);
  });

  it("never throws when storage is broken", () => {
    const broken = {
      getItem: (): string | null => {
        throw new Error("no");
      },
      setItem: () => {
        throw new Error("no");
      },
      removeItem: () => {
        throw new Error("no");
      },
    };
    const t = createTelemetry({ kv: broken, version: "v1", now: () => 1 });
    expect(() => {
      t.track("a");
      t.error(new Error("x"));
      t.sessionStart();
      t.heartbeat();
      t.sessionEnd();
    }).not.toThrow();
    expect(t.pending()).toEqual([]);
  });
});
