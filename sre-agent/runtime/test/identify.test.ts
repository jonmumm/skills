import { describe, expect, it } from "vitest";
import { identifyError } from "../src/identify.ts";

const none = { message: [], type: [] };

describe("identifyError", () => {
  it("returns plain text lines unchanged", () => {
    expect(identifyError("TypeError: x is undefined", undefined, none)).toBe("TypeError: x is undefined");
    expect(identifyError("{not json", undefined, none)).toBe("{not json");
  });

  it("reads the recommended error.type + error.message shape", () => {
    const line = JSON.stringify({ event: "room.action", room_id: "r-1", error: { type: "TypeError", message: "score of undefined" } });
    expect(identifyError(line, undefined, none)).toBe("TypeError: score of undefined");
  });

  it("reads common drifted shapes without configuration", () => {
    expect(identifyError(JSON.stringify({ err: { name: "RangeError", message: "bad round" } }), undefined, none)).toBe("RangeError: bad round");
    expect(identifyError(JSON.stringify({ exception: { type: "DbError", message: "db down" } }), undefined, none)).toBe("DbError: db down");
    expect(identifyError(JSON.stringify({ errorType: "Timeout", msg: "upstream slow" }), undefined, none)).toBe("Timeout: upstream slow");
    expect(identifyError(JSON.stringify({ level: "error", error: "plain string error" }), undefined, none)).toBe("plain string error");
  });

  it("reads juneaus-number-quest's flat client lines, using the event type as the error type", () => {
    const line = JSON.stringify({ source: "client", app: "jnq", at: 1, type: "unhandled_rejection", build: "b1", session: "s1", message: "fetch failed", stack: "at x" });
    expect(identifyError(line, undefined, none)).toBe("unhandled_rejection: fetch failed");
  });

  it("prefers error.type over the event name", () => {
    const line = JSON.stringify({ event: "room.action", type: "action", error: { type: "InvalidMove", message: "not your turn" } });
    expect(identifyError(line, undefined, none)).toBe("InvalidMove: not your turn");
  });

  it("uses the message alone when no type field exists", () => {
    expect(identifyError(JSON.stringify({ error: { message: "db down" } }), undefined, none)).toBe("db down");
  });

  it("ignores empty and non-string candidates", () => {
    expect(identifyError(JSON.stringify({ error: { message: "" }, message: 42, msg: "real one" }), undefined, none)).toBe("real one");
  });

  it("reads fields the log store already extracted, before the raw line", () => {
    const line = JSON.stringify({ error: { type: "Raw", message: "from line" } });
    expect(identifyError(line, { error: { type: "Extracted", message: "from fields" } }, none)).toBe("Extracted: from fields");
    expect(identifyError("room.action", { error: { type: "RangeError", message: "bad round" } }, none)).toBe("RangeError: bad round");
  });

  it("falls back to the raw line when extracted fields hold no message", () => {
    expect(identifyError(JSON.stringify({ error: { message: "in line" } }), { region: "iad" }, none)).toBe("in line");
  });

  it("checks configured paths first", () => {
    const line = JSON.stringify({ message: "generic", failure: { reason: "quota exceeded", kind: "Billing" } });
    expect(identifyError(line, undefined, { message: ["failure.reason"], type: ["failure.kind"] })).toBe("Billing: quota exceeded");
  });

  it("names the fields when it cannot find a message, so the repo can map them", () => {
    const out = identifyError(JSON.stringify({ outcome: "error", room_id: "r-1", code: 7 }), undefined, none);
    expect(out).toBe("sre-agent could not find the error message in this log line. Fields: code, outcome, room_id. Map them with errorFields in .github/sre-agent.yml.");
  });

  it("groups all unreadable lines with the same fields together, whatever their values", () => {
    const a = identifyError(JSON.stringify({ outcome: "error", room_id: "r-1" }), undefined, none);
    const b = identifyError(JSON.stringify({ room_id: "r-2", outcome: "error" }), undefined, none);
    expect(a).toBe(b);
  });

  it("does not treat a JSON array or scalar as structured", () => {
    expect(identifyError("[1,2]", undefined, none)).toBe("[1,2]");
    expect(identifyError("42", undefined, none)).toBe("42");
  });
});

describe("identifyError (each built-in type path)", () => {
  const cases: Array<[string, object]> = [
    ["error.type", { error: { type: "T", message: "m" } }],
    ["error.name", { error: { name: "T", message: "m" } }],
    ["err.type", { err: { type: "T", message: "m" } }],
    ["err.name", { err: { name: "T", message: "m" } }],
    ["exception.type", { exception: { type: "T", message: "m" } }],
    ["exception.name", { exception: { name: "T", message: "m" } }],
    ["errorType", { errorType: "T", message: "m" }],
    ["event", { event: "T", message: "m" }],
    ["type", { type: "T", message: "m" }],
  ];
  it.each(cases)("reads the type from %s", (_path, line) => {
    expect(identifyError(JSON.stringify(line), undefined, none)).toBe("T: m");
  });

  it("treats a JSON null line as plain text", () => {
    expect(identifyError("null", undefined, none)).toBe("null");
  });
});
