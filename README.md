# Personal skills suite

A single repo of custom AI agent skills. Install once on any machine and get the whole set.

**GitHub:** [jonmumm/personal-skills](https://github.com/jonmumm/personal-skills) (create the repo with the same name to match these instructions)

## Install on a new machine

With the [Skills CLI](https://skills.sh):

```bash
npx skills add jonmumm/personal-skills
```

Or clone and use a local path (e.g. for Cursor or other agents that support a skills directory):

```bash
git clone https://github.com/jonmumm/personal-skills.git ~/personal-skills
# Then point your agent at ~/personal-skills (or add via CLI if it supports local paths)
```

## Skills in this suite

| Skill | Description |
|-------|-------------|
| example-skill | Template/placeholder — replace or remove when you add real skills |

## Adding a new skill

1. Create a directory: `<skill-name>/` (use lowercase, hyphens) at the repo root.
2. Add `SKILL.md` with YAML frontmatter and instructions:

```markdown
---
name: your-skill-name
description: What it does. Use when [trigger scenarios].
---

# Your Skill Name

## Instructions
...
```

3. Commit and push. Pull on other machines to get the new skill.

## Repo structure

```
.
├── README.md           # this file
├── skill-one/          # one folder per skill
│   └── SKILL.md
├── skill-two/
│   └── SKILL.md
└── ...
```
