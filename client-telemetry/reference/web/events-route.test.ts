import { describe, expect, it } from "vitest";
import { handleEvents, type ClientLine, type Counts } from "./events-route";

function capture() {
  const logs: ClientLine[] = [];
  const errors: ClientLine[] = [];
  const points: Parameters<Counts["writeDataPoint"]>[0][] = [];
  return {
    logs,
    errors,
    points,
    logger: { log: (l: ClientLine) => void logs.push(l), error: (l: ClientLine) => void errors.push(l) },
    counts: { writeDataPoint: (p: Parameters<Counts["writeDataPoint"]>[0]) => void points.push(p) },
  };
}

const post = (body: string) => new Request("https://game.example/events", { method: "POST", body });
const event = (over: Record<string, unknown> = {}) => ({ at: 5, type: "round_started", version: "v9", session: "s1", data: { round: 2 }, ...over });

describe("POST /events", () => {
  it("re-emits a product event as one info wide event", async () => {
    const c = capture();
    const res = await handleEvents(post(JSON.stringify({ events: [event()] })), { service: "quest", logger: c.logger, counts: c.counts });
    expect(res.status).toBe(200);
    expect(c.errors).toEqual([]);
    expect(c.logs).toEqual([
      { event: "client.round_started", service: "quest", version: "v9", source: "client", outcome: "ok", session_id: "s1", client_at: 5, round: 2 },
    ]);
    expect(c.points).toEqual([{ indexes: ["quest"], blobs: ["client.round_started", "ok", "v9", ""], doubles: [1] }]);
  });

  it("emits an error event once, at error level, with error.type and error.message", async () => {
    const c = capture();
    const error = { type: "TypeError", message: "x is undefined", stack: "TypeError: x is undefined\n at a.js:1" };
    await handleEvents(post(JSON.stringify({ events: [event({ type: "error", data: { scene: "map" }, error })] })), { service: "quest", logger: c.logger });
    expect(c.logs).toEqual([]);
    expect(c.errors).toHaveLength(1);
    expect(c.errors[0]).toMatchObject({ event: "client.error", outcome: "error", source: "client", scene: "map", error });
  });

  it("drops name, email, token and typed-text keys even if a client sends them", async () => {
    const c = capture();
    const data = { player_name: "Juneau", profileName: "J", email: "a@b.c", ogs_token: "t", typed_text: "hi", round: 1 };
    await handleEvents(post(JSON.stringify({ events: [event({ data })] })), { service: "quest", logger: c.logger });
    const line = c.logs[0];
    expect(line).toMatchObject({ round: 1 });
    expect(JSON.stringify(line)).not.toMatch(/Juneau|a@b\.c|"t"|"hi"/);
  });

  it("does not let client data overwrite reserved fields", async () => {
    const c = capture();
    await handleEvents(post(JSON.stringify({ events: [event({ data: { service: "evil", outcome: "ok", source: "server" } })] })), { service: "quest", logger: c.logger });
    expect(c.logs[0]).toMatchObject({ service: "quest", source: "client" });
  });

  it("rejects bad JSON, bad shapes and oversized batches without logging", async () => {
    const c = capture();
    const ctx = { service: "quest", logger: c.logger };
    expect((await handleEvents(post("{"), ctx)).status).toBe(400);
    expect((await handleEvents(post(JSON.stringify({ events: [{ nope: 1 }] })), ctx)).status).toBe(400);
    expect((await handleEvents(post(JSON.stringify({ events: Array.from({ length: 501 }, () => event()) })), ctx)).status).toBe(400);
    expect((await handleEvents(post("x".repeat(1_000_001)), ctx)).status).toBe(413);
    expect([...c.logs, ...c.errors]).toEqual([]);
  });
});
