import { fingerprint, normalizeMessage } from "./fingerprint.ts";
import type { Action, Config, Group, KnownIssue, LogEvent } from "./schemas.ts";

type TriageConfig = Pick<Config, "levels" | "outcomes" | "ignore" | "minCount" | "maxNewIssuesPerRun">;

const MUTED_REASONS = new Set(["not_planned", "duplicate"]);

export function isError(event: LogEvent, cfg: Pick<Config, "levels" | "outcomes">): boolean {
  return cfg.levels.includes(event.level) || (event.outcome !== undefined && cfg.outcomes.includes(event.outcome));
}

/** Pure decision step: events + what GitHub already knows → what to do. */
export function triage(events: LogEvent[], known: KnownIssue[], cfg: TriageConfig): { actions: Action[] } {
  const ignore = cfg.ignore.map((s) => new RegExp(s));
  const byFp = new Map(known.map((k) => [k.marker.fp, k]));
  const groups = new Map<string, Group & { versions: Set<string> }>();

  for (const event of events) {
    if (!isError(event, cfg)) continue;
    const normalized = normalizeMessage(event.message);
    if (ignore.some((re) => re.test(normalized))) continue;
    const fp = fingerprint(event.service, event.message);
    const issue = byFp.get(fp);
    if (issue && event.timestamp <= issue.marker.lastSeen) continue; // already counted by an earlier run

    const g = groups.get(fp);
    if (!g) {
      groups.set(fp, {
        fingerprint: fp,
        service: event.service,
        normalized,
        sample: event.message,
        count: 1,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        versionIds: [],
        versions: new Set(event.versionId ? [event.versionId] : []),
      });
      continue;
    }
    g.count++;
    g.firstSeen = Math.min(g.firstSeen, event.timestamp);
    if (event.timestamp >= g.lastSeen) {
      g.lastSeen = event.timestamp;
      g.sample = event.message;
    }
    if (event.versionId) g.versions.add(event.versionId);
  }

  const ranked = [...groups.values()]
    .filter((g) => g.count >= cfg.minCount)
    .sort((a, b) => b.count - a.count)
    .map(({ versions, ...g }): Group => ({ ...g, versionIds: [...versions] }));

  let created = 0;
  const actions = ranked.map((group): Action => {
    const issue = byFp.get(group.fingerprint);
    if (!issue) return created++ < cfg.maxNewIssuesPerRun ? { kind: "create", group } : { kind: "overflow", group };
    if (issue.state === "open") return { kind: "update", issue, group };
    if (issue.stateReason !== null && MUTED_REASONS.has(issue.stateReason)) return { kind: "muted", issue, group };
    return { kind: "reopen", issue, group };
  });
  return { actions };
}
