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
   Tests: {{N new acceptance + N new unit}}. Commit: {{short sha}}.

## What needs your attention

{{List anything that requires human judgment, in priority order:}}
- {{Thing that needs attention + why}}

## What I noticed (unrelated)

{{Things observed but not in scope. Saved to NOTICED.md with details.}}
- {{Observation}}

## Test results
- Unit: {{N}} passing {{(+N new)}}
- E2E: {{N}} passing {{(+N new)}}
- Typecheck: {{clean or N errors}}
- Lint: {{clean or N warnings}}
{{If mutation testing ran:}}
- Mutation: {{score}}% {{(files tested)}}

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
