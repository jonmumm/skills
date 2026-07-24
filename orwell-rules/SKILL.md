---
name: orwell-rules
description: >
  Apply George Orwell's six rules for clear writing to any prose you produce —
  PR descriptions, commit messages, code comments, docs, RFCs, Slack updates,
  emails, and writeups. Cut jargon, prefer short words, kill needless words,
  favor the active voice, and drop stale metaphors. Use when writing or
  editing prose, when asked to "make this clearer", "tighten this up", "plain
  English", "apply Orwell", or when reviewing writing for clarity.
---

# Orwell's Rules

Prose you generate leaks the same tics every LLM has: hedging, inflated
vocabulary, passive constructions, dead metaphors, and words that carry no
weight. George Orwell named the cure in *Politics and the English Language*
(1946). Six rules. Run everything you write through them.

> "A scrupulous writer, in every sentence that he writes, will ask himself at
> least four questions: What am I trying to say? What words will express it?
> What image or idiom will make it clearer? Is this image fresh enough to have
> an effect? ... Could I put it more shortly?"
> — George Orwell

## The Six Rules

1. **Never use a metaphor, simile, or figure of speech you're used to seeing in print.** Dead metaphors ("leverage", "move the needle", "at the end of the day", "low-hanging fruit") do no work. Either find a fresh image or say the plain thing.
2. **Never use a long word where a short one will do.** `use` not `utilize`, `help` not `facilitate`, `about` not `regarding`, `enough` not `sufficient`, `start` not `commence`.
3. **If it is possible to cut a word out, always cut it out.** Delete filler before you reach for a synonym. Most first drafts shrink 20–40% with no loss.
4. **Never use the passive where you can use the active.** "The migration was run by the team" → "The team ran the migration." Name the actor. (Passive is fine when the actor is unknown or irrelevant — see rule 6.)
5. **Never use a foreign phrase, a scientific word, or a jargon word if you can think of an everyday English equivalent.** Say the everyday word unless the technical term is genuinely more precise for the audience.
6. **Break any of these rules sooner than say anything outright barbarous.** The rules serve clarity, not the reverse. When following a rule makes a sentence worse, break it.

Rule 6 is the meta-rule: **clarity wins.** The other five are defaults, not laws.

## How to apply this

When writing or editing prose, do a dedicated pass against the rules:

1. **Read it aloud in your head.** Anything you'd never say to a colleague, rewrite.
2. **Hunt the passive.** Search for "was/were/been + verb". Rewrite to name the actor unless the actor truly doesn't matter.
3. **Cut filler words.** Delete each and check the sentence still holds:
   `very`, `really`, `quite`, `just`, `actually`, `basically`, `in order to`,
   `it should be noted that`, `it is important to note`, `at this point in
   time`, `due to the fact that`, `in the process of`.
4. **Downgrade inflated words.** Swap the long word for the short one (rule 2 table below).
5. **Kill dead metaphors and clichés** (rule 1).
6. **Re-read for barbarism** (rule 6). If a rewrite reads worse, revert it.

## Common swaps (rule 2)

| Inflated | Plain |
|---|---|
| utilize | use |
| facilitate | help |
| leverage | use |
| in order to | to |
| a number of | some / many |
| the majority of | most |
| commence / initiate | start |
| terminate | end / stop |
| demonstrate | show |
| endeavor / attempt | try |
| subsequent to | after |
| prior to | before |
| in the event that | if |
| with regard to / regarding | about |
| sufficient | enough |
| approximately | about |
| additional | more |
| currently / presently | now |
| methodology | method |

## Before / after

**Before** (passive, inflated, filler, dead metaphor):
> It should be noted that the aforementioned performance regression was
> ultimately determined to have been caused by an inefficient database query,
> and it is recommended that the team leverage caching in order to move the
> needle on latency going forward.

**After** (active, plain, tight):
> A slow database query caused the regression. Cache the results to cut latency.

38 words → 12. Same meaning, sharper.

## Scope and taste

- These rules target **prose**, not code. Don't apply "short word" to variable names or API contracts where a precise technical term is correct.
- Jargon is fine when the audience shares it and the plain word is vaguer (rule 5's escape hatch). "Idempotent" beats a clumsy paraphrase for an engineering audience.
- Don't strip nuance to hit a word count. Rule 6 outranks rule 3.
- Match the register of the surrounding writing — a commit message and an RFC have different tolerances for brevity.

## Origin

Orwell, George. "Politics and the English Language." *Horizon*, 1946. The six
rules appear near the essay's end as a practical summary. Popularized as a
scientific-writing aid by the
[Duke Graduate School Scientific Writing Resource](https://sites.duke.edu/scientificwriting/).
