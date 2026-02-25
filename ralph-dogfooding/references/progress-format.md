# Dogfood Progress Format

Append one entry per iteration.

```markdown
- YYYY-MM-DD HH:MM (TZ): Iteration N
  - Tested: /, /login, /onboarding/setup, /onboarding/checkout, /profile-select
  - Findings: THE-123 (new), THE-101 (commented)
  - Evidence: .ralph/dogfood-artifacts/iteration-N/THE-123/failure.png
  - Risks/Blockers: [none | short note]
```

Rules:
1. Keep entries short and factual.
2. Always include issue IDs and artifact paths.
3. Include blocker notes only when action is required.
