import { createHash, createPrivateKey, sign } from "node:crypto";
import { z } from "zod";
import type { LogEvent } from "../schemas.ts";
import { crashSignature, parseCrashLog } from "./crash-log.ts";

const API = "https://api.appstoreconnect.apple.com";
const PAGE = 200;

export type AscAuth = { keyId: string; issuerId: string; privateKey: string };
type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/** App Store Connect API token: ES256, signed with the team key's .p8, valid for the 20 minutes Apple allows. */
export function signAscJwt(auth: AscAuth, now: number): string {
  const iat = Math.floor(now / 1000);
  const unsigned = `${b64({ alg: "ES256", kid: auth.keyId, typ: "JWT" })}.${b64({ iss: auth.issuerId, iat, exp: iat + 1200, aud: "appstoreconnect-v1" })}`;
  const key = createPrivateKey(auth.privateKey.replace(/\\n/g, "\n"));
  return `${unsigned}.${sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}

const AscErrors = z.object({ errors: z.array(z.object({ detail: z.string().optional(), title: z.string().optional() })).default([]) });

const Apps = z.object({ data: z.array(z.object({ id: z.string(), attributes: z.object({ bundleId: z.string() }) })) });

// Every attribute is optional in Apple's schema.
const Submission = z.object({
  id: z.string(),
  attributes: z.object({
    createdDate: z.string(),
    comment: z.string().nullish(),
    deviceModel: z.string().nullish(),
    osVersion: z.string().nullish(),
    locale: z.string().nullish(),
    connectionType: z.string().nullish(),
    batteryPercentage: z.number().nullish(),
    appUptimeInMilliseconds: z.number().nullish(),
    screenshots: z.array(z.object({ url: z.string(), expirationDate: z.string().nullish() })).nullish(),
  }),
  relationships: z.object({ build: z.object({ data: z.object({ id: z.string() }).nullish() }).optional() }).optional(),
});
type Submission = z.infer<typeof Submission>;

const SubmissionPage = z.object({
  data: z.array(Submission),
  included: z.array(z.object({ type: z.string(), id: z.string(), attributes: z.object({ version: z.string().optional() }).optional() })).default([]),
  links: z.object({ next: z.string().optional() }).default({}),
});

const CrashLogResponse = z.object({ data: z.object({ attributes: z.object({ logText: z.string().nullish() }) }) });

export type TestflightQuery = {
  auth: AscAuth;
  bundleId: string;
  service: string;
  /** Reports created before this (epoch ms) are skipped. */
  from: number;
  now: number;
  maxCrashLogs: number;
  fetch?: Fetch;
};

/** TestFlight screenshot feedback and crash reports for one app, as LogEvents. */
export async function fetchTestflightEvents(q: TestflightQuery): Promise<{ events: LogEvent[]; notes: string[] }> {
  const fetch = q.fetch ?? globalThis.fetch;
  const token = signAscJwt(q.auth, q.now);
  const get = async (url: string) => {
    const res = await fetch(url.startsWith("http") ? url : `${API}${url}`, { headers: { authorization: `Bearer ${token}` } });
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = AscErrors.safeParse(body).data?.errors.map((e) => e.detail ?? e.title).join("; ");
      throw new Error(`App Store Connect ${res.status} on ${new URL(res.url || url, API).pathname}: ${detail || res.statusText}`);
    }
    return body;
  };

  const apps = Apps.parse(await get(`/v1/apps?${new URLSearchParams({ "filter[bundleId]": q.bundleId, "fields[apps]": "bundleId" })}`));
  const app = apps.data.find((a) => a.attributes.bundleId === q.bundleId);
  if (!app) throw new Error(`no App Store Connect app with bundle id ${q.bundleId}`);

  const list = async (kind: "betaFeedbackScreenshotSubmissions" | "betaFeedbackCrashSubmissions") => {
    const out: Array<{ s: Submission; build: string | undefined }> = [];
    let url: string | undefined = `/v1/apps/${app.id}/${kind}?${new URLSearchParams({ sort: "-createdDate", limit: String(PAGE), include: "build", "fields[builds]": "version" })}`;
    while (url) {
      const page = SubmissionPage.parse(await get(url));
      const builds = new Map(page.included.map((i) => [i.id, i.attributes?.version])); // only builds are included
      let older = false;
      for (const s of page.data) {
        if (Date.parse(s.attributes.createdDate) < q.from) {
          older = true;
          break;
        }
        out.push({ s, build: builds.get(s.relationships?.build?.data?.id ?? "") });
      }
      url = older ? undefined : page.links.next;
    }
    return out;
  };

  const events: LogEvent[] = [];
  const notes: string[] = [];

  for (const { s, build } of await list("betaFeedbackScreenshotSubmissions")) {
    const a = s.attributes;
    const shots = a.screenshots ?? [];
    const comment = a.comment?.trim() ?? "";
    events.push({
      ...base("screenshot", s, q.service, build),
      fingerprint: `tf-shot-${s.id}`,
      message: sections(
        `TestFlight feedback: ${comment.split("\n")[0] || "(no comment)"}`,
        comment.includes("\n") && comment,
        [device(s, build), ...shots.map((i) => `Screenshot: ${i.url}${i.expirationDate ? ` (expires ${i.expirationDate})` : ""}`)].filter(Boolean).join("\n"),
      ),
      fields: { source: "testflight", kind: "screenshot", submission: s.id, ...context(s, build), screenshots: shots.map((i) => i.url) },
    });
  }

  const crashes = await list("betaFeedbackCrashSubmissions");
  if (crashes.length > q.maxCrashLogs) notes.push(`testflight:${q.bundleId} has ${crashes.length - q.maxCrashLogs} more crash report(s) than maxCrashLogs; the next run reads them.`);
  for (const { s, build } of crashes.slice(0, q.maxCrashLogs)) {
    let logText = "";
    try {
      logText = CrashLogResponse.parse(await get(`/v1/betaFeedbackCrashSubmissions/${s.id}/crashLog`)).data.attributes.logText ?? "";
    } catch (err) {
      notes.push(`testflight: could not read the crash log for ${s.id} (${err instanceof Error ? err.message : String(err)}).`);
    }
    const log = parseCrashLog(logText);
    const sig = crashSignature(log);
    const comment = s.attributes.comment?.trim();
    events.push({
      ...base("crash", s, q.service, build),
      fingerprint: sig.key === "unknown" ? `tf-crash-${s.id}` : `tf-crash-${createHash("sha256").update(`${q.service}\n${sig.key}`).digest("hex").slice(0, 12)}`,
      message: sections(`TestFlight crash: ${sig.headline}`, comment && `Tester comment: ${comment}`, device(s, build), sig.stack),
      fields: { source: "testflight", kind: "crash", submission: s.id, ...context(s, build), symbolicated: log.symbolicated, stack: sig.stack },
    });
  }
  return { events, notes };
}

function base(kind: "screenshot" | "crash", s: Submission, service: string, build: string | undefined) {
  return { id: `testflight-${kind}:${s.id}`, timestamp: Date.parse(s.attributes.createdDate), level: "error", service, ...(build ? { versionId: build } : {}) };
}

/** Device context without the tester's identity (no email, no name). */
function context(s: Submission, build: string | undefined) {
  const a = s.attributes;
  return Object.fromEntries(
    Object.entries({ comment: a.comment, deviceModel: a.deviceModel, osVersion: a.osVersion, build, locale: a.locale, connectionType: a.connectionType, batteryPercentage: a.batteryPercentage, appUptimeInMilliseconds: a.appUptimeInMilliseconds }).filter(([, v]) => v !== undefined && v !== null),
  );
}

/** Message paragraphs, skipping empty ones. */
const sections = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join("\n\n");

/** The "Device:" line, or "" when Apple sent no device details. */
function device(s: Submission, build: string | undefined): string {
  const a = s.attributes;
  const parts = [
    a.deviceModel,
    a.osVersion && `iOS ${a.osVersion}`,
    build && `build ${build}`,
    a.locale,
    a.connectionType,
    a.batteryPercentage != null && `battery ${a.batteryPercentage}%`,
    a.appUptimeInMilliseconds != null && `app open ${Math.round(a.appUptimeInMilliseconds / 1000)}s`,
  ].filter(Boolean);
  return parts.length ? `Device: ${parts.join(" · ")}` : "";
}
