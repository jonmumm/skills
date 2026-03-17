---
name: mcp-setup
description: >
  Configure and troubleshoot MCP servers in Claude Code. Quick reference for installing,
  verifying, and debugging MCP connections (Slack, Sentry, PostHog, Figma, Frame0,
  Playwright, Neon, Linear, qmd). Use when asked to "set up MCP", "add MCP", "connect to",
  "why isn't MCP working", "/mcp", or when an MCP tool call fails.
---

# MCP Setup

## Quick Setup Commands

> These are example commands — verify latest package names before running.

| Server | Install Command | Scope | Key Env Vars |
|--------|----------------|-------|-------------|
| Slack | `claude mcp add slack -s user -e "SLACK_BOT_TOKEN=..." -- npx -y @modelcontextprotocol/server-slack` | user | SLACK_BOT_TOKEN |
| Sentry | `claude mcp add sentry -s user -- npx -y @sentry/mcp-server` | project | SENTRY_AUTH_TOKEN |
| PostHog | `claude mcp add posthog -s user -- npx -y @posthog/mcp-server` | project | POSTHOG_API_KEY |
| Figma | `claude mcp add figma -s user -- npx -y @anthropic/figma-mcp-server` | user | FIGMA_ACCESS_TOKEN |
| Frame0 | `claude mcp add frame0 -- npx -y frame0-mcp-server` | user | (none) |
| Playwright | `claude mcp add playwright -s user -- npx -y @anthropic/playwright-mcp-server` | user | (none) |
| Neon | `claude mcp add neon -s user -e "NEON_API_KEY=..." -- npx -y @neondatabase/mcp-server-neon` | user | NEON_API_KEY |
| Linear | Use Linear CLI skill instead (`lin`) | - | LINEAR_API_KEY |
| qmd | Already configured in user settings | user | (none) |

## Scope Guide

- **`-s user`**: Available across all projects (Slack, Figma, Frame0). Config lives in `~/.claude/settings.json`.
- **`-s project`** (or default): Only in current project (Sentry with project-specific token). Config lives in `.claude/settings.json` in repo root.

## Verification

```bash
# List configured MCPs
claude mcp list

# In Claude Code, use /mcp to see status
```

If an MCP shows as configured but tools aren't available:

1. Check if the npx package exists and is up to date.
2. Check if env vars are set correctly.
3. Restart Claude Code session (MCP servers connect at session start).
4. Check for port conflicts.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| MCP not showing in `/mcp` | Restart Claude Code session — MCPs connect at startup |
| Tool call fails with connection error | Check if the MCP process is running, verify env vars |
| MCP configured but no tools appear | Package may have changed name — reinstall with latest |
| Permission denied | Check scope — user vs project scope matters |
| Works in one project but not another | Check if it's project-scoped vs user-scoped |
| Slack MCP not finding channels | Verify bot token has correct scopes (channels:read, chat:write, etc.) |
| Sentry not finding issues | Verify auth token and project slug |

## Gotchas

- MCP servers start when Claude Code starts — adding a new one requires restarting the session.
- User-scoped MCPs are in `~/.claude/settings.json`, project-scoped in `.claude/settings.json`.
- Some MCPs need a bot/user token (Slack uses `xoxp-` for user, `xoxb-` for bot).
- Don't put MCP tokens in `.claude/settings.json` if it's committed to git — use env vars via `-e` flag.
- If you see "MCP not found" after adding, try closing and reopening Claude Code entirely.
- The Slack MCP requires specific OAuth scopes on the bot token — `channels:read`, `chat:write`, `users:read` at minimum.
