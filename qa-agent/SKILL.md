---
name: qa-agent
description: >
  Daily AI exploratory QA for Jon's apps, run entirely on Jon's Mac and working with /sre-agent.
  A local scheduled task deploys each enrolled app's QA copy, has tester-army/e2e `explore` drive it
  (plus a read-only production check) on Jon's ChatGPT plan, verifies every finding with a failing
  test, and files confirmed bugs as deduplicated GitHub issues with Jon's gh login through
  sre-agent's runtime. Use for "qa-agent", "daily QA", "explore my app every day", "AI QA", "bug
  bash on a schedule", "enroll this repo in QA", or "/qa-agent run" (the scheduled daily run).
dependsOn:
  - jonmumm/skills@sre-agent
  - jonmumm/skills@client-telemetry
---

# qa-agent

sre-agent watches what real users hit, through the logs. qa-agent goes looking for what nobody has hit
yet. Both file into the same GitHub issues, with the same dedupe, mute and regression reopen.

```
Mac, 06:00 local scheduled task "qa-agent daily"  (prompt: /qa-agent run)
  for each enrolled repo whose main moved:
    fresh worktree of origin/main
    ─▶ wrangler deploy --env qa                      (the QA copy, its own data)
    ─▶ e2e explore × qa/charters.yml                  (QA copy: full play; prod: read-only)
    ─▶ verify each issue finding with a failing test  (e2e guide bug-bash)
    ─▶ scripts/file-findings.sh ─▶ sre-agent runtime ─▶ GitHub issues (label sre-agent, service "qa")
  morning report in the Claude app
```

**Why all on the Mac:**
- e2e can't use a Claude subscription. Jon chose his ChatGPT plan, and e2e's docs say subscription
  logins don't survive CI: a copied token stops working after its first refresh.
- On the Mac, `~/.config/e2e/oauth.json` refreshes itself.
- Filing uses Jon's own `gh` login and deploying uses his wrangler login, so no repo needs a
  workflow file or new secrets.
- The Mac can also test the iPad layout in the Simulator.

**What this setup gives up:**
- **Email.** GitHub doesn't notify you of issues you filed yourself, and the `sre@mumm.dev` Worker only
  trusts GitHub's OIDC identity. The morning report in the Claude app is the notice.
- **Automatic fix PRs.** sre-agent's fix job runs in GitHub Actions. QA issues sit at autonomy 1; fix
  them in the repo's session, or by hand.

## Rules

- **Prod is read-only.** On a `prod` target: no rooms, no sign-ins, no submissions, nothing
  injection-shaped in URLs. Explorers create and play only on the QA copy.
- **ChatGPT usage limit.** If any `e2e` run fails with a usage limit, stop the whole run, file
  nothing more, and report it. Never switch to an API key. Jon's rule: ChatGPT/Codex limits are
  shared with image generation.
- **Confirmed means proven.** A repro test failed with `ASSERTION_FAILED` for the reported reason.
- **Unverified is labeled.** A prod finding that can't be safely reproduced is filed as
  `unverified`, with the reason.
- **Rejected is never filed.** That covers findings explained by the environment, the seed data,
  the design, or explorer blind spots.
- **Warnings (cosmetic) are not filed.** List them in the report.
- **Jon's working copies stay untouched.** Explore from a fresh worktree of `origin/main`. Never
  push, never change `.github/`, and deploy only the `qa` environment. Production deploys are
  never qa-agent's job.

## The daily run ("/qa-agent run")

Registry: `~/.config/qa-agent/repos.txt`, one absolute repo path per line. State:
`~/.config/qa-agent/state/<repo>.sha`. If the registry is empty, report "No repos enrolled" and stop.

For each registered repo, in order:

1. **Skip if unchanged.** `git -C <repo> fetch origin main -q`. If `git rev-parse origin/main` equals
   the saved sha, skip the QA charters. Still run `prod` charters, at most once a day.
