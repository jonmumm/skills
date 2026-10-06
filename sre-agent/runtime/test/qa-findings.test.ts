import { describe, expect, it } from "vitest";
import { toLogEvents } from "../src/qa-findings.ts";

const finding = {
  title: "Score stays at 0 after a correct answer",
  severity: 4,
  expected: "The team score rises by 100",
  actual: "The score shows 0",
  reproduction: ["Create a room on the TV page", "Join from a phone", "Answer the first question correctly"],
  path: "/room/abc123",
  target: "qa",
  charter: "First-time family: host a game and play one round",
  verification: { status: "confirmed", test: "qa/repro/score-after-answer.test.ts" },
};
const batch = { runId: "2026-10-06-a1", foundAt: "2026-10-06T13:00:00.000Z", findings: [finding] };

describe("toLogEvents", () => {
  it("turns a confirmed finding into one error event a sre-agent issue can carry", () => {
    expect(toLogEvents(batch)).toEqual([
      {
        id: "2026-10-06-a1:0",
        timestamp: Date.parse("2026-10-06T13:00:00.000Z"),
        level: "error",
        service: "qa",
        message: [
          "Score stays at 0 after a correct answer (/room/abc123)",
          "Severity: 4 of 5 · target: qa · confirmed by qa/repro/score-after-answer.test.ts",
          "Expected: The team score rises by 100",
          "Actual: The score shows 0",
          "Steps:",
          "1. Create a room on the TV page",
          "2. Join from a phone",
          "3. Answer the first question correctly",
          "Charter: First-time family: host a game and play one round",
        ].join("\n"),
      },
    ]);
  });

  it("groups the same bug across days by its title and route, not by run", () => {
    const [a] = toLogEvents(batch);
    const [b] = toLogEvents({ ...batch, runId: "2026-10-07-b2", findings: [{ ...finding, actual: "Shows 0 again" }] });
    expect(a!.message.split("\n")[0]).toBe(b!.message.split("\n")[0]);
  });

  it("files production risks the run could not prove, and says so", () => {
    const [e] = toLogEvents({ ...batch, findings: [{ ...finding, path: undefined, target: "prod", verification: { status: "unverified", note: "read-only run; could not reproduce safely" } }] });
    expect(e!.message.split("\n").slice(0, 2)).toEqual([
      "Score stays at 0 after a correct answer",
      "Severity: 4 of 5 · target: prod · not reproduced: read-only run; could not reproduce safely",
    ]);
  });

  it("skips rejected findings", () => {
    expect(toLogEvents({ ...batch, findings: [{ ...finding, verification: { status: "rejected", note: "seed data" } }] })).toEqual([]);
  });

  it("rejects malformed batches at the boundary", () => {
    expect(() => toLogEvents({ runId: "r", foundAt: "2026-10-06T13:00:00.000Z", findings: [{ title: "x" }] })).toThrow();
    expect(() => toLogEvents({ ...batch, findings: [{ ...finding, severity: 9 }] })).toThrow();
    expect(() => toLogEvents({ ...batch, findings: Array.from({ length: 51 }, () => finding) })).toThrow();
  });
});

describe("qa-findings CLI", () => {
  it("prints one NDJSON event per filed finding, as a command source reads it", async () => {
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const { execFileSync } = await import("node:child_process");
    const dir = mkdtempSync(join(tmpdir(), "qa-"));
    const rejected = { ...finding, title: "Not a bug", verification: { status: "rejected", note: "seed data" } };
    writeFileSync(join(dir, "f.json"), JSON.stringify({ ...batch, findings: [finding, rejected, { ...finding, title: "Second" }] }));
    const cli = new URL("../src/qa-findings.ts", import.meta.url).pathname;
    const out = execFileSync("node", [cli, join(dir, "f.json")], { encoding: "utf8" });
    const lines = out.trimEnd().split("\n");
    expect(out.endsWith("\n")).toBe(true);
    expect(lines.map((l) => JSON.parse(l).id)).toEqual(["2026-10-06-a1:0", "2026-10-06-a1:2"]);
    expect(() => execFileSync("node", [cli], { encoding: "utf8", stdio: "pipe" })).toThrow(/usage: node src\/qa-findings\.ts <findings\.json>/);
  });
});
