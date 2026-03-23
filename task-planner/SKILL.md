---
name: task-planner
description: >
  Pull all Jira tickets assigned to me that aren't done and help create
  copy-pasteable prompts to kick them off in other Claude Code sessions.
  Use when asked to "plan my tasks", "what should I work on", "task planner",
  "generate prompts for my tickets", or "kick off my Jira tickets".
---

# Task Planner

Fetch the user's open Jira tickets and generate ready-to-paste Claude Code prompts for each one.

## Step 1: Fetch Open Tickets

Use the `mcp__mcp-atlassian__jira_search` tool to find all tickets assigned to the current user that are not done:

```
JQL: assignee = currentUser() AND status != Done ORDER BY priority DESC, updated DESC
fields: summary,status,description,priority,issuetype,labels,project,parent
limit: 50
```

If the search returns many results, paginate to get them all.

## Step 2: Present the Ticket Overview

Show a summary table of all tickets so the user can see their full backlog at a glance:

| Key | Type | Priority | Status | Summary |
|-----|------|----------|--------|---------|
| PROJ-123 | Story | High | In Progress | ... |

Group tickets by status (In Progress first, then To Do / Backlog / etc).

## Step 3: Let the User Pick Tickets

Ask the user which tickets they want to generate prompts for. Options:
- **All** — generate prompts for every ticket
- **By status** — e.g., "just the In Progress ones"
- **By selection** — e.g., "PROJ-123 and PROJ-456"

## Step 4: Fetch Full Details for Selected Tickets

For each selected ticket, use `mcp__mcp-atlassian__jira_get_issue` to get the full issue details including:
- Full description
- Acceptance criteria (often in description or a custom field)
- Comments (may contain implementation notes)
- Epic/parent context
- Labels

## Step 5: Generate Copy-Paste Prompts

For each selected ticket, generate a self-contained prompt block inside a fenced code block that the user can copy and paste into a fresh Claude Code session. The prompt should follow this template:

~~~
```
[TICKET-KEY] Summary of the ticket

## Context
Brief description of what this ticket is about, drawn from the Jira description.

## Acceptance Criteria
- Criteria extracted from the ticket description or comments
- If none exist, note that the user should define them

## Requirements
Detailed requirements from the ticket description, reformatted for clarity.

## Instructions
1. Read the project's CLAUDE.md to understand conventions and structure
2. Explore the relevant codebase area before making changes
3. Implement the changes described above
4. Run the project's feedback commands (typecheck, lint, test) before committing
5. Create a commit with message format: [TICKET-KEY] type: description

## Jira
Ticket: TICKET-KEY
Link: https://forhims.atlassian.net/browse/TICKET-KEY
```
~~~

### Prompt Generation Rules

- **Extract structure from chaos**: Jira descriptions are often messy. Parse them into clean sections (Context, Acceptance Criteria, Requirements).
- **Include parent/epic context**: If the ticket has a parent epic, mention it so the agent understands the bigger picture.
- **Preserve technical details**: Don't lose specific technical requirements, API contracts, file paths, or implementation hints from the description or comments.
- **Add the Jira link**: Always include the browseable link so the agent can reference it.
- **Keep it self-contained**: The prompt should work in a fresh session with no prior context.
- **Don't over-prescribe implementation**: Give the "what" not the "how" — let the agent figure out the best approach.
- **Flag ambiguity**: If the ticket description is vague or missing acceptance criteria, call it out in the prompt so the agent knows to ask questions or use /grill-me before diving in.

## Step 6: Offer Batch Output

After generating prompts, offer to:
- **Print all prompts** sequentially so the user can copy them one by one
- **Write to files** — save each prompt to a file like `~/prompts/TICKET-KEY.md` for easy access later

## Gotchas

- Some tickets may have empty descriptions — flag these and suggest the user flesh them out before kicking off work.
- Subtasks should reference their parent ticket for context.
- If a ticket is "In Progress", note that work may already be started — the prompt should mention checking for existing branches.
- Respect the user's PR conventions from their CLAUDE.md (e.g., PR title format, Jira link in PR body).
