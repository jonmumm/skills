import { describe, expect, test } from "vitest";
import { crapRows } from "../src/crap.ts";

const src = `export function grade(n: number, strict?: boolean) {
  if (n > 90) return "A";
  if (n > 80) return "B";
  if (strict && n > 70) return "C";
  return n > 60 ? "D" : "F";
}
export const tiny = (x: number) => x + 1;
`;
// istanbul statementMap: one statement per return/if line of grade, one for tiny's body.
const loc = (line: number, c0 = 2, c1 = 30) => ({ start: { line, column: c0 }, end: { line, column: c1 } });
const statementMap = { "0": loc(2), "1": loc(3), "2": loc(4), "3": loc(5), "4": loc(7, 36, 41) };

describe("CRAP from a Babel AST + v8 statement coverage", () => {
  test("complexity counts ifs, ternaries and && (ESLint definition)", () => {
    const rows = crapRows("grade.ts", src, { statementMap, s: { "0": 1, "1": 1, "2": 1, "3": 1, "4": 1 } });
    const grade = rows.find((r) => r.name === "grade");
    expect(grade?.cc).toBe(6);
    expect(grade?.cov).toBe(1);
    expect(grade?.crap).toBe(6);
    expect(rows.find((r) => r.name === "tiny")?.cc).toBe(1);
  });
  test("an untested branchy function scores CC² + CC", () => {
    const rows = crapRows("grade.ts", src, { statementMap, s: { "0": 0, "1": 0, "2": 0, "3": 0, "4": 1 } });
    expect(rows.find((r) => r.name === "grade")?.crap).toBe(42);
    expect(rows[0]?.name).toBe("grade"); // worst first
  });
});
