---
name: split-pr
description: >
  Split an oversized PR (or local branch) into a few small, independently green,
  reviewer-aligned PRs using GitHub's native stacked pull requests (gh-stack),
  and retire the original PR gracefully. Use when asked to "split this PR",
  "break this up into smaller PRs", "stack this", "this PR is too big", or when
  a diff spans multiple owners/concerns that would review better separately.
---

# Split PR

Turn one oversized PR (or local branch) into a few small, reviewer-aligned PRs — and leave the original PR gracefully retired.

This skill uses [GitHub's native stacked pull requests](https://gh.io/stacks) via the `gh-stack` CLI extension (`gh extension install github/gh-stack`) instead of hand-rolled branch chains. GitHub now owns the stack: it retargets and cascades base branches automatically on merge, so the old failure mode this skill used to guard against — a squash-merged parent leaving its child PR full of stale commits, requiring a manual `rebase --onto` — no longer happens. Verify the extension is installed (`gh extension list | grep gh-stack`) before starting; if missing, install it first.

## Hard rules

- **Exactly one pause**: the split-plan approval in Step 2 (which includes the independent-vs-stacked choice). After approval, run to completion autonomously.
- **Never discard work.** No destructive git (`reset --hard`, `clean`, branch deletion, manual force-push, history rewrite). Record a backup ref before creating any branch.
- **Clean working tree required** — this skill splits committed work only. If `git status --porcelain` is non-empty, stop and ask the user to commit or stash first.
- **Stage only named files or hunks.** Never `git add .` / `git add -A`. When using `gh stack add -A`, that rule doesn't apply — see Step 4.
- **Never skip or bypass commit hooks** (no `--no-verify`, no `SKIP`).
- **Force-push is scoped to gh-stack.** `gh stack push` / `sync` / `rebase` force-push with `--force-with-lease` as a normal part of cascading rebases — that's expected and safe on branches this skill created. Never run a manual `git push --force` yourself, and if any slice branch has commits you didn't make (a reviewer pushed a fixup directly to it), stop and confirm with the user before running `sync` or `rebase` on that stack.
- Commit messages and PR bodies: plain, direct, neutral voice. State what changed, not what you're about to do.
- Use `gh` CLI for all GitHub operations (PR reads/writes, stack management). If a GitHub MCP server is connected in-session, prefer it for read-only lookups, but `gh` remains the tool of record for mutations since `gh-stack` itself is a `gh` extension.

## Step 1 — Discover the work

Resolve the input:

- **A PR URL / number** → `gh pr view <number> --json baseRefName,headRefName,title,body,reviewRequests` for base, head branch, title, body, and reviewers. Then `git fetch origin` and check out the head branch locally.
- **A local branch** (current branch if unnamed) → base is `main` unless the user names one. Require commits ahead of base; abort if none (`git rev-list --count <base>..HEAD`).

Then gather, in parallel:

- `git diff <base>...HEAD --stat` and the full diff
- `git log --oneline <base>..HEAD` (commit boundaries often hint at natural slices)
- Ownership signals for touched paths (`CODEOWNERS`, nested ownership files)
- Any spec/design doc for the change, to recover intent

## Step 2 — Propose the split (the single pause)

Group the diff into reviewer-aligned slices with minimal cross-slice diff: split independent owners/concerns, keep tightly coupled changes together. Typical natural boundaries: types/utils foundations, the feature code that consumes them, tests/stories/mocks, config/CI.

Detect real dependencies between slices (slice B imports a symbol introduced in slice A, etc.). Show a Mermaid diagram of the slice dependency graph.

Present both strategies and let the user pick via AskUserQuestion:

- **Stacked (default when dependencies exist):** each slice branches off the one below it, managed by `gh-stack`. Smallest possible diff per PR. GitHub's native stack UI shows the dependency graph to reviewers; `gh stack merge` lands the whole stack (or up to a chosen layer) atomically, and automatically retargets/rebases everything still open above it. Recommended now that GitHub maintains the stack — there is no ongoing manual-rebase tax.
- **Independent:** each slice branches off `<base>` directly; shared foundations get pulled into the first slice so later ones stand alone. Use this only when slices genuinely have no code dependency on each other and the user wants them mergeable in any order, in parallel, without a forced merge sequence.

The same form asks for plan approval (slice titles + one-line scope notes where a title is unclear). This is the last question — everything after runs unattended.

## Step 3 — Snapshot and retire-signal

- Backup ref: `git update-ref refs/backup/split-$(date +%s) HEAD`
- If splitting an existing PR: convert it to draft now so reviewers hold off (`gh pr ready <number> --undo`), and leave a short comment saying it's being split and links are coming.

## Step 4 — Build each slice

**Independent strategy:** for each slice, branch from `<base>` (`git checkout -b <slug> <base>`), materialize just that slice's changes, commit normally, and move on — no `gh-stack` involvement.

**Stacked strategy**, in dependency order (bottom of stack first):

1. Bottom slice only: `gh stack init <slug> --base <base>` (omit `--base` if `<base>` is the repo's default branch). This creates and checks out the branch but makes **no commit** — do not run `gh stack add` yet, it would fold the commit into this still-empty layer instead of creating a new one.
2. Materialize this slice's changes from the original head:
   - Whole files: `git checkout <original-head> -- <paths>`
   - Deletions: `git rm <paths>`
   - Files split across slices: generate a patch limited to the file, edit it down to the planned hunks, `git apply`
3. Stage only this slice's files: `git add <paths>` (never `-A` here — that flag is reserved for step 4 below and still means "everything currently in the working tree," which at this point is exactly this slice's changes and nothing else. If in doubt, stage explicit paths.)
4. Commit:
   - Bottom slice: plain `git commit -m "<slice summary>"` (this is the commit `init` left you to make).
   - Every slice above it: `gh stack add <slug> -m "<slice summary>"` — creates the next layer on top of the current stack HEAD from what's staged.
5. Let commit hooks run; fix whatever they flag.

Either way, commit subject: `<slice summary>` in neutral, direct voice. Include a ticket/issue key only if the original PR title or branch already carried one.

## Step 5 — Verify each slice alone

For each slice — `gh stack checkout <slug>` (stacked) or `git checkout <slug>` (independent) — before pushing:

- Lint the changed files (fix, then re-check) — clean
- Typecheck — clean
- Tests for the changed files — green

Loop until green. If a slice cannot pass independently, the boundary is wrong: move the minimal set of files/hunks between slices (or merge two slices), note the deviation from the approved plan in the final report, and continue — do not pause to re-ask. Fixing a boundary on a stacked branch means editing the commit on the branch where the file lives, then `gh stack rebase --upstack` from there to cascade the fix upward.

**Sum check:**
- Stacked: `git diff <original-head> <top-of-stack-branch>` must be empty — the top layer already contains everything below it.
- Independent: in a scratch worktree, merge all slice branches together and `git diff` against `<original-head>`. The diff must be empty. Remove the scratch worktree afterward.

## Step 6 — Open the PRs

**Stacked:** `gh stack submit --auto --open` — pushes every branch, creates a PR per layer (auto-generated titles, marked ready for review, not draft), and creates the stack object on GitHub with each PR's base already pointing at the layer below it. Then, for each PR, `gh pr edit <number> --title "<slice summary>" --body "<body>"` to replace the auto-generated title/body with the real one. Body: `Part <n> of <m> — split from #<original>` near the top, plus the merge order.

**Independent:** for each slice, in any order — push (`git push -u origin HEAD`), then `gh pr create --base <base> --title "<slice summary>" --body "..."`. Body: `Part <n> of <m> — split from #<original>` near the top.

## Step 7 — Retire the original PR

Once all slice PRs are open:

- Comment on the original listing the replacement PRs in merge order.
- Close the original PR (`gh pr close <number>`). Do not delete its branch or the backup ref.

If the input was a local branch with no PR, skip this step; just leave the branch untouched.

## Step 8 — Report

Short and complete:

- Each slice: title → PR URL, its base, and the merge order
- The backup ref name
- Any deviations from the approved plan (Step 5 boundary moves)
- **Stacked strategy only** — how to land it later:
  - `gh stack merge --yes --squash` (or `--merge` / `--rebase`) merges the whole stack atomically; pass a PR number to merge only up to that layer, leaving the rest open, auto-retargeted onto the new base.
  - If the base branch uses a merge queue, `gh stack merge` enqueues the stack automatically.
  - After any merge, `gh stack sync --prune` fast-forwards trunk, cascade-rebases what's left, and deletes local branches for merged PRs — no manual `rebase --onto` needed.
  - If trunk moves before the stack merges, `gh stack rebase` (or `sync`, which also re-pushes) keeps every layer current.
