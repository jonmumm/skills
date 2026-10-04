---
name: why
description: >
  Find out why code is the way it is: the commits, PRs, issues, chat threads, memory notes and
  incidents that shaped it, with honest confidence levels for every claim. Use for "why does X
  work this way", "why did we pick Y", "was this intentional", regressions ("when did this
  break"), before removing something that looks dead, or as part of `architect` when a design
  changes ownership or layering.
---

# Why

`how` explains what the code does; `why` explains the forces behind its shape. Adapted from
pstack's `why`.

## Posture

Separate what the evidence says from what you infer. Every claim carries one of: **confirmed**
(a commit/PR/issue says so), **likely** (strong circumstantial evidence), **guess** (plausible, no
evidence). "No record found" is a valid, useful answer. Never invent a rationale.

## 1. Anchor in code

File paths, line ranges, key symbols, then the history:

```sh
git blame -L <start>,<end> <file>
git log --follow --oneline -20 -- <file>
git log --follow -p -S '<symbol>' -- <file>        # when a symbol appeared or changed
gh pr view <n> --json title,body,comments,reviews  # PRs referenced in commit subjects
```

## 2. Investigate the sources that exist (in parallel)

One read-only investigator per available source, each with the anchor:

| Source | How |
|---|---|
| Git and PRs | commit messages, PR bodies and reviews, reverted commits |
| Issues | Linear (`mcp__claude_ai_Linear__*` or `linear-cli`), GitHub issues |
| Decisions | `docs/adr/`, `docs/`, the repo's CLAUDE.md, skill files in `~/src/skills` |
| Memory | `~/.claude/projects/<slug>/memory/` (may be stale: date every claim) |
| Notes | the Obsidian vault via qmd (`mcp__qmd__query`) |
| Chat | Slack MCP, if the question touches team decisions |
| Runtime | Cloudflare logs / observability, gcloud logging for the stream server |
| Past sessions | `~/.claude/projects/<slug>/*.jsonl`, grep for the symbol or file name |

Skip sources that aren't connected and say so.

## 3. Synthesize

- **Answer**: the most likely reason, in two or three sentences, with its confidence.
- **Evidence**: each supporting item with its pointer (SHA, PR #, issue id, note path).
- **Timeline**: dated events that shaped it, when history matters.
- **Open questions**: what no source answers, and who or what could.
