---
name: reflect
description: >
  End-of-session learning pass: three reviewers read this session's transcript from different
  angles, a synthesizer turns their findings into concrete edits to specific skills, CLAUDE.md or
  scripts, and anything a script, hook or test could enforce goes to a structural backlog instead
  of more prose. Nothing is applied without the user's OK. Use for "reflect", "what did we learn",
  after a long or bumpy session, or after the user had to correct the agent more than once.
---

# Reflect

`/insights` looks at months of sessions; this looks at one, while it's fresh, and ends in edits.
Adapted from pstack's `reflect`.

## 1. Find this session's transcript

```sh
ls -t ~/.claude/projects/$(pwd | sed 's|[/.]|-|g')/*.jsonl | head -3
```

Confirm the match by checking that its first user message is this session's opening request.
Never read other projects' transcripts. If none matches, write a tight digest of the session and
use that.

## 2. Three reviewers in parallel (one message, read-only)

| Lens | Model | Looks for |
|---|---|---|
| **Corrections** | `fable` | Every time the user pushed back, redirected, or repeated themselves. What did the agent believe, and what would have prevented it? |
| **Tooling** | `opus` | Commands that failed, harnesses rebuilt from scratch, slow loops, missing scripts, flaky checks, money or cleanup near-misses. |
| **Divergent** | Codex (`codex exec`) or `sonnet` | What went *right* that should become default, and what the other two will miss. |

Each returns findings with transcript evidence (quote + approximate position) and a proposed
home: a named skill file, global or repo CLAUDE.md, a script, a hook, a lint rule, or a test.

## 3. Synthesize

One `fable` subagent merges them into three lists:

- **Accepted**: edits with the exact target file and the change (one-line bullet, rewritten
  sentence, new gotcha). Spot-check each citation against the transcript.
- **Backlog (structural)**: anything a script, hook, test, lint rule or check could enforce. These
  beat prose: an agent bounces off a failing check; it forgets a sentence.
- **Rejected**: one-offs, already covered, or contradicted elsewhere, with the reason.

Skip lessons that only matter to this conversation or that the repo already records.

## 4. Apply with approval

Show the three lists and wait. Apply only what the user picks:
- Small edits (a bullet, a corrected fact): edit directly.
- New sections or a new skill: use `skill-creator`.
- Stale facts in skills or memory: fix or delete them, don't append a contradiction.

Commit and push `~/src/skills` for skill edits; commit repo files in their repo.

## 5. Report

Edits applied (file: one line each), backlog items (one line each), dropped (one line + reason).
