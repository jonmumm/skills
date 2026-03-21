---
name: codex-review
description: >
  Cross-agent code review: run OpenAI Codex to review your changes, then address
  its feedback. Use when asked to "codex review", "get a second opinion", "cross-review",
  "have codex review this", or "external review". Works with uncommitted changes,
  specific commits, or branch diffs.
---

# Codex Review

Get a fresh-eyes code review from OpenAI Codex, then systematically address the feedback.
Two different models reviewing the same code catches more issues than one model reviewing twice.

## When to use

- Before committing or opening a PR — get a second opinion
- After a /nightshift or /swarm run — cross-validate the output
- When stuck on a bug — a different model may spot what you missed
- During /vsdd adversarial review phase — as an additional reviewer

## Workflow

```
1. Determine review scope (uncommitted, commit, branch diff)
2. Build review prompt with project context
3. Run `codex review` and capture output
4. Parse findings into actionable items
5. Address each finding (fix, explain why it's fine, or flag for user)
6. Re-run review to verify fixes (optional)
```

## Step 1: Determine Scope

Ask the user or infer from context:

| Situation | Command |
|-----------|---------|
| Review uncommitted work | `codex review --uncommitted` |
| Review a specific commit | `codex review --commit <sha>` |
| Review branch diff against main | `codex review --base main` |
| Review with a PR title for context | `codex review --base main --title "Add user auth"` |

## Step 2: Build Review Prompt

**Important CLI constraints for `codex review`:**
- `--base` and `--commit` cannot be combined with a custom prompt argument
- `codex review` does not support `-o`, `-m`, or `--json` flags (those are `codex exec` only)
- Model and reasoning effort are set via `-c` config overrides

For a simple diff review, just use the flags alone:

```bash
codex review --base main
codex review --uncommitted
codex review --commit abc123
```

For custom review instructions (without `--base`/`--commit`), pass a prompt directly.
Codex will review the current repo state:

```bash
codex review "Review for correctness, test coverage, and security. Reference file paths and line numbers."
```

### Adding project-specific context

If the project has a CLAUDE.md, include its key conventions in the prompt.
Read CLAUDE.md and extract the "Core principles" and "Key conventions" sections
to give Codex the same context Claude Code has.

## Step 3: Run Review and Capture Output

`codex review` outputs to stdout. Capture it with `tee`:

```bash
# Capture review output to a file
codex review --base main \
  -c model_reasoning_effort="xhigh" \
  2>&1 | tee .codex-review-output.md

# Or for uncommitted changes
codex review --uncommitted \
  -c model_reasoning_effort="xhigh" \
  2>&1 | tee .codex-review-output.md
```

The agent then reads `.codex-review-output.md` to parse findings.

## Step 4: Parse and Address Findings

After the review completes, read the output and categorize:

1. **Critical** — fix immediately (bugs, security issues, broken contracts)
2. **Warning** — fix before merging (weak tests, missing validation, complexity)
3. **Nit** — fix if quick, otherwise note for later

For each finding:
- If it's a real issue: fix it, following TDD (write a test that catches it first)
- If it's a false positive: note why (Codex may lack project context)
- If it needs user input: flag it clearly

## Step 5: Address Feedback

Work through findings top-down by severity. For each fix:

1. Write a test that would catch the issue (if applicable)
2. Make the fix
3. Run feedback commands (test, typecheck, lint)
4. Mark the finding as addressed

Track progress:

```markdown
## Codex Review — Findings

- [x] CRITICAL: SQL injection in user search (auth.ts:42) — added parameterized query
- [x] WARNING: Missing 401 test for /api/items (items.test.ts) — added auth boundary test
- [ ] WARNING: CRAP score 35 on processOrder (checkout.ts:89) — needs refactor
- [~] NIT: Inconsistent error message format — noted, will address in style pass
```

## Step 6: Re-review (Optional)

After addressing findings, optionally re-run:

```bash
codex review --uncommitted "Re-review: I addressed the following findings from a previous review. Verify the fixes are correct and check for any new issues introduced. Previous findings: [paste summary]"
```

## Composing with Other Skills

| Skill | How it composes |
|-------|----------------|
| **/vsdd** | Use as Phase 3 adversarial reviewer alongside Claude's built-in review |
| **/nightshift** | Run after nightshift completes to cross-validate overnight work |
| **/swarm** | Run against the Feature Agent's branch before merging to main |
| **/babysit-pr** | Trigger a codex review before enabling auto-merge |
| **/design-principle-enforcer** | Codex reviews for bugs, DPE reviews for architecture |

## Configuration

### Model and reasoning effort

By default, Codex uses the model from `~/.codex/config.toml`. Override via `-c`:

```bash
# Use a specific model with max reasoning
codex review --base main \
  -c model="gpt-5.4" \
  -c model_reasoning_effort="xhigh"
```

Valid reasoning efforts: `none`, `minimal`, `low`, `medium`, `high`, `xhigh`.

Higher-capability models with `xhigh` reasoning give the most thorough reviews
but take longer. `medium` is fine for quick passes.

### Sandbox permissions

`codex review` is read-only by default — it only reads the diff and codebase.
No sandbox configuration needed.

## Gotchas

- **Codex doesn't have your CLAUDE.md context by default.** Include key conventions in the review prompt, or Codex will review against its own defaults (which may conflict with your project's patterns).
- **Review output varies by model.** o3 gives more thorough reviews but takes longer. gpt-5.4 is fast and good for quick passes.
- **False positives are normal.** Codex may flag patterns that are intentional in your project. Don't blindly fix everything — use judgment.
- **Don't loop reviews forever.** One review + fixes + optional re-review is enough. Diminishing returns after that.
- **`codex review` has fewer flags than `codex exec`.** No `-o`, `-m`, or `--json`. Use `-c model="..."` for model overrides and `| tee` for output capture.
- **`--base` and `--commit` can't combine with a prompt argument.** Use one or the other. For custom instructions without a diff scope, use the prompt argument alone.
- **Codex review is read-only.** It won't modify your code. Claude Code handles all the fixes.
