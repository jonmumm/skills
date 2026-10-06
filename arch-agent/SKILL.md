---
name: arch-agent
description: >
  Local routine that runs improve-codebase-architecture unattended on Jon's recently active repos:
  once a week per repo it implements the strongest deepening opportunity test-first as a draft PR
  and emails Jon the link from sre@mumm.dev; every day it revises open proposals Jon commented on.
  Past proposals' PR comments are its memory. Use when asked to "run improve-codebase-architecture
  regularly", "weekly architecture PRs", "architecture agent", "propose refactors automatically",
  "arch-agent", or "/arch-agent run" (the scheduled run).
dependsOn:
  - jonmumm/skills@sre-agent
---

# arch-agent

`improve-codebase-architecture` (mattpocock/skills, installed in `~/.claude/skills`) is built for a live
conversation: a report, "which would you like to explore?", then a grilling loop. arch-agent runs it
with nobody there and turns that conversation into a PR conversation.

```
Mac, 07:00 local routine "arch-agent daily"  (prompt: /arch-agent run)
  1. revise: for each open arch-agent PR with new comments from Jon
       worktree on its branch ─▶ act on the feedback ─▶ push the branch ─▶ reply on the PR ─▶ email if code changed
  2. propose: for each recently active repo with no open proposal and none in the last 7 days
       read past arch-agent PRs + comments ─▶ worktree of origin/main ─▶ explore ─▶ strongest "Strong" candidate
       ─▶ implement test-first, behavior unchanged ─▶ draft PR labeled arch-agent ─▶ email Jon the link
```

**Why it runs locally:** it runs on Jon's Claude subscription through Claude Code itself. It needs no
per-repo workflow files, no Claude GitHub app, and no `CLAUDE_CODE_OAUTH_TOKEN` secret. It
pushes and opens PRs with Jon's own `gh` login.

**Feedback lives in PR comments, in public.** Jon reads the email and replies on the PR. Every
proposal run reads all past arch-agent PRs and their comments first, so a rejected idea stays
rejected.

## Rules

- **Allowed pushes:** only branches named `arch-agent/<date>-<slug>`. Never push to the default
  branch, never merge, never force-push someone else's commits. Never edit `.github/`.
- **Jon's working copies stay untouched:** always work in a fresh worktree under `$TMPDIR`.
- **Behavior must not change.** Never modify an existing test to make it pass. If a test has to
  move because the shallow module it tested is gone, explain each one in the PR. Every feedback
  command in the repo's CLAUDE.md must pass before pushing.
- **One open proposal per repo.** At most 2 new proposals per run, to keep usage reasonable.
- **Who steers it:** only comments and reviews by Jon (`gh api user --jq .login`). Ignore bots and
  anyone else.

## The run ("/arch-agent run")

State: `~/.config/arch-agent/state.json`: `{ "<owner/repo>": { "lastProposalAt": iso, "lastSeenFeedbackAt": iso } }`.

**Recently active repos.** Every git repo directly under `~/src`:
- whose `origin` is under `jonmumm/` or `open-game-system/`
- with any commits in the last 7 days (`git log --all --since="7 days ago" --oneline | head -1`). Not
  filtered by author: Jon's agents commit under several emails.
- excluding `jonmumm/skills`

**1. Revise** (for every open PR found with
`gh pr list --repo <r> --label arch-agent --state open --json number,headRefName,title,url`):
- Collect Jon's comments and reviews newer than `lastSeenFeedbackAt`:
  - `gh pr view <n> --comments --json comments,reviews`
  - inline review comments via `gh api repos/<r>/pulls/<n>/comments`

  If there are none, skip the PR.
- Make a worktree on the PR branch (`git fetch origin <branch>`,
  `git worktree add "$TMPDIR/arch-<repo>-<n>" origin/<branch>`, then `git switch -c <branch>`
  inside it), and run `pnpm install --frozen-lockfile`.
- Act on the newest feedback:
  - **Changes requested:** make them test-first, run the feedback commands until they pass, push
    the branch, and update the PR description to match.
  - **A question:** answer it in a PR comment.
  - **He rejects the direction:** acknowledge it in one or two sentences, `gh pr close`, and say in
    the comment whether the reason should stop similar proposals.
- Always reply with one PR comment saying what you did, then update `lastSeenFeedbackAt`.
- If you pushed, email:
  `~/src/skills/sre-agent/scripts/notify-local.sh <file>` with
  `{kind:"arch-pr", event:"revised", repo, runUrl:"local:arch-agent daily", pr:{number,title,url}, summary}`.

**2. Propose** (for each recently active repo with no open arch-agent PR and `lastProposalAt` older than 7 days):
- **Learn first.** Read past proposals with
  `gh pr list --repo <r> --label arch-agent --state all --limit 30 --json number,title,state`, then
  `gh pr view <n> --comments` for each. Never re-propose what Jon rejected, and follow the
  preferences he stated. Read CLAUDE.md, docs/agents/, GLOSSARY.md and the ADRs.
- **Worktree.** `git worktree add --detach "$TMPDIR/arch-<repo>-<date>" origin/<default branch>`, then
  `pnpm install --frozen-lockfile`.
- **Explore.** Follow `~/.claude/skills/improve-codebase-architecture/SKILL.md` and `codebase-design`,
  weighted to recently changed files, with these changes for an unattended run:
  - No HTML report and no "which would you like to explore?": pick the single strongest candidate.
  - No grilling: list the questions it would have asked, with the answer you chose and why.

  If no candidate is rated Strong, open nothing and record why in the report.
- **Implement it test-first** on branch `arch-agent/<yyyy-mm-dd>-<slug>`, following the Rules above.
  Push the branch.
- **Open the draft PR.** First run `gh label create arch-agent --repo <r> --color 5319e7 --force`, then
  `gh pr create --draft --label arch-agent`. The description covers:
  - the candidate card: Files, Problem, Solution, Benefits in terms of locality and leverage,
    Before/After as Mermaid diagrams, Recommendation strength
  - the other candidates, a few lines each
  - "Decisions I made without asking you"
  - how you verified it

  End it with: "Comment on this PR to give feedback. The agent revises it the next morning, and
  future proposals read what you say here."
- **Email:** run `notify-local.sh` with `event:"opened"` and a 2 to 4 sentence summary. Update
  `lastProposalAt`. Remove the worktree.

**3. Report**, one line per repo:
- what was revised or proposed, with PR links
- what was skipped and why: no activity, proposal already open, nothing Strong
- anything that failed

## Schedule and notifications

- **Schedule.** The Claude desktop routine **arch-agent daily** runs at 07:00 local with the prompt
  `/arch-agent run`. It runs only while the Mac is awake and the Claude app is open. A missed day
  runs at the next launch.
- **Notifications.** `sre-agent/scripts/notify-local.sh` emails Jon from `sre@mumm.dev` through the
  sre-notify Worker. It authenticates with the key in the Keychain item `sre-notify-local-key`,
  matching the Worker's `LOCAL_NOTIFY_KEY` secret. To rotate the key, delete that Keychain item,
  rerun the key setup from `sre-agent/SKILL.md`, then `wrangler secret put LOCAL_NOTIFY_KEY` in
  `sre-agent/notifier`.
