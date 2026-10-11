// Register (once per app) the App Store Connect webhook that points TestFlight feedback at sre-asc-webhook.
//
//   ASC_KEY_ID=… ASC_ISSUER_ID=… ASC_KEY_P8="$(cat AuthKey_….p8)" ASC_WEBHOOK_SECRET=… \
//     node scripts/register.ts --bundle-id com.escuchame --repo jonmumm/escuchame-monorepo \
//       --worker https://sre-asc-webhook.<subdomain>.workers.dev [--dry]
//
// Skips an app that already has a webhook with the same URL, then sends a test ping.
import { parseArgs } from "node:util";
import { z } from "zod";
import { signAscJwt } from "../../runtime/src/sources/testflight.ts";

const { values } = parseArgs({ options: { "bundle-id": { type: "string" }, repo: { type: "string" }, worker: { type: "string" }, dry: { type: "boolean", default: false } } });
const bundleId = values["bundle-id"];
const { repo, worker, dry } = values;
const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8, ASC_WEBHOOK_SECRET } = process.env;
if (!bundleId || !repo || !worker) throw new Error("--bundle-id, --repo and --worker are required");
if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_P8 || !ASC_WEBHOOK_SECRET) throw new Error("ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8 and ASC_WEBHOOK_SECRET are required");

const token = signAscJwt({ keyId: ASC_KEY_ID, issuerId: ASC_ISSUER_ID, privateKey: ASC_KEY_P8 }, Date.now());
const Apps = z.object({ data: z.array(z.object({ id: z.string(), attributes: z.object({ bundleId: z.string() }) })) });
const Webhooks = z.object({ data: z.array(z.object({ id: z.string(), attributes: z.object({ url: z.string() }) })) });
const Created = z.object({ data: z.object({ id: z.string() }) });

async function asc(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`App Store Connect ${res.status} on ${path}: ${JSON.stringify(body)}`);
  return body;
}

const url = `${worker.replace(/\/$/, "")}/asc/${repo}`;
const apps = Apps.parse(await asc(`/v1/apps?${new URLSearchParams({ "filter[bundleId]": bundleId, "fields[apps]": "bundleId" })}`));
const app = apps.data.find((a) => a.attributes.bundleId === bundleId);
if (!app) throw new Error(`no app with bundle id ${bundleId}`);
const existing = Webhooks.parse(await asc(`/v1/apps/${app.id}/webhooks`));
const same = existing.data.find((w) => w.attributes.url === url);
if (same) {
  console.log(`[asc-webhook] ${bundleId} already sends to ${url} (webhook ${same.id})`);
  process.exit(0);
}
const create = {
  data: {
    type: "webhooks",
    attributes: { enabled: true, name: `sre-agent ${repo}`.slice(0, 64), url, secret: ASC_WEBHOOK_SECRET, eventTypes: ["BETA_FEEDBACK_SCREENSHOT_SUBMISSION_CREATED", "BETA_FEEDBACK_CRASH_SUBMISSION_CREATED"] },
    relationships: { app: { data: { type: "apps", id: app.id } } },
  },
};
if (dry) {
  console.log(`[asc-webhook] dry run: would create a webhook on app ${app.id} (${bundleId}) → ${url} for ${create.data.attributes.eventTypes.join(", ")}`);
  process.exit(0);
}
const created = Created.parse(await asc("/v1/webhooks", { method: "POST", body: JSON.stringify(create) }));
await asc("/v1/webhookPings", { method: "POST", body: JSON.stringify({ data: { type: "webhookPings", relationships: { webhook: { data: { type: "webhooks", id: created.data.id } } } } }) });
console.log(`[asc-webhook] created webhook ${created.data.id} for ${bundleId} → ${url} and sent a ping`);
