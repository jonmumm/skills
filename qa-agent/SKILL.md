---
name: qa-agent
description: >
  Daily AI exploratory QA for Jon's apps, working with /sre-agent. Each morning on Jon's Mac,
  tester-army/e2e `explore` drives each enrolled app's QA copy (plus a read-only production check)
  on Jon's ChatGPT plan, every finding is verified with a failing test, and confirmed bugs go to the
  repo's qa-agent workflow, which files and dedupes them as sre-agent issues and emails Jon. Use for
  "qa-agent", "daily QA", "explore my app every day", "AI QA", "bug bash on a schedule", "enroll this
  repo in QA", or "/qa-agent run" (the scheduled daily run).
dependsOn:
  - jonmumm/skills@sre-agent
  - jonmumm/skills@client-telemetry
---

# qa-agent

sre-agent watches what real users hit, through the logs. qa-agent goes looking for what nobody has hit yet.
Both file into one issue tracker, with the same dedupe, mute, regression reopen, email and fix job.

```
Mac, 06:00 (scheduled task "qa-agent daily")             GitHub (per repo, workflow_dispatch)
  for each enrolled repo whose main moved:                 qa-agent.yml
    worktree at origin/main ─▶ e2e explore × charters  ─▶   findings ─▶ sre-agent runtime ─▶ issues
    (QA copy: full play; prod: read-only)                                 (label sre-agent, service "qa")
    verify each issue finding with a failing test                       ─▶ email from sre@mumm.dev
    gh workflow run qa-agent -f findings=<batch>                        ─▶ autonomy 2: fix PR
```

Why the explorer runs on the Mac:
- e2e can't use a Claude subscription. Jon chose his ChatGPT plan.
- e2e's docs say to use API keys in CI: a ChatGPT login copied into a GitHub secret stops working
  after its first token refresh. On the Mac, `~/.config/e2e/oauth.json` refreshes itself.
- The Mac can also test the iPad layout in the Simulator.

The GitHub half exists because filing, dedupe and email already live there. The email Worker only
trusts GitHub's OIDC identity.

## Rules

- **Prod is read-only.** On a `prod` target: no rooms, no sign-ins, no submissions, nothing
  injection-shaped in URLs. Explorers create and play only on the QA copy.
- **ChatGPT usage limit.** If any `e2e` run fails with a usage limit, stop the whole run, report
  it, and send nothing. Never switch to an API key. Jon's rule: Codex/ChatGPT limits are shared
  with image generation.
- **No unverified bug becomes a "confirmed" issue.** Confirmed means a repro test failed with
  `ASSERTION_FAILED` for the reported reason. A prod finding that can't be safely reproduced is
  sent as `unverified`, with the reason. Findings explained by the environment, the seed data, the
  design, or explorer blind spots are `rejected` and never sent.
- **Warnings (cosmetic) are not sent.** List them in the run report only.
- Don't touch Jon's working copies: always explore from a fresh worktree of `origin/main`.

## The daily run ("/qa-agent run")

Registry: `~/.config/qa-agent/repos.txt`, one absolute repo path per line. State: `~/.config/qa-agent/state/<repo>.sha`.

For each registered repo, in order:

1. **Skip if unchanged.** Run `git -C <repo> fetch origin main -q`. If `git rev-parse origin/main` equals
   the saved sha, skip the repo. Production is still checked when the repo's charters include a
   `prod` target, but at most once a day.
2. **Worktree.** Run `git -C <repo> worktree add --detach "$TMPDIR/qa-<name>-<date>" origin/main`, then
   `pnpm install --frozen-lockfile` in it.
3. **Explore.** Read `qa/charters.yml` and run each charter with `pnpm exec e2e explore --target <target>
   [--agent <agent>] --output .e2e/qa-<n> "<goal>"`, up to 4 at a time. Read each
   `.e2e/qa-<n>/report.json` → `run.explore.findings`.
