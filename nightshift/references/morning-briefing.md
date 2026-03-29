# Morning Briefing Template

Write `.nightshift/MORNING.md` at the end of each run. This is the FIRST thing
the human reads. Optimize for a 2-minute skim over coffee.

## Template

```markdown
# Morning Briefing — {{DATE}}

## Duration
Started: {{START_TIME}} · Ended: {{END_TIME}} · Tasks completed: {{N}}

## What was done

{{For each completed task, in order:}}
{{N}}. **{{BUG or SPEC}}: {{Title}}** — {{One sentence what was done}}.
   Tests: {{N integration + N unit + N E2E}}. Commits: {{short shas}}.

## Eval results

- Static: {{clean or N errors}}
- Integration: {{N}} passing {{(+N new)}}
- Unit: {{N}} passing {{(+N new)}}
- E2E: {{N}} passing {{(+N new)}}
{{If LLM judges ran:}}
- LLM judges: {{all PASS or list failures}}
{{If codex review ran:}}
- Codex review: {{N findings addressed, N false positives}}
{{If mutation testing ran:}}
- Mutation: {{score}}% {{(files tested)}}

## Eval gaps (improve for next run)

{{Gaps found by codex review or judges that existing evals didn't catch.
Each entry recommends whether to add a hook, test, or judge.}}
- {{Gap description}} — recommended: {{hook|test|judge}}

## What needs your attention

{{List anything that requires human judgment, in priority order:}}
- {{Thing that needs attention + why}}

## What I noticed (unrelated)

{{Things observed but not in scope. Saved to NOTICED.md with details.}}
- {{Observation}}

## Test results

- Static: {{clean or N errors}}
- Integration: {{N}} passing {{(+N new)}}
- Unit: {{N}} passing {{(+N new)}}
- E2E: {{N}} passing {{(+N new)}}
- Typecheck: {{clean or N errors}}
- Lint: {{clean or N warnings}}

## Review this

{{Git command to review all commits from this run:}}
```
git log --oneline {{FIRST_SHA}}..HEAD
```

To review each commit:
```
git show {{SHA1}}  # {{title}}
git show {{SHA2}}  # {{title}}
...
```
```

## Writing Guidelines

1. **Lead with what matters.** Summary first, details in commits.
2. **Be honest about gaps.** If something needs human attention, say so clearly.
3. **Don't pad.** If only 1 task was completed, that's fine. Don't inflate.
4. **Noticed items are gold.** These help the human discover issues they didn't
   know existed. Be specific: "checkout page has broken image on mobile viewport"
   not "noticed some UI issues."
5. **Include the git commands.** The human will review commit by commit.
   Make it easy to start.
6. **Eval gaps are actionable.** Each gap should say what to add (hook, test,
   or judge) so the human can improve the eval surface for the next run.
7. **Progressive commits mean multiple SHAs per task.** List them all so the
   human can review the implementation progression, not just the final state.
