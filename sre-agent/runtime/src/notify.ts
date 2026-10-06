import { z } from "zod";

export type NotifyItem = { number: number; title: string; count: number };
export type NotifyPayload = {
  repo: string;
  runUrl: string;
  created: NotifyItem[];
  reopened: NotifyItem[];
  fixQueued: number[];
  sourceErrors: string[];
};

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const OidcResponse = z.object({ value: z.string().min(1) });

/**
 * Post a run summary to the sre-notify Worker, which emails it. Authenticates with the job's GitHub
 * OIDC token (no secret shared between repos), or with SRE_NOTIFY_KEY when run from Jon's Mac. Returns null on success, or a note for the
 * job summary; a failed email never fails the run.
 */
export async function sendNotification(opts: { url: string; payload: NotifyPayload; env: Record<string, string | undefined>; fetch: Fetch }): Promise<string | null> {
  const requestUrl = opts.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = opts.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  const localKey = opts.env.SRE_NOTIFY_KEY; // on Jon's Mac: the key kept in the Keychain
  if (!localKey && (!requestUrl || !requestToken)) return "Email notification skipped: no GitHub OIDC token. Add `id-token: write` to the triage job's permissions.";
  try {
    let value = localKey;
    if (!value) {
      const tokenRes = await opts.fetch(`${requestUrl}&audience=sre-notify`, { headers: { authorization: `bearer ${requestToken}` } });
      value = OidcResponse.parse(await tokenRes.json()).value;
    }
    const res = await opts.fetch(opts.url, {
      method: "POST",
      headers: { authorization: `Bearer ${value}`, "content-type": "application/json" },
      body: JSON.stringify(opts.payload),
    });
    return res.ok ? null : `Email notification failed: sre-notify answered ${res.status}.`;
  } catch (err) {
    return `Email notification failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}