4. **Verify** each `kind: "issue"` finding, following `pnpm exec e2e guide bug-bash`:
   - Set aside what the environment, design or seed data explain, and explorer blind spots
     (`rejected`).
   - Write a repro test under `qa/repro/` against the `qa` target. The finding is `confirmed` only
     if the test fails with `ASSERTION_FAILED` for the reported reason.
   - A prod finding that the QA copy doesn't reproduce is `unverified`, with the reason.
   - Use one subagent per area when there are many findings.
5. **Send.** Build the batch below (at most 20 findings, keeping the highest severity), then run
   `gh workflow run qa-agent --repo <owner/name> -f findings="$(cat batch.json)"`. Send nothing when
   no finding survived.
6. **Record.** Write the sha to the state file, then remove the worktree with
   `git worktree remove --force`.
7. **Report** one line per repo: charters run, findings (issue/warning), confirmed, unverified,
   rejected, sent or skipped, plus each run's printed model usage. If a run was blocked or errored
   (exit 2 or 3), say why; that is the app or config, not a bug report.

Batch schema (`sre-agent/runtime/src/qa-findings.ts` parses it; anything else is rejected):

```json
{ "runId": "2026-10-06-trivia-jam", "foundAt": "2026-10-06T13:00:00.000Z",
  "findings": [{
    "title": "…", "severity": 4, "expected": "…", "actual": "…", "reproduction": ["…"],
    "path": "/room/…", "target": "qa", "charter": "<goal>",
    "verification": { "status": "confirmed", "test": "qa/repro/<file>.test.ts" }
  }] }
```

`verification` is one of `{status:"confirmed", test}`, `{status:"unverified", note}` or
`{status:"rejected", note}`. Rejected findings are dropped by the converter, so sending them is harmless.

## Enroll a repo

Do this in the repo's own session. Steps 1–3 change the repo; ask Jon before creating Cloudflare
resources or pushing.

1. **QA copy.**
   - Add a wrangler `[env.qa]` (Worker `<name>-qa`) with its own Durable Object namespaces, KV, R2
     and D1, so nothing touches production data.
   - Add `.github/workflows/qa-deploy.yml`: `wrangler deploy --env qa` on push to `main`, using the
     org's `CLOUDFLARE_API_TOKEN` deploy secret.
   - Tag QA traffic so sre-agent can tell it apart: explorers send an `x-qa-run` header, and the
     Worker's wide events record it as `qa_run`.
2. **e2e.**
   - Install tester-army/e2e (`npx e2e init`, pnpm). Pick the ChatGPT subscription; Jon runs
     `! pnpm exec e2e login openai` once.
   - Two targets in `e2e.config.ts`: `qa` (the QA copy's URL) and `prod`. The `prod` target gets
     agent `context` saying it is read-only.
   - Personas as e2e agents (first-time family, grown-up host, error paths) with short system prompts.
   - Never log or type kids' names. Seeded QA accounts only.
3. **Charters.** Copy `templates/charters.example.yml` to `qa/charters.yml` and write 4–6 charters
   for this app's real flows: TV, phone and iPad.
4. **GitHub side.**
   - Copy `templates/qa-agent.config.yml` to `.github/qa-agent.yml`.
   - Copy `templates/qa-agent.workflow.yml` to `.github/workflows/qa-agent.yml`, replacing
     `__SKILLS_SHA__` with the sre-agent runtime's current pinned SHA.
   - Workflow changes need Jon's yes.
5. **Register.** Run `echo "<abs path>" >> ~/.config/qa-agent/repos.txt`.
6. **Prove it.** Run one charter by hand, then `/qa-agent run` for this repo only. Report the issues
   it filed (or why none), and ask Jon whether the email arrived.

## Scheduling

The daily run is a Claude desktop scheduled task named "qa-agent daily" (06:00 local) whose prompt
is `/qa-agent run`. Jon's Mac must be awake with the app open. A missed morning is caught up by
the next run, which explores whatever `main` is then.
