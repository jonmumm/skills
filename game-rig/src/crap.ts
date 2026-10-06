/**
 * `game-rig crap --coverage coverage/coverage-final.json [--threshold 8] [--top 15]`
 * CRAP = CC² × (1 − cov)³ + CC, per function.
 *   CC: ESLint's `complexity` from a real AST (Babel; TypeScript 7 has no JS API):
 *       1 + if, ?:, case (not default), for/for-in/for-of/while/do, catch, &&, ||, ??, ?., default params.
 *       Nested functions are measured on their own and don't add to their parent.
 *   cov: statement coverage inside the function's own body (vitest v8 → coverage-final.json).
 * From bake-shop/scripts/crap.mjs (the best of the copies).
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { parse } from "@babel/parser";
import traverseModule, { type NodePath } from "@babel/traverse";
import type { Function as FnNode, SourceLocation } from "@babel/types";
import { z } from "zod";

const traverse = traverseModule;

const Pos = z.object({ line: z.number(), column: z.number().nullable() });
const Loc = z.object({ start: Pos, end: Pos });
export const FileCoverage = z.object({ statementMap: z.record(z.string(), Loc), s: z.record(z.string(), z.number()) });
export type FileCoverage = z.infer<typeof FileCoverage>;
export const Coverage = z.record(z.string(), FileCoverage);
export type CrapRow = { file: string; name: string; line: number; cc: number; cov: number; crap: number };
type Span = z.infer<typeof Loc>;

const DECISIONS = new Set(["IfStatement", "ConditionalExpression", "ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement", "CatchClause", "OptionalMemberExpression", "OptionalCallExpression", "AssignmentPattern", "LogicalExpression"]);

const keyName = (k: unknown): string | null => {
  const K = z.object({ type: z.literal("Identifier"), name: z.string() });
  const r = K.safeParse(k);
  return r.success ? r.data.name : null;
};

function functionName(path: NodePath<FnNode>): string {
  const n = path.node;
  if ("id" in n && n.id?.name) return n.id.name;
  if ("key" in n && keyName(n.key)) return keyName(n.key) ?? "";
  const parent = path.parentPath;
  if (parent?.isVariableDeclarator() && parent.node.id.type === "Identifier") return parent.node.id.name;
  if (parent?.isObjectProperty() || parent?.isClassProperty()) return keyName(parent.node.key) ?? "(anonymous)";
  if (parent?.isCallExpression()) {
    const callee = parent.node.callee;
    const name = callee.type === "Identifier" ? callee.name : callee.type === "MemberExpression" ? (keyName(callee.property) ?? "call") : "call";
    const holder = parent.parentPath;
    if (holder?.isObjectProperty()) return `${keyName(holder.node.key) ?? "?"}→${name}`;
    return `${name}(…)`;
  }
  return "(anonymous)";
}

const before = (a: z.infer<typeof Pos>, b: z.infer<typeof Pos>) => a.line < b.line || (a.line === b.line && (a.column ?? 0) <= (b.column ?? 0));
const within = (l: Span, r: Span) => before(r.start, l.start) && before(l.end, r.end);
const toSpan = (l: SourceLocation): Span => ({ start: { line: l.start.line, column: l.start.column }, end: { line: l.end.line, column: l.end.column } });

export function crapRows(file: string, source: string, coverage: FileCoverage): CrapRow[] {
  const ast = parse(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const stmts = Object.entries(coverage.statementMap).map(([id, loc]) => ({ loc, hit: (coverage.s[id] ?? 0) > 0 }));
  const rows: CrapRow[] = [];
  traverse(ast, {
    Function(path) {
      let cc = 1;
      const nested: Span[] = [];
      path.traverse({
        enter(inner) {
          if (inner.isFunction()) {
            if (inner.node.loc) nested.push(toSpan(inner.node.loc));
            inner.skip();
            return;
          }
          const t = inner.node.type;
          if (DECISIONS.has(t)) cc++;
          else if (inner.isSwitchCase() && inner.node.test) cc++;
        },
      });
      const loc = path.node.loc;
      if (!loc) return;
      const self = toSpan(loc);
      const own = stmts.filter((s) => within(s.loc, self) && !nested.some((n) => within(s.loc, n)));
      const cov = own.length ? own.filter((s) => s.hit).length / own.length : 1;
      rows.push({ file, name: functionName(path), line: loc.start.line, cc, cov, crap: cc * cc * (1 - cov) ** 3 + cc });
    },
  });
  return rows.sort((a, b) => b.crap - a.crap);
}

export function crapReport(coverageFile: string, threshold: number, top: number, log: (s: string) => void): number {
  const coverage = Coverage.parse(JSON.parse(readFileSync(coverageFile, "utf8")));
  const rows = Object.entries(coverage)
    .flatMap(([file, data]) => crapRows(relative(process.cwd(), file), readFileSync(file, "utf8"), data))
    .sort((a, b) => b.crap - a.crap);
  const over = rows.filter((r) => r.crap > threshold);
  const show = over.length ? over : rows.slice(0, top);
  for (const r of show) log(`${r.crap > threshold ? "FAIL" : "    "} ${r.file}:${r.line}  ${r.name.padEnd(30)} CC=${String(r.cc).padStart(2)}  cov=${(r.cov * 100).toFixed(0).padStart(3)}%  CRAP=${r.crap.toFixed(1)}`);
  log(`\n${rows.length} functions; ${over.length} over CRAP ${threshold}.${rows[0] ? ` Worst: ${rows[0].name} ${rows[0].crap.toFixed(1)}` : ""}`);
  return over.length;
}
