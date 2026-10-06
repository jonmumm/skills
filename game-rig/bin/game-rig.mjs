#!/usr/bin/env node
// Runs src/cli.ts under tsx (so a game's game-rig.config.ts can be imported as is).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const tsx = import.meta.resolve("tsx");
const r = spawnSync(process.execPath, ["--import", tsx, cli, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
