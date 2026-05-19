---
name: auto-grill-me
description: >
  Continue an in-progress /grill-me session in auto-pilot — the agent keeps asking
  the same relentless questions, but answers each one with its own best
  recommendation and moves on. The user no longer types answers; they
  interrupt (Esc) only when they disagree. Use to power through long
  grilling sessions once you and the agent are clearly aligned.
---

# Auto Grill Me

A self-driving extension of [/grill-me](../grill-me/SKILL.md). Same interrogation, but the agent stops waiting on the human for each answer — it picks the most defensible option, records the choice, and rolls into the next question. The human's job shifts from "answer every question" to "interrupt only when something looks wrong."

> **When to invoke**: in the middle of a /grill-me session, once the last several Q/As have been you saying "yes, obviously" or "go with your recommendation." That's the signal the agent has enough context to drive the rest itself.
>
> **When NOT to invoke**: at the start of a grilling session, on a domain the agent doesn't know, or any time the alignment loop is still doing real work. Skipping that loop is the entire risk — see "Tradeoffs" below.

## Behavior

When this skill is invoked, adopt the following directive for the remainder of the session:

1. **Keep grilling.** Walk the same design tree /grill-me would walk — dependencies between decisions, edge cases, hidden assumptions. Do not soften the questions to make auto-answers easier.
2. **Answer each question yourself** with the option you'd recommend, in one short paragraph: the choice, the one-line reason, and the assumption it depends on. Format:

   ```
   Q: <the question you would have asked>
   A (auto): <choice> — <why> — assumes <assumption>
   ```

3. **Surface low-confidence answers explicitly.** If your confidence in the auto-answer is low, or the question is load-bearing for the whole plan (architecture-defining, irreversible, or trades safety for speed), mark it:

   ```
   ⚠ low-confidence / load-bearing — interrupt me here if you disagree
   ```

   Do **not** skip these. They are exactly the questions the human needs to see.

4. **Run in short batches.** Emit 3–5 Q/A pairs, then pause for one beat (single line: `— continuing, interrupt to redirect —`) before the next batch. This gives the human a natural place to press Esc without losing context.

5. **End every auto-run with the /grill-me close-out question**: *"What did we assume that we didn't write down?"* List the assumptions accumulated across the auto-answers, so the human can scan them in one place even if they didn't interrupt anywhere.

## Tradeoffs (read before using)

This skill removes the human-in-the-loop friction that gives /grill-me its value. Matt's own original framing (the tweet this skill is adapted from) ends with "the more I think about it, the more I hate it" — because without the human, the agent converges on its own biases instead of the user's intent. The thread surfaced three real failure modes:

- **Lost alignment.** The point of /grill-me is shared understanding. Auto-answering trades that for speed.
- **Missed non-obvious questions.** A run of "yes, obviously" answers can lull both sides into auto-piloting past the one question that actually mattered.
- **Hard to undo.** If a bad auto-answer five questions back changed the design's direction, unwinding it is expensive.

Mitigations baked into the behavior above: explicit low-confidence flags, batched pauses, and a mandatory assumption-dump at the end. They reduce the risk; they don't eliminate it. If you find yourself interrupting more than ~1 in 5 auto-answers, stop — you're not actually aligned, and /grill-me's normal mode is the right tool.

## Relationship to /grill-me

/auto-grill-me does not replace /grill-me. It is a mode you enter mid-session. The /grill-me directive (relentless interrogation of the design tree) still holds — auto-grill-me only changes who supplies the answers.

To exit auto-pilot, the user types anything other than "continue" / "keep going". Any substantive message — a correction, a new question, a "wait, go back to X" — drops you back into normal /grill-me mode for the rest of the session.
