import { z } from "zod";

/** One log line from any source, normalized at the source boundary. */
export const LogEvent = z.object({
  id: z.string(),
  timestamp: z.number(), // epoch ms
  level: z.string(),
  message: z.string(),
  service: z.string(),
  outcome: z.string().optional(),
  versionId: z.string().optional(),
});
export type LogEvent = z.infer<typeof LogEvent>;

const Regex = z.string().refine(
  (s) => {
    try {
      new RegExp(s);
      return true;
    } catch {
      return false;
    }
  },
  { message: "not a valid regular expression" },
);

const CloudflareSource = z.object({
  type: z.literal("cloudflare"),
  service: z.string().min(1),
  accountIdEnv: z.string().default("CLOUDFLARE_ACCOUNT_ID"),
  tokenEnv: z.string().default("CLOUDFLARE_API_TOKEN"),
});

const CommandSource = z.object({
  type: z.literal("command"),
  /** Shell command that prints NDJSON LogEvents. Gets SRE_FROM / SRE_TO (epoch ms) in env. */
  run: z.string().min(1),
});

export const Source = z.discriminatedUnion("type", [CloudflareSource, CommandSource]);
export type Source = z.infer<typeof Source>;

export const Config = z.object({
  /** 0 observe (job summary only) · 1 file/update issues · 2 also attempt a fix PR */
  autonomy: z.number().int().min(0).max(2).default(0),
  lookbackMinutes: z.number().int().positive().default(20),
  minCount: z.number().int().positive().default(1),
  maxNewIssuesPerRun: z.number().int().positive().default(3),
  maxFixesPerRun: z.number().int().min(0).default(1),
  levels: z.array(z.string()).default(["error"]),
  outcomes: z.array(z.string()).default(["exception", "exceededCpu", "exceededMemory", "scriptNotFound"]),
  /** Regexes tested against the normalized message. Prefer closing an issue as "not planned" to mute it. */
  ignore: z.array(Regex).default([]),
  /** Extra dotted paths to an error's message and type in structured log lines, checked before the built-in ones. */
  errorFields: z
    .object({ message: z.array(z.string().min(1)).default([]), type: z.array(z.string().min(1)).default([]) })
    .default({ message: [], type: [] }),
  sources: z.array(Source).min(1),
});
export type Config = z.infer<typeof Config>;

/** State kept in a hidden comment in each issue body, so issues are the only store. */
export const Marker = z.object({
  fp: z.string(),
  service: z.string(),
  total: z.number().int().nonnegative(),
  firstSeen: z.number(),
  lastSeen: z.number(),
});
export type Marker = z.infer<typeof Marker>;

export type KnownIssue = {
  number: number;
  state: "open" | "closed";
  stateReason: string | null;
  labels: string[];
  marker: Marker;
};

export type Group = {
  fingerprint: string;
  service: string;
  normalized: string;
  sample: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  versionIds: string[];
};

export type Action =
  | { kind: "create"; group: Group }
  | { kind: "update"; issue: KnownIssue; group: Group }
  | { kind: "reopen"; issue: KnownIssue; group: Group }
  | { kind: "muted"; issue: KnownIssue; group: Group }
  | { kind: "overflow"; group: Group };
