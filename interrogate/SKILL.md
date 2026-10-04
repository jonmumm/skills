---
name: interrogate
description: >
  Adversarial multi-model review of a change: three reviewers from different model families
  (Claude fable/opus plus Codex) read the same diff and rubric independently, then a lead
  synthesizes consensus, lone findings and disagreements into a verdict. Use for "interrogate",
  "tear this apart", "stress test this", risky changes (room state machines, cast path, money
  guards, migrations), or before merging work an agent did unattended.
dependsOn:
  - jonmumm/skills@codex-review
---

# Interrogate

The signal comes from model diversity, not personas: different families miss different things.
The output is a verdict; nothing is auto-applied. Adapted from pstack's `interrogate`.

## 1. Scope and intent

- Scope: the files or diff named, else `git diff main...HEAD`, plus the context files a reviewer
  needs to understand it.
- Intent: one paragraph on what the change is supposed to do, from the request, commits and code.
  If you can't state it, ask before spending three reviews.

## 2. Three independent reviewers, one message

| Reviewer | How |
|---|---|
| A | `Agent`, `model: "fable"`, read-only |
| B | `Agent`, `model: "opus"`, read-only |
| C | Codex: `codex exec` with the same prompt (see `codex-review` for invocation) |

Same prompt to all: the intent, the diff, and this rubric. Each finding has a severity
(blocker / should-fix / nit), `file:line`, the concrete failure (inputs → wrong result), and a
confidence. Review lenses:

1. **Correctness**: does it do the intent? Edge cases, races, error paths, server vs client clock.
2. **Boundaries**: external data parsed at the edge (Zod), no `any`/`as`, invariants explicit.
3. **Tests**: do they test behaviour through the interface? Would a plausible bug survive them
   (think like a mutant)? Any existing test edited to make the change pass?
4. **Design**: shallow modules, pass-throughs, special cases bolted into unrelated flows,
   files crossing ~1k lines (`code-judo` lens).
5. **Operations**: cost (paid APIs, GPU), cleanup, idempotence, what breaks on retry or reload.

## 3. Synthesize

Merge duplicates and note who raised each. Findings two or three reviewers raised alone are the
strongest. Lone findings get read on merit. Explicit disagreements are kept, not averaged.

## 4. Lead judgment

Verify every blocker yourself against the code before reporting it. Then deliver:

- **Verdict**: ship / fix first / rethink.
- **Must fix**: verified blockers with the failure scenario.
- **Should fix** and **noted** (lone or low-confidence), each with which models raised it.
- **Dropped**: findings you checked and rejected, one line why.
