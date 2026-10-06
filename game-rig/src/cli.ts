/**
 * game-rig <command> — run from the game repo (it reads ./game-rig.config.ts unless --config).
 *   check   [--out dir] [--only a,b] [--checks overlay,text,tap,safe-area]   exit 1 on findings
 *   sheet   [--out dir] [--only a,b]          screenshots of every screen × viewport, tiled
 *   record  [--no-open] [--expect-smooth] [--out file]   session video + av-verdict, then `open`
 *   verdict <clip> [av-verdict flags]          av-verdict on any clip
 *   crap    --coverage coverage/coverage-final.json [--threshold 8] [--top 15]
 *   stream-check <receiver.html> [out.png] --game URL --stream-server URL --confirm-paid [--max-seconds 180]
 *   cast    list|launch|bridge|stop [--device NAME] [--minutes 10] [--keep]   (pychromecast venv)
 *   https   (PORT=…, PERSIST_TO=…) wrangler dev over HTTPS with mkcert
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECKS, type CheckName, loadConfig } from "./config.ts";
import { crapReport } from "./crap.ts";
import { AV_VERDICT, recordSession } from "./record-session.ts";
import { runChecks } from "./run-checks.ts";
import { streamCheck } from "./stream-check.ts";

const RIG = fileURLToPath(new URL("..", import.meta.url));
const [command = "help", ...rest] = process.argv.slice(2);
const flag = (name: string) => rest.includes(`--${name}`);
const value = (name: string): string | undefined => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const VALUED = new Set(["--config", "--out", "--only", "--checks", "--coverage", "--threshold", "--top", "--game", "--stream-server", "--max-seconds"]);
const positional = rest.filter((a, i) => !a.startsWith("--") && !VALUED.has(rest[i - 1] ?? ""));
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const isCheck = (c: string): c is CheckName => CHECKS.some((k) => k === c);

async function config() {
  const file = resolve(value("config") ?? "game-rig.config.ts");
  if (!existsSync(file)) throw new Error(`no ${file}: write one (see ${join(RIG, "examples/game-rig.config.ts")})`);
  return loadConfig(file);
}

function passthrough(bin: string, args: string[]): number {
  return spawnSync(bin, args, { stdio: "inherit" }).status ?? 1;
}

async function main(): Promise<number> {
  switch (command) {
    case "check":
    case "sheet": {
      const c = await config();
      const out = value("out") ?? `recordings/game-rig/${command}-${stamp()}`;
      const checks = value("checks")?.split(",").filter(isCheck);
      const report = await runChecks(c, { out, only: value("only")?.split(","), checks, noChecks: command === "sheet", log: (l) => console.log(l) });
      console.log(`\n${report.results.length} screen×viewport shots, ${report.results.reduce((n, r) => n + r.failures.length, 0)} findings → ${out}/report.json${report.sheet ? `, ${report.sheet}` : ""}`);
      return command === "check" && !report.pass ? 1 : 0;
    }
    case "record": {
      const c = await config();
      const open = !flag("no-open") && !process.env.CI;
      const r = await recordSession(c, { open, out: value("out"), expectSmooth: flag("expect-smooth"), log: (l) => console.log(l) });
      console.log(JSON.stringify({ out: r.out, panels: r.panels, pass: r.verdict.pass, failures: r.verdict.failures, warnings: r.verdict.warnings }, null, 2));
      return r.verdict.pass ? 0 : 1;
    }
    case "verdict":
      return passthrough(process.execPath, [AV_VERDICT, ...rest]);
    case "crap":
      return crapReport(value("coverage") ?? "coverage/coverage-final.json", Number(value("threshold") ?? 8), Number(value("top") ?? 15), (l) => console.log(l)) > 0 ? 1 : 0;
    case "stream-check": {
      const [receiver, outPng = "stream-check.png"] = positional;
      const game = value("game");
      const streamServer = value("stream-server");
      if (!receiver || !game || !streamServer) throw new Error("usage: stream-check <receiver.html> [out.png] --game URL --stream-server URL --confirm-paid");
      if (!flag("confirm-paid")) throw new Error("stream-check starts a billed cloud GPU stream (~$1.4/h, idles out ~15 min after): pass --confirm-paid");
      await streamCheck({ game, streamServer, receiver: resolve(receiver), outPng, maxSeconds: Number(value("max-seconds") ?? 180), log: (l) => console.log(l) });
      return 0;
    }
    case "cast": {
      const setup = spawnSync(join(RIG, "scripts/cast/setup-venv.sh"), { encoding: "utf8" });
      if (setup.status !== 0) throw new Error(`cast venv setup failed: ${setup.stderr}`);
      return passthrough(setup.stdout.trim(), [join(RIG, "scripts/cast/cast.py"), ...rest]);
    }
    case "https":
      return passthrough(join(RIG, "scripts/dev-https.sh"), rest);
    default:
      console.log(readUsage());
      return command === "help" ? 0 : 2;
  }
}

function readUsage(): string {
  const src = fileURLToPath(import.meta.url);
  return spawnSync("sed", ["-n", "2,10p", src], { encoding: "utf8" }).stdout.replace(/^ \* ?/gm, "");
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
