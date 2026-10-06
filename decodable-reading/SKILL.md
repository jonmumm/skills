---
name: decodable-reading
description: >
  Build early-reading features that follow systematic synthetic phonics: a child's known sounds,
  decodable-word checking, sound buttons, tricky words, leveled progression and karaoke read-along,
  with generated stories that only ask a child to read what they can decode. Use for kids' reading
  apps and games ("help my kid learn to read", "phonics", "decodable stories", "sound it out",
  "leveled readers", "like Songbirds / Oxford Reading Tree", "karaoke text").
---

# Decodable reading

A beginning reader should only be asked to read words made from sounds they've been taught.
Guessing from pictures or context builds bad habits. **The app guarantees decodability in code,
not in a prompt.**

## The model

- **Graphemes → phonemes.** Track what the child knows as graphemes (letters or letter groups) and
  the sound each makes:
  - single letters: s a t p i n m d g o c k e u r h b f l j v w x y z
  - digraphs: ck ff ll ss zz sh ch th ng qu wh
  - later, vowel teams: ai ee igh oa oo ar or ur ow oi ear air ure er
- **Sound order** follows the child's school program when known (Jolly Phonics, Letters and
  Sounds, UFLI and Fundations differ). Ask the parent. Default: s a t p i n · m d g o c k ·
  ck e u r · h b f l · ff ll ss · j v w x · y z zz qu · ch sh th ng.
- **Known vs learning.** A parent marks each grapheme. Words to read use only known graphemes. A
  learning grapheme can appear once per page when it's that story's focus.
- **Tricky words** (the, I, to, no, go, into, he, she, we, me, be, was, you, they, my, her, all,
  are, and the child's own name) come from a separate parent-edited list.

## The checker (build it first, test it hard)

A pure function: `isDecodable(word, known, tricky) → { ok, graphemes | reason }`.

- Split with greedy longest-match over the known graphemes (so "ship" becomes sh·i·p, not
  s·h·i·p, once sh is known), then require every piece to be known.
- Don't rely on spelling alone: keep a small exceptions table for words whose spelling parses
  but whose pronunciation doesn't match at this stage ("was", "of", "put", "some"). Treat those
  as tricky.
- Stories are JSON: narrator text (free) plus the child's read spans (checked). Reject and
  regenerate any story where a read span fails. Never "fix" a word silently.
- Golden tests: 50+ words each with the known sets where they pass and fail. Property test:
  every word the generator emits passes the checker.

## Showing words to a child

- Font: Andika (single-story a and g), large, generous letter spacing, dark on warm paper. No
  italics or all caps.
- **Sound buttons:** a dot under each single-letter grapheme, a dash under each digraph. Tapping a
  grapheme plays its sound, and tapping the word plays the blended word.
- One read span at a time. Nothing else on the child's screen needs reading.
- The child's screen shows no timers or wrong/right marks. A grown-up confirms reading ("He read
  it!" / "We read it together"). Don't use speech recognition to judge children's reading; it's
  unreliable and discouraging.

## Audio

- **Phoneme sounds are recorded by a person** (a parent, or a phonics-trained voice). Pure
  sounds: "mmm", not "muh". Text-to-speech mangles isolated phonemes. Check each clip by ear.
- Whole words and narration can be TTS. For karaoke, use ElevenLabs
  `text-to-speech/{voice_id}/with-timestamps`. Group its character alignment into word timings,
  then highlight the current word in a requestAnimationFrame loop off the audio clock. The reference
  implementation is `~/src/little-hero-adventures-autonomous` (`wordTimings.ts`, `KaraokeText.tsx`,
  `karaokeUtils.ts`).
- Narration pauses at the child's span. After it's read, replay the line with the child's word
  highlighted in their color.

## Progression

1. Letter-sound matching (tap the letter that says /s/)
2. One CVC word per page (sat, pin)
3. Two words, then a phrase ("a big pig")
4. A short sentence with one tricky word
5. Digraph words (ship, chop)
6. Two-sentence pages

A parent moves the level up; the app can suggest it after he's read things confidently several
times. Words that needed help come back within the next few stories (simple spaced repetition).
A new grapheme is introduced with a short spoken moment ("Pip found a snake. It says sssss").

## Generating stories

- Give the model the known graphemes, tricky words, the allowed read-span word list (precomputed
  by the checker from a vocabulary), the world or setting, and the child's earlier choices.
- The model writes narrator text freely but can only choose read spans from the allowed list.
  Validate with the checker, retry up to N times, then fall back to a handwritten story.
- Keep it warm, silly and short. The child's name and companion recur, and every story ends calm.

## Don'ts

- Don't reproduce commercial leveled books (Songbirds, Oxford Reading Tree). Write original
  stories that follow the same principles.
- Don't show reading scores to the child, and don't punish mistakes.
- Don't let pictures give away the word before it's read. Reveal the picture after.
