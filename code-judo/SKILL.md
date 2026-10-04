---
name: code-judo
description: >
  A harsh maintainability review that hunts for restructurings that delete complexity instead of
  moving it: special cases bolted into unrelated flows, files growing past ~1k lines, shallow
  wrappers, silent fallbacks over unclear invariants, logic in the wrong layer. Use for "code
  judo", "thermo-nuclear review", a deep code-quality audit, the weekly hardening pass alongside
  CRAP and mutation testing, or before merging a large agent-written change.
---

# Code judo

A review that only asks "is this a bit cleaner?" leaves the codebase slowly worse. This one asks
"which restructuring makes whole branches, modes or layers disappear?". Adapted from pstack's
`thermo-nuclear-code-quality-review`.

## Scope

The branch diff by default (`git diff main...HEAD`); a named module or the whole of `src/game` for
a hardening pass. Behaviour must not change: every proposal keeps the tests green.

## What to hunt for

1. **The judo move.** A reframing that uses the existing architecture better so the change gets
   smaller. Prefer deleting moving parts over rearranging them.
2. **File sprawl.** A file crossing ~1,000 lines in this change needs a reason; propose the split.
3. **Spaghetti growth.** New `if`s for one case inside unrelated flows. Push the case into its own
   module, a state in the machine, a policy object, or data.
4. **Shallow modules.** Wrappers, identity helpers and pass-throughs that add a name without
   hiding anything. Run the deletion test: delete it in your head; if nothing gets harder, it goes.
5. **Unclear boundaries.** Optional fields that are always set, `unknown`/`any`/`as`, silent
   fallbacks. Make the invariant a type or a parse at the edge (`parse-at-boundary`).
6. **Wrong layer / duplication.** Logic that belongs in the room machine living in the client, or
   a second copy of an existing helper.
7. **Magic.** Generic mechanisms that hide a simple data shape; reflection; stringly-typed
   dispatch. Boring and direct wins.

Cross-check with numbers when available: CRAP per function (`crap`), surviving mutants
(`mutation-testing`). A high CRAP score is a prompt to ask "should this module be deeper?" before
"add more tests".

## Output

Ranked by payoff: for each finding, `file:line`, what's wrong in one line, the proposed
restructuring (concrete: what moves where, what gets deleted), estimated lines removed, and risk.
Lead with the single biggest judo move. Apply only when asked; when applying, one commit per
restructuring with tests green after each.
