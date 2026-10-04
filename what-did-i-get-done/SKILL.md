---
name: what-did-i-get-done
description: >
  Summarize the user's own commits across ~/src repos for a time window (yesterday, this week,
  since Monday) into a short status update or morning report. Use for "what did I get done",
  "what shipped this week", "morning report", or standup-style summaries.
---

# What did I get done

Adapted from pstack's `what-did-i-get-done`, extended to every repo under `~/src`.

1. Turn the window into real dates and say them.
2. Collect non-merge commits by the user in each repo touched in that window:
   ```sh
   for d in ~/src/*/.git; do r=${d%/.git}; git -C "$r" log --no-merges --since="<from>" --until="<to>" \
     --author="$(git -C "$r" config user.email)" --format="%h %s" 2>/dev/null | sed "s|^|$(basename $r): |"; done
   ```
   Agent co-authored commits count; they ran on the user's behalf.
3. Group by repo, keep behaviour and architecture changes, drop formatting, renames and evidence
   dumps. Describe what changed, not why.
4. Output: one or two sentences, then 2–6 bullets for the big items, then the date range. Flag
   repos with unpushed commits (`git status -sb` ahead count).
