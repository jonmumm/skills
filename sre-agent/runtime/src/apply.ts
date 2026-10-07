import type { IssueApi } from "./github.ts";
import { nextMarker, parseMarker, renderIssue, replaceMarker } from "./issue-body.ts";
import type { Action, Config, KnownIssue } from "./schemas.ts";

export const LABEL = "sre-agent";
export const FIX_LABEL = "sre-agent:fix-attempted";

export type ApplyResult = { created: number[]; updated: number[]; reopened: number[] };

export async function loadKnownIssues(api: IssueApi): Promise<KnownIssue[]> {
  const issues = await api.listLabeled(LABEL);
  return issues.flatMap((i) => {
    const marker = parseMarker(i.body);
    return marker
      ? [{ number: i.number, state: i.state, stateReason: i.state_reason, labels: i.labels.map((l) => l.name), marker, ...(i.body ? { body: i.body } : {}) }]
      : [];
  });
}

export async function applyActions(api: IssueApi, actions: Action[], intro?: string): Promise<ApplyResult> {
  const result: ApplyResult = { created: [], updated: [], reopened: [] };
  if (actions.some((a) => a.kind === "create")) await api.ensureLabel(LABEL, "d73a4a");

  for (const action of actions) {
    switch (action.kind) {
      case "create": {
        const related = action.related ?? [];
        const { title, body } = renderIssue(action.group, nextMarker(null, action.group, related), intro, related);
        result.created.push(await api.create({ title, body, labels: [LABEL] }));
        break;
      }
      case "update": {
        const { body } = renderIssue(action.group, nextMarker(action.issue.marker, action.group), intro);
        await api.update(action.issue.number, { body });
        result.updated.push(action.issue.number);
        break;
      }
      case "reopen": {
        const { body } = renderIssue(action.group, nextMarker(action.issue.marker, action.group), intro);
        await api.update(action.issue.number, { body, state: "open" });
        await api.comment(
          action.issue.number,
          `Regression: seen ${action.group.count} more time(s) after this was closed, last at ${new Date(action.group.lastSeen).toISOString()}.`,
        );
        result.reopened.push(action.issue.number);
        break;
      }
      case "related": {
        // Another error of an open incident: count it on the incident's issue, quietly.
        if (!action.issue.body) break;
        const m = action.issue.marker;
        const marker = { ...m, total: m.total + action.group.count, lastSeen: Math.max(m.lastSeen, action.group.lastSeen) };
        await api.update(action.issue.number, { body: replaceMarker(action.issue.body, marker) });
        result.updated.push(action.issue.number);
        break;
      }
      case "muted":
      case "overflow":
        break;
    }
  }
  return result;
}

/** Choose which new or regressed issues get a fix attempt, and label them so no run retries them. */
export async function pickFixes(api: IssueApi, result: ApplyResult, cfg: Pick<Config, "autonomy" | "maxFixesPerRun">): Promise<number[]> {
  if (cfg.autonomy < 2 || cfg.maxFixesPerRun === 0) return [];
  const candidates = [...result.created, ...result.reopened];
  if (candidates.length === 0) return [];
  const attempted = new Set((await api.listLabeled(FIX_LABEL)).map((i) => i.number));
  const picked = candidates.filter((n) => !attempted.has(n)).slice(0, cfg.maxFixesPerRun);
  if (picked.length) await api.ensureLabel(FIX_LABEL, "fbca04");
  for (const n of picked) await api.addLabels(n, [FIX_LABEL]);
  return picked;
}
