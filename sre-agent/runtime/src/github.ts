import { z } from "zod";

export const RawIssue = z.object({
  number: z.number().int(),
  title: z.string(),
  state: z.enum(["open", "closed"]),
  state_reason: z.string().nullable().optional().transform((v) => v ?? null),
  body: z.string().nullable(),
  labels: z.array(z.object({ name: z.string() })),
  pull_request: z.unknown().optional(),
});
export type RawIssue = z.output<typeof RawIssue>;

export interface IssueApi {
  listLabeled(label: string): Promise<RawIssue[]>;
  create(input: { title: string; body: string; labels: string[] }): Promise<number>;
  update(number: number, patch: { body?: string; state?: "open" | "closed" }): Promise<void>;
  comment(number: number, body: string): Promise<void>;
  addLabels(number: number, labels: string[]): Promise<void>;
  ensureLabel(name: string, color: string): Promise<void>;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export function restIssueApi({ token, repo, fetch = globalThis.fetch }: { token: string; repo: string; fetch?: Fetch }): IssueApi {
  const base = `https://api.github.com/repos/${repo}`;

  async function call(path: string, init: { method?: string; body?: unknown } = {}, okStatuses: number[] = []): Promise<unknown> {
    const res = await fetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (!res.ok && !okStatuses.includes(res.status)) {
      throw new Error(`GitHub ${res.status} on ${init.method ?? "GET"} ${path}: ${(await res.text()).slice(0, 300)}`);
    }
    return res.json();
  }

  return {
    async listLabeled(label) {
      const out: RawIssue[] = [];
      for (let page = 1; ; page++) {
        const raw = await call(`/issues?labels=${encodeURIComponent(label)}&state=all&per_page=100&page=${page}`);
        const batch = z.array(RawIssue).parse(raw);
        out.push(...batch.filter((i) => i.pull_request === undefined));
        if (batch.length < 100) return out;
      }
    },
    async create(input) {
      return z.object({ number: z.number().int() }).parse(await call("/issues", { method: "POST", body: input })).number;
    },
    async update(number, patch) {
      await call(`/issues/${number}`, { method: "PATCH", body: patch });
    },
    async comment(number, body) {
      await call(`/issues/${number}/comments`, { method: "POST", body: { body } });
    },
    async addLabels(number, labels) {
      await call(`/issues/${number}/labels`, { method: "POST", body: { labels } });
    },
    async ensureLabel(name, color) {
      await call("/labels", { method: "POST", body: { name, color } }, [422]); // 422: already exists
    },
  };
}
