import { fingerprint, normalizeMessage } from "./fingerprint.ts";
import type { Action, Config, Group, KnownIssue, LogEvent } from "./schemas.ts";

type TriageConfig = Pick<Config, "levels" | "outcomes" | "ignore" | "minCount" | "maxNewIssuesPerRun"> &
  Partial<Pick<Config, "incidentWindowMinutes">>;

const MUTED_REASONS = new Set(["not_planned", "duplicate"]);

export function isError(event: LogEvent, cfg: Pick<Config, "levels" | "outcomes">): boolean {
  return cfg.levels.includes(event.level) || (event.outcome !== undefined && cfg.outcomes.includes(event.outcome));
}

/** Pure decision step: events + what GitHub already knows → what to do. */
export function triage(events: LogEvent[], known: KnownIssue[], cfg: TriageConfig): { actions: Action[] } {
  const ignore = cfg.ignore.map((s) => new RegExp(s));
  const byFp = new Map(known.map((k) => [k.marker.fp, k]));
  // Related errors of an open incident update that incident's issue.
  for (const k of known) if (k.state === "open") for (const fp of k.marker.related ?? []) if (!byFp.has(fp)) byFp.set(fp, k);
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
        ...(event.fields ? { sampleFields: event.fields } : {}),
        versions: new Set(event.versionId ? [event.versionId] : []),
      });
      continue;
    }
    g.count++;
    g.firstSeen = Math.min(g.firstSeen, event.timestamp);
    if (event.timestamp >= g.lastSeen) {
      g.lastSeen = event.timestamp;
      g.sample = event.message;
      if (event.fields) g.sampleFields = event.fields;
    }
    if (event.versionId) g.versions.add(event.versionId);
  }

  const ranked = [...groups.values()]
    .filter((g) => g.count >= cfg.minCount)
    .sort((a, b) => b.count - a.count)
    .map(({ versions, ...g }): Group => ({ ...g, versionIds: [...versions] }));

  const incidents = groupIncidents(
    ranked.filter((g) => !byFp.has(g.fingerprint)),
    (cfg.incidentWindowMinutes ?? 0) * 60_000,
  );

  let created = 0;
  const actions = ranked.flatMap((group): Action[] => {
    const issue = byFp.get(group.fingerprint);
    if (!issue) {
      const related = incidents.get(group.fingerprint);
      if (related === undefined) return []; // folded into an earlier error's incident
      if (created++ >= cfg.maxNewIssuesPerRun) return [{ kind: "overflow", group }];
      return [related.length ? { kind: "create", group, related } : { kind: "create", group }];
    }
    if (issue.marker.fp !== group.fingerprint) return [{ kind: "related", issue, group }];
    if (issue.state === "open") return [{ kind: "update", issue, group }];
    if (issue.stateReason !== null && MUTED_REASONS.has(issue.stateReason)) return [{ kind: "muted", issue, group }];
    return [{ kind: "reopen", issue, group }];
  });
  return { actions };
}

/**
 * New errors that start within `windowMs` of an incident's first error belong to it. Returns the
 * origin (earliest) of each incident → the others; errors folded into an incident are absent.
 */
function groupIncidents(fresh: Group[], windowMs: number): Map<string, Group[]> {
  const out = new Map<string, Group[]>();
  if (windowMs <= 0) {
    for (const g of fresh) out.set(g.fingerprint, []);
    return out;
  }
  let origin: Group | null = null;
  for (const g of [...fresh].sort((a, b) => a.firstSeen - b.firstSeen)) {
    if (origin && g.firstSeen - origin.firstSeen <= windowMs) {
      out.get(origin.fingerprint)?.push(g);
      continue;
    }
    origin = g;
    out.set(g.fingerprint, []);
  }
  return out;
}
