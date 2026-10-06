---
name: arch-agent
description: >
  Install a weekly architecture agent on a repo: a GitHub Actions cron that runs
  improve-codebase-architecture unattended on repos changed that week, implements the strongest
  deepening opportunity test-first as a draft PR, emails Jon the link from sre@mumm.dev, and revises
  the PR when Jon comments on it. Future runs read past proposals' comments so they learn from
  feedback. Use when asked to "run improve-codebase-architecture on a cron", "weekly architecture
  PRs", "architecture agent", "propose refactors automatically", or "arch-agent".
dependsOn:
  - jonmumm/skills@sre-agent
---

# arch-agent

`improve-codebase-architecture` (from mattpocock/skills) is built for a live conversation: a report,
"which would you like to explore?", then a grilling loop. arch-agent runs it with nobody there and
turns that conversation into a PR conversation:

```
Monday cron ─▶ gate: commits in the last 7 days? no open arch-agent PR? ─▶ skip if not
            ─▶ read every past arch-agent PR and its comments (what Jon rejected or asked for)
            ─▶ explore, pick the strongest "Strong" candidate (none Strong: summary only, no PR)
            ─▶ implement test-first, behavior unchanged ─▶ draft PR labeled arch-agent ─▶ email Jon

Jon comments on the PR ─▶ revise job: change the code / answer / close if rejected ─▶ reply on the PR
                       ─▶ email Jon only if new commits landed
```

- **Feedback lives in PR comments, in public.** Jon reads the email (personal Gmail, from
  `sre@mumm.dev`) and replies on GitHub. The comments are the agent's memory: every proposal run reads
  them first, so a rejected idea stays rejected.
- **One open proposal per repo.** No new proposal is opened until the current one is merged or closed.
- **Skills are pinned.** The workflow downloads `improve-codebase-architecture`, `codebase-design` and
  `domain-modeling` from mattpocock/skills at `MATT_SKILLS_SHA` (MIT) into `.claude/skills/` on the
  runner, and excludes them from git. Bump the SHA deliberately, after reading the upstream diff.
- **Who can steer it:** comments and reviews from the repo owner, org members and collaborators. Bot
  comments never trigger it.

## Install on a repo

1. **Prerequisites.**
   - GitHub remote under `jonmumm` or `open-game-system`; those are the owners the email Worker accepts.
   - pnpm project. Otherwise edit the setup steps.
   - CLAUDE.md lists the feedback commands, and the agent must make them pass. Without that list it
     can't verify its own refactor, so run `/create-claude-md` first.
2. **Copy** `templates/arch-agent.workflow.yml` to `.github/workflows/arch-agent.yml`.
3. **Secrets** (give the user the exact commands; never ask for values):
   - `! claude setup-token`, then `! gh secret set CLAUDE_CODE_OAUTH_TOKEN`. Same token as sre-agent's fix job.
   - Install the Claude GitHub app (`/install-github-app` in an interactive `claude`). PRs opened with
     the default `GITHUB_TOKEN` don't trigger CI, and their comments don't trigger workflows.
4. **Prove it.** Commit, push, run `gh workflow run arch-agent`, and watch it with `gh run watch`.
   - Report the draft PR it opened, or the job summary if no candidate was Strong.
   - Confirm the email arrived.
   - Leave a test comment on the PR and confirm the revise job ran and replied.

## Cost and limits

- **Usage.** Each proposal is one long Claude run, up to 120 turns on Jon's subscription token. Each
  feedback comment adds a shorter run. Inactive repos cost one quick shell step.
- **Kill switch.** `gh variable set ARCH_AGENT_ENABLED --body false` stops new proposals. Feedback on
  open PRs is still handled.
- **Limits.** The agent never pushes to the default branch, never merges, never edits `.github/`, and
  never changes existing tests to make them pass. A moved test must be explained in the PR.

## Changing it

- **Email format:** `../sre-agent/notifier` (`kind: "arch-pr"`). Change it test-first, then
  `pnpm run deploy` there.
- **Repo installs:** each repo carries its own copy of the workflow, so a template change needs
  re-copying. Find installs with `gh search code "name: arch-agent" --owner open-game-system --owner jonmumm`.
