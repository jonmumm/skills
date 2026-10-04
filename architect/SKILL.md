---
name: architect
description: >
  Design before code for non-trivial work: ground in the existing system (`how`, `why`), sketch
  types, signatures and module boundaries with stub bodies, design it at least twice (`arena`),
  screen for shallow modules and leaky seams, then implement against the sketch and surface every
  deviation. Scrap the sketch when the same workaround keeps appearing. Use for "architect this",
  "design this", a new subsystem, a change that crosses module boundaries, or before a swarm.
dependsOn:
  - jonmumm/skills@arena
  - jonmumm/skills@how
  - jonmumm/skills@why
---

# Architect

Code written before the shape is right locks the wrong shape in. Adapted from pstack's
`architect`.

## 1. Ground

Run `how` over every subsystem the work touches. If the design moves ownership or layering, run
`why` on the current shape so its reasons become constraints, not guesses. Skip only for true
greenfield.

## 2. Sketch, twice

Use `arena` with the grounding as shared input. Each candidate produces a design package:

- types and interfaces, function signatures with stub bodies (`throw new Error("not implemented")`)
  and pseudocode where the logic matters;
- which module owns which state, and where the seams are (what varies across each);
- the test surface: which interface the tests will drive;
- alternatives considered and rejected.

Require at least two structurally different shapes, not variations inside one.

Screen every candidate for red flags before choosing:
- **Shallow modules**: the interface is nearly as big as the implementation.
- **Information leakage**: two modules must change together for one decision.
- **Temporal decomposition**: modules split by "first this, then that" instead of by knowledge.
- **Pass-throughs**: methods that only forward a call.
- **Hypothetical seams**: an interface with one adapter and nothing that varies.

Prefer the deepest design: the most behaviour behind the smallest interface.

## 3. Agree (only when asked)

Default: go straight to implementation and record the design in `docs/design/<slug>.md` (shape,
rejected alternatives, why). Stop for sign-off only if the user asked for a checkpoint. The
scaffold (types and stubs) can land as its own commit.

## 4. Implement against the sketch

Fill stubs test-first (`tdd`). A deviation (a parameter the sketch lacked, a state that turned out
shared) is a question, not friction to absorb: was the sketch wrong, a requirement missed, or the
implementation overreaching? Record accepted deviations in the design doc before closing each unit.

## 5. Scrap when the shape is wrong

Look for patterns, not single cases:
- the same workaround in unrelated places;
- many edge cases each needing their own branch;
- types needing `any`, casts, or optional fields that are always set;
- "we need a lock" for state the sketch said wasn't shared;
- callers needing to know the module's internals.

Then re-run `how` on what exists, update the grounding, and go back to 2. Don't bolt fixes onto a
wrong design.
