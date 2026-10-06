import { appendFileSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { applyActions, type ApplyResult, loadKnownIssues, pickFixes } from "./apply.ts";
import { parseConfig } from "./config.ts";
import { restIssueApi } from "./github.ts";
import { nextMarker, renderIssue } from "./issue-body.ts";
import { type NotifyItem, sendNotification } from "./notify.ts";
import type { Action, Config, KnownIssue, LogEvent } from "./schemas.ts";
import { fetchCloudflareEvents } from "./sources/cloudflare.ts";
import { runCommandSource } from "./sources/command.ts";
import { triage } from "./triage.ts";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type RunInput = {
  configPath: string;
  dry: boolean;
  env: Record<string, string | undefined>;
  now: number;
  fetch?: Fetch;
};

export type RunOutput = { summary: string; fixIssues: number[]; exitCode: number };

export async function run({ configPath, dry, env, now, fetch = globalThis.fetch }: RunInput): Promise<RunOutput> {
  const cfg = parseConfig(readFileSync(configPath, "utf8"));
  const window = { from: now - cfg.lookbackMinutes * 60_000, to: now };
  const writes = !dry && cfg.autonomy >= 1;

  const { events, notes, sourceErrors } = await collect(cfg, window, env, fetch);

  const repo = env.GITHUB_REPOSITORY;
  const token = env.GITHUB_TOKEN;
  if (writes && (!repo || !token)) throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required at autonomy >= 1");
  const api = repo && token ? restIssueApi({ token, repo, fetch }) : null;
  const known: KnownIssue[] = api ? await loadKnownIssues(api) : [];

  const { actions } = triage(events, known, cfg);
  let applied: ApplyResult = { created: [], updated: [], reopened: [] };
  let fixIssues: number[] = [];
  if (writes && api) {
    applied = await applyActions(api, actions);
    fixIssues = await pickFixes(api, applied, cfg);
  }

  if (writes && cfg.notify && repo && (applied.created.length || applied.reopened.length || fixIssues.length || sourceErrors.length)) {
    const item = (group: Action["group"], number: number): NotifyItem => ({ number, title: renderIssue(group, nextMarker(null, group)).title, count: group.count });
    const created = actions.filter((a) => a.kind === "create").flatMap((a, i) => (applied.created[i] === undefined ? [] : [item(a.group, applied.created[i])]));
    const reopened = actions.flatMap((a) => (a.kind === "reopen" ? [item(a.group, a.issue.number)] : []));
    const runUrl = `${env.GITHUB_SERVER_URL ?? "https://github.com"}/${repo}/actions/runs/${env.GITHUB_RUN_ID ?? ""}`;
    const note = await sendNotification({ url: cfg.notify.url, payload: { repo, runUrl, created, reopened, fixQueued: fixIssues, sourceErrors }, env, fetch });
    if (note) notes.push(note);
  }

  const summary = renderSummary({ cfg, dry, window, events, actions, applied, fixIssues, notes, sourceErrors });
  return { summary, fixIssues, exitCode: sourceErrors.length ? 1 : 0 };
}

async function collect(cfg: Config, window: { from: number; to: number }, env: Record<string, string | undefined>, fetch: Fetch) {
  const events: LogEvent[] = [];
  const notes: string[] = [];
  const sourceErrors: string[] = [];
  for (const source of cfg.sources) {
    try {
      if (source.type === "cloudflare") {
        const accountId = env[source.accountIdEnv];
        const token = env[source.tokenEnv];
        if (!accountId || !token) throw new Error(`missing ${!accountId ? source.accountIdEnv : source.tokenEnv}`);
        const out = await fetchCloudflareEvents({ accountId, token, service: source.service, levels: cfg.levels, outcomes: cfg.outcomes, errorFields: cfg.errorFields, ...window, fetch });
        events.push(...out.events);
        if (out.truncated) notes.push(`cloudflare:${source.service} hit the 2000-event query limit; counts are a floor. Lower lookbackMinutes.`);
      } else {
        const out = await runCommandSource(source.run, window, cfg.errorFields);
        events.push(...out.events);
        if (out.invalidLines) notes.push(`command source skipped ${out.invalidLines} line(s) that were not LogEvent JSON.`);
      }
    } catch (err) {
      const name = source.type === "cloudflare" ? `cloudflare:${source.service}` : "command";
      sourceErrors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { events, notes, sourceErrors };
}

function renderSummary(s: {
  cfg: Config;
  dry: boolean;
  window: { from: number; to: number };
  events: LogEvent[];
  actions: Action[];
  applied: ApplyResult;
  fixIssues: number[];
  notes: string[];
  sourceErrors: string[];
}): string {
  const mode = s.dry ? "dry run" : ["observe", "issues", "issues + fix PRs"][s.cfg.autonomy];
  const lines = [
    `## sre-agent`,
    ``,
    `Mode: **${mode}** (autonomy ${s.cfg.autonomy}) · window ${new Date(s.window.from).toISOString()} → ${new Date(s.window.to).toISOString()} · ${s.events.length} candidate event(s)`,
    ``,
  ];
  for (const e of s.sourceErrors) lines.push(`> [!CAUTION]\n> Source failed: ${e}`, ``);
  for (const n of s.notes) lines.push(`> [!NOTE]\n> ${n}`, ``);
  if (s.actions.length === 0) {
    lines.push(`No new errors.`);
  } else {
    lines.push(`| Action | Count | Service | Error | Issue |`, `|---|---|---|---|---|`);
    for (const a of s.actions) {
      const issue = "issue" in a ? `#${a.issue.number}` : "";
      lines.push(`| ${a.kind} | ${a.group.count} | ${a.group.service} | \`${a.group.normalized.replace(/[`|]/g, "'").slice(0, 120)}\` | ${issue} |`);
    }
  }
  const { created, updated, reopened } = s.applied;
  if (created.length + updated.length + reopened.length) {
    lines.push(``, `Created ${created.map((n) => `#${n}`).join(", ") || "none"} · reopened ${reopened.map((n) => `#${n}`).join(", ") || "none"} · updated ${updated.length}`);
  }
  if (s.fixIssues.length) lines.push(``, `Fix attempts queued: ${s.fixIssues.map((n) => `#${n}`).join(", ")}`);
  return lines.join("\n");
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { config: { type: "string", default: ".github/sre-agent.yml" }, dry: { type: "boolean", default: false } } });
  const out = await run({ configPath: values.config, dry: values.dry, env: process.env, now: Date.now() });
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out.summary}\n`);
  else console.log(out.summary);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `fix_issues=${JSON.stringify(out.fixIssues)}\n`);
  process.exitCode = out.exitCode;
}
