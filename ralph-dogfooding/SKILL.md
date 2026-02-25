---
name: ralph-dogfooding
description: Ralph dogfooding loop — autonomous exploratory QA using Playwright MCP and Linear. Use when asked to "dogfood", "bug hunt", "exploratory test", "qa loop", or "run continuous app checks".
---

# Ralph Dogfooding Loop

Autonomous loop that explores the app with **Playwright MCP**, captures evidence (screenshots, repro steps), dedupes against **Linear**, creates/updates issues with reproducible details, and appends each run to a progress log. Uses only Playwright MCP for the browser (no agent-browser); the loop runs without human approval.

## Architecture

```
0. If no AGENTS.md → create-agents-md skill, then stop
1. Read AGENTS.md + .ralph/lessons.md + .ralph/dogfood-progress
2. Pull open issues from Linear (dedupe set)
3. Explore core routes via Playwright MCP (navigate, snapshot, screenshot)
4. Document each issue with evidence (screenshot sequence + report)
5. Create/update Linear issues with evidence
6. Append iteration summary to .ralph/dogfood-progress
```

## Workflow (Playwright MCP + Linear)

### 1. Initialize

- Target URL and artifact dir come from the Ralph script (`.ralph/dogfood-artifacts/iteration-N/`; `.ralph/` is added to `.gitignore` by the script).
- Create `{ARTIFACTS}/screenshots`, copy [templates/dogfood-report-template.md](templates/dogfood-report-template.md) to `{ARTIFACTS}/report.md`, fill header (Date, App URL, Session, Scope).
- Use Playwright MCP: **browser_navigate** to target URL, then **browser_snapshot** to understand the page. Lock the browser tab before interactions; unlock when done.

### 2. Authenticate (if needed)

If the app requires login: use **browser_snapshot** to get element refs, then **browser_fill** / **browser_click** to submit credentials. Wait for navigation/load between steps. For OTP/codes, ask the user once, then enter via browser.

### 3. Orient

- **browser_snapshot** (interactive) to see structure and refs.
- **browser_take_screenshot** (full page or viewport) for the initial state; save to `{ARTIFACTS}/screenshots/initial.png`.
- Identify main nav and plan which routes to hit (e.g. /, /login, /dashboard, /settings).

### 4. Explore

Read [references/issue-taxonomy.md](references/issue-taxonomy.md) at session start — severity levels, categories, and the exploration checklist.

- Work through the app systematically: main nav → each section → interactive elements (buttons, forms, links).
- At each page: **browser_snapshot**, **browser_take_screenshot** for `{page-name}.png`, and check console/errors if the MCP exposes them.
- Test forms (submit, validation), navigation (back, deep links), empty/loading/error states.
- Spend more time on core flows; go deeper where you find clusters of issues.

### 5. Document issues (repro-first)

Explore and document in one pass. When you find an issue, document it immediately, then continue.

**Evidence by issue type:**

- **Interactive/behavioral** (needs steps to reproduce): Take a screenshot **before** the action, perform the action (click, fill, etc.), take a screenshot **after**. Save as `issue-{NNN}-step-1.png`, `issue-{NNN}-step-2.png`, `issue-{NNN}-result.png`. Write numbered repro steps in the report; each step references its screenshot. Playwright MCP may not offer video recording — use screenshot sequences as the standard.
- **Static** (typos, visual glitches on load): One annotated/view screenshot is enough. In the report set Repro Video to N/A.

For every issue:

- Append to the report immediately (use the template block: Severity, Category, URL, Description, Repro Steps with screenshot refs).
- Increment issue counter (ISSUE-001, ISSUE-002, …).
- Save screenshots under `{ARTIFACTS}/screenshots/` with consistent names.

### 6. Linear + progress

- **Use the linear-cli skill** for all Linear operations (list issues, create/update issues, add comments). For issue descriptions and comment bodies with markdown, use `--description-file` and `--body-file` per the skill. Include artifact paths in the issue body or comments. Every issue: URL, environment, expected vs actual, deterministic repro steps.
- Dedupe: check open Linear issues (title + route + expected/actual) so you don’t duplicate.
- Append one entry to `.ralph/dogfood-progress.md`: iteration, routes tested, issue IDs, artifact paths. See [references/progress-format.md](references/progress-format.md).

### 7. Wrap up

- Update the report summary counts to match the issues.
- If no new findings and no issue updates this iteration, output `<promise>NO_NEW_FINDINGS</promise>` so the script can exit.

## Reference guide

| Topic | Reference | Load when |
|-------|-----------|-----------|
| **Issue taxonomy** | [references/issue-taxonomy.md](references/issue-taxonomy.md) | Start of session — severity, categories, exploration checklist |
| **Report template** | [templates/dogfood-report-template.md](templates/dogfood-report-template.md) | Creating the report file |
| **Playwright MCP** | [references/playwright-mcp-evidence.md](references/playwright-mcp-evidence.md) | Browser automation, screenshots, snapshots |
| **Linear** | **linear-cli skill** + [references/linear-cli.md](references/linear-cli.md) | All Linear commands; dogfood dedupe + artifact paths |
| **Progress format** | [references/progress-format.md](references/progress-format.md) | dogfood-progress entries |

## Pre-flight checklist

1. **Playwright MCP** in Codex config (`~/.codex/config.toml`; install script adds it).
2. **linear-cli skill** loaded (e.g. `npx skills add https://github.com/schpet/linear-cli --skill linear-cli`); `linear` on PATH.
3. Project root path and target URL (from Ralph script).
4. Linear team key and artifact dir.
5. Dedupe policy (title + route + expected/actual).
6. Stop criteria: `NO_NEW_FINDINGS` sentinel.

## Setup

- **Script:** [scripts/ralph-dogfooding.sh](scripts/ralph-dogfooding.sh) — run with `--project`, `--iterations`, optional `--url`.
- **Progress log:** `.ralph/dogfood-progress.md` (script creates `.ralph/` and adds it to `.gitignore`). See progress-format.
- **Lessons:** Maintain `.ralph/lessons.md` for recurring failure patterns and tool constraints.

## Evidence policy

- At least one screenshot per issue; for interactive bugs, a step-by-step screenshot sequence.
- Attach artifacts to Linear issues using the linear-cli skill (include artifact paths in description/comment; use CLI attachment commands if available).
- Every issue: exact URL, environment, expected vs actual, deterministic repro steps. Do not block on video; screenshot sequences are the standard.

## Guidance

- **Repro first.** Match evidence to issue type: interactive → step screenshots; static → single screenshot.
- **Append to the report as you go.** Do not batch issues for the end.
- **Never read the target app’s source code.** Test as a user; all findings from the browser.
- **Check the console** when the MCP allows it; many issues show only as JS or network errors.
- **Test like a user.** Common workflows, realistic data, systematic navigation.
- **Do not use agent-browser or agent-use.** This skill uses only Playwright MCP and the **linear-cli skill** for Linear.