2. **Worktree.** `git -C <repo> worktree add --detach "$TMPDIR/qa-<name>-<date>" origin/main`, then
   `pnpm install --frozen-lockfile`.
3. **Deploy the QA copy.** In the worktree, `pnpm exec wrangler deploy --env qa`. If it fails, report
   it and skip this repo's QA charters. A broken QA deploy is the finding.
4. **Explore.** For each charter in `qa/charters.yml`:
   `pnpm exec e2e explore --target <target> [--agent <agent>] --output .e2e/qa-<n> "<goal>"`, up to 4
   at a time. Read `.e2e/qa-<n>/report.json` → `run.explore.findings`.
5. **Verify** each `kind: "issue"` finding, following `pnpm exec e2e guide bug-bash`:
   - Set aside what the environment, the design or the seed data explain, and explorer blind spots
     (`rejected`).
   - Write a repro test under `qa/repro/` against the `qa` target. It is `confirmed` only if the test
     fails with `ASSERTION_FAILED` for the reported reason.
   - A prod-only finding the QA copy doesn't reproduce is `unverified`, with the reason.
   - Use one subagent per area when there are many.
6. **File.** Write the batch below to `<worktree>/.e2e/qa-batch.json`, keeping at most 20 findings,
   highest severity first. Then run:
   `~/src/skills/qa-agent/scripts/file-findings.sh <repo> <worktree>/.e2e/qa-batch.json`.
   It prints the issues it created, updated or reopened.
7. **Record.** Write the sha to the state file, then `git -C <repo> worktree remove --force <worktree>`.
8. **Report**, one block per repo:
   - charters run
   - findings (issue / warning)
   - confirmed, unverified and rejected counts, with reasons
   - issues created, updated and reopened, with links
   - each run's printed model usage
   - any deploy failure or blocked/errored run (exit 2 or 3), with the reason; that is config, not a
     bug report

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
`{status:"rejected", note}`. Rejected findings are dropped by the converter.

## Enroll a repo

Do this in the repo's own session. Ask Jon before creating Cloudflare resources, and before
committing changes to `wrangler` config.

1. **QA copy.**
   - Add a wrangler `[env.qa]`: Worker `<name>-qa`, with its own Durable Object namespaces, KV, R2
     and D1, so nothing touches production data.
   - Deploy it once by hand.
   - Tag QA traffic so sre-agent can tell it apart: explorers send an `x-qa-run` header, and the
     Worker's wide events record it as `qa_run`.
2. **e2e.**
   - `pnpm add -D e2e@0.17.0 ai @ai-sdk/openai`. The model is `chatgpt('<model>')` from
     `e2e/oauth/chatgpt`. Jon's ChatGPT login is already on this Mac; `pnpm dlx e2e@0.17.0 models
     openai` lists the models.
   - Two targets in `e2e.config.ts`: `qa` (the QA copy's URL) and `prod`. The `prod` target gets
     agent `context` saying it is read-only.
   - Personas as e2e agents (first-time family, grown-up host, error paths) with short system prompts.
   - Seeded QA accounts only. Never type or log kids' names.
3. **Charters.** Copy `templates/charters.example.yml` to `qa/charters.yml` and write 4–6 charters for
   this app's real flows: TV, phone and iPad.
4. **Filing config.** Copy `templates/qa-agent.config.yml` to `qa/qa-agent.yml`. The repo needs a
   GitHub remote.
5. **Register.** `echo "<abs path>" >> ~/.config/qa-agent/repos.txt`.
6. **Prove it.**
   - Run one charter by hand.
   - Then do a full `/qa-agent run` limited to this repo, with
     `file-findings.sh <repo> <batch> --dry` first, then for real.
   - Report the issues it filed, or why none.

## Scheduling

The daily run is the Claude desktop scheduled task **qa-agent daily** (06:00 local, prompt
`/qa-agent run`). It runs only while the Claude app is open. If the app was closed at 06:00, it
runs at the next launch.
