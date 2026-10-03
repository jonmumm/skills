# Fix-pass owner prompt

One agent per coupled surface per pass. Fill in the brackets; keep the critic's shot names and
acceptance tests verbatim.

```text
You own [surface] for this pass of the design hill-climb on [product] ([repo]/design).
Owned files: [globs]. Off-limits: [globs] (other owners are editing them right now; if you need
a change there, put it in your final report).

Fixes, in order (from round [NN]'s merged critique; product fixes before polish):
1. [fix] — accept when: [shot names + observable test]
2. …

Rules:
- After each step: `pnpm shoot --only [scenario prefix]`, then LOOK at the changed shots with the
  Read tool. If it doesn't read on screen, it isn't done.
- Commit after each step (specific paths; message "pass [NN] [surface]: step k — …").
- Typecheck green. No `any`, no `as`. Never edit a check threshold without writing old → new and
  why in your report.
- Don't add scenarios to make a screen look covered; add the real state.
- Budget: [N steps / ~H hours]. Stop at the budget even if unfinished.

Final report (≤ 300 words): per step what changed and its best shot; thresholds moved
(old → new); what wasn't achieved and why; anything another owner must do.
```
