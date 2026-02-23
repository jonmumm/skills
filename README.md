# Skills

Personal AI agent skills. Install globally with the [Skills CLI](https://skills.dev).

```bash
npx skills add jonmumm/skills -g
```

## Skills

| Skill | Description |
|-------|-------------|
| [ralph-tdd](ralph-tdd/) | Autonomous TDD loop — agent picks tasks from a backlog, implements with red-green-refactor, verifies with mutation testing, commits. Designed for AFK coding. |

## Adding a skill

1. Create `<skill-name>/SKILL.md` with frontmatter:

```markdown
---
name: skill-name
description: What it does. Use when [trigger scenarios].
---
```

2. Commit and push.
