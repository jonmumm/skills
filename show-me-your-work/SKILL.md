---
name: show-me-your-work
description: >
  Keep an append-only decision log (TSV, one row per decision: what, why, evidence pointer,
  result) for long, overnight or unattended runs, audit it against the transcript at the end, and
  have a different model family flag what the user should look at. Use for nightshift, swarm,
  hill-climbs, any run the user will review after stepping away, or "show me your work".
---

# Show me your work

A reviewer who wasn't there needs the forks, not the narration. Adapted from pstack's
`show-me-your-work`.

## The log

`decisions.tsv` in the work dir (or `.audit/<slug>.tsv` when several runs overlap), gitignored
unless a reviewer needs the trail to trust the result. Columns:

`ts  phase  decision  why  evidence  result`

- **evidence** is a pointer: commit SHA, `file:line`, a screenshot or verdict path. Never prose.
- **result** is a state: `tests green`, `kept`, `reverted`, `av-verdict pass`, `open`, `blocked`.
- Plain words, as you'd tell a teammate (`orwell-rules`).

Append with the helper, which stamps the time and keeps cells single-line:

```sh
~/src/skills/show-me-your-work/scripts/log.sh decisions.tsv <phase> <decision> <why> <evidence> <result>
```

Log forks, finished units with their check result, pivots and reverts with their trigger,
blockers, and money spent. Not every command. Hill-climbs: one row per kept-or-reverted step.

Append-only: a wrong row is superseded by a new row, never edited. A session picking up an
existing log first writes a `start` row naming itself.

## Before handing back

1. **Audit**: walk this run's rows against the transcript. Every row maps to something real and
   its evidence resolves. A fork that shaped the work but isn't logged gets a new row.
2. **Cross-family review**: a reviewer on a different model family (Codex via `codex exec`, or
   `opus` if you are fable) reads the log and transcript and flags weak evidence, skipped
   verification, risky calls and anything the user would miss on a skim.
3. End the reply with **Attention**: `reviewed by <model>`, then each flag with its row, or
   "No flags".

Render for reading: `column -s$'\t' -t decisions.tsv`.
