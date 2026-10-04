---
name: how
description: >
  Explain how a part of the codebase works before changing it: data flow, ownership, where state
  lives, the seams, and the gotchas, at the level a senior engineer needs to build a working mental
  model. Uses parallel read-only explorers for subsystems that span many files. Use for "how does
  X work", "walk me through", "where should this live", "which layer owns this", or as the
  grounding step of `architect` and `aaa-hillclimb`.
---

# How

Adapted from pstack's `how`.

## 1. Size the question

- **Narrow** (one module or function): explore and explain directly, or with one read-only
  `Agent` (`opus`). Go to 3.
- **Broad** (a subsystem, a cross-device flow like "TV ↔ room ↔ phones", the cast path): split
  it into 2–4 angles (e.g. server machine, client rendering, transport, persistence) and spawn one
  read-only explorer per angle in one message.

If the question is vague, state your reading of it and proceed; the user can redirect.

## 2. Explorers (broad only)

Each explorer traces its angle in the real code and returns: entry points with `file:line`, the
data and control flow as a short numbered trace, where state lives and who mutates it, external
boundaries (network, storage, devices, paid APIs), and anything surprising. Facts with citations,
no essay.

## 3. Explain

One explainer (you, or an `opus` agent given the explorers' findings) writes, dropping sections
that don't apply:

- **Overview**: two or three sentences.
- **Key concepts**: the nouns a reader must know, in the codebase's own names.
- **How it works**: the main path as a numbered trace with `file:line`.
- **Where things live**: a short table of directories/modules and what they own.
- **Gotchas**: timing traps, hidden coupling, invariants enforced only by convention.

Explain the shape, not every line. If the explanation needs a diagram, use a short ASCII one.
