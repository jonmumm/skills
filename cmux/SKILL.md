---
name: cmux
description: >
  Manage cmux terminal workspaces for parallel AI agent sessions. Create, switch, monitor,
  and communicate between named workspaces. Use when running multiple Claude Code agents,
  when /swarm or /nightshift need terminal-level orchestration, or when the user mentions
  "cmux", "workspaces", "parallel agents", or "orchestrator".
---

# cmux

cmux is a native macOS terminal (Ghostty-based) with vertical tabs, notifications, and a scriptable CLI/socket API for managing multiple AI coding agent sessions in parallel. You use it to create isolated workspaces, monitor agent progress, send commands between workspaces, and build orchestration workflows.

## When to use this skill

- Running multiple Claude Code agents in parallel (beyond git worktrees)
- `/swarm` or `/nightshift` needs terminal-level workspace management
- User wants to spawn, monitor, or communicate between agent sessions
- Setting up an orchestrator agent that controls other agents
- Configuring notifications for agent completion/attention events

## Hierarchy

```
Window (macOS window)
  └─ Workspace (sidebar entry, like a named "tab")
       └─ Pane (split region — Cmd+D right, Cmd+Shift+D down)
            └─ Surface (terminal or browser session within a pane)
```

## Installation

```bash
brew tap manaflow-ai/cmux && brew install --cask cmux
```

CLI symlink (for access outside cmux terminals):

```bash
sudo ln -sf "/Applications/cmux.app/Contents/Resources/bin/cmux" /usr/local/bin/cmux
```

## Core CLI commands

### Workspace management

```bash
cmux list-workspaces                     # List all open workspaces (IDs, names, metadata)
cmux new-workspace                       # Create a new workspace
cmux select-workspace <ID>               # Switch to workspace by ID
cmux current-workspace                   # Get the active workspace
cmux close-workspace                     # Close current workspace
cmux rename-workspace <NAME>             # Rename current workspace
```

### Surfaces and splits

```bash
cmux new-split right                     # Split pane right (also: left, up, down)
cmux new-split down                      # Split pane down
cmux list-surfaces                       # List all surfaces in current workspace
cmux focus-surface <ID>                  # Focus a specific surface by ID
cmux close-surface                       # Close current surface
```

### Sending input to terminals

```bash
cmux send "your text here"               # Send text to focused terminal
cmux send-surface <ID> "text"            # Send text to a specific surface
cmux send-key enter                      # Send a key (enter, tab, escape, backspace, etc.)
cmux send-key-panel <ID> enter           # Send key to specific panel
```

### Reading terminal output

```bash
cmux read-screen                         # Read current terminal screen content
cmux read-screen --workspace <ID>        # Read screen of a specific workspace
```

### Notifications

```bash
cmux notify --title "Done" --body "Build complete"   # Send notification
cmux list-notifications                               # List all notifications
cmux clear-notifications                              # Clear all notifications
```

### Sidebar metadata (status pills, progress bars, logs)

```bash
cmux set-status <KEY> <VALUE>            # Set a status pill on the sidebar tab
cmux clear-status <KEY>                  # Remove a status entry
cmux list-status                         # List all status entries
cmux set-progress 0.75                   # Set progress bar (0.0–1.0)
cmux clear-progress                      # Clear progress bar
cmux log info "Starting build..."        # Append log (levels: info, progress, success, warning, error)
cmux log success "All tests passed"
cmux log error "Build failed"
```

### Browser automation

```bash
cmux browser goto <URL>                  # Navigate embedded browser
cmux browser back                        # Browser back
cmux browser forward                     # Browser forward
cmux browser reload                      # Reload page
cmux browser click <SELECTOR>            # Click element
cmux browser fill <SELECTOR> <TEXT>      # Fill form field
cmux browser get-text <SELECTOR>         # Get element text
cmux browser wait-for <SELECTOR>         # Wait for element to appear
cmux browser snapshot                    # Get accessibility tree
cmux browser screenshot                  # Capture page screenshot
cmux browser eval <JAVASCRIPT>           # Execute JS in browser
```

### Windows

```bash
cmux list-windows                        # List all windows
cmux new-window                          # Create new window
cmux focus-window <ID>                   # Focus window
cmux close-window                        # Close window
cmux move-workspace-to-window <WID>      # Move workspace to another window
```

## Environment variables

cmux auto-sets these in every terminal it spawns:

| Variable | Description |
|----------|-------------|
| `CMUX_WORKSPACE_ID` | Current workspace ID |
| `CMUX_SURFACE_ID` | Current surface ID |
| `CMUX_SOCKET_PATH` | Path to the Unix socket |

You can use these to identify which workspace you're in programmatically.

## Socket API (v2 JSON protocol)

For programmatic access beyond the CLI, cmux exposes a Unix socket with a JSON protocol:

```bash
# Request (one JSON object per line)
echo '{"method":"workspace.list"}' | socat - UNIX-CONNECT:~/.cmux/socket

# Response
{"ok":true,"result":{...}}
```

Key v2 methods:

| Method | Description |
|--------|-------------|
| `workspace.list` | List all workspaces |
| `workspace.create` | Create workspace |
| `workspace.select` | Switch to workspace |
| `workspace.current` | Get active workspace |
| `surface.list` | List surfaces |
| `surface.split` | Create split |
| `surface.send_text` | Send text to surface |
| `surface.send_key` | Send keystroke |
| `notification.create` | Send notification |
| `browser.open_split` | Open browser in split |
| `browser.navigate` | Navigate browser |

Socket access mode is configurable: `off`, `cmuxOnly` (default), `allowAll`.

## Orchestrator pattern

One Claude Code agent acts as the orchestrator — it creates workspaces, spawns agents, monitors progress, and relays results.

### Spawning a worker agent

```bash
# Create a named workspace
cmux new-workspace
cmux rename-workspace "feature-auth"

# Send a command to start Claude Code in that workspace
cmux send "claude --prompt 'Implement the auth middleware per the spec in docs/auth.md'"
cmux send-key enter
```

### Monitoring a worker

```bash
# Read what's on the worker's screen without interrupting it
cmux read-screen --workspace <WORKSPACE_ID>
```

### Sending instructions to a worker

```bash
# Send a follow-up instruction
cmux send-surface <SURFACE_ID> "now add integration tests for the auth routes"
cmux send-key-panel <PANEL_ID> enter
```

### Checking all workspace statuses

```bash
cmux list-workspaces    # See all workspace names and IDs
# Then read-screen on each to check progress
```

### Progress tracking via sidebar

Worker agents can update their sidebar status:

```bash
# From inside a worker workspace
cmux set-status phase "testing"
cmux set-progress 0.5
cmux log progress "Running integration tests (3/6 passing)"
```

The orchestrator (and the human) can see this in the sidebar without switching workspaces.

## Integration with /swarm

Instead of (or alongside) git worktrees, `/swarm` can use cmux workspaces:

1. **Orchestrator workspace**: Runs the swarm coordinator
2. **Feature workspace**: Runs the Feature agent (`claude --prompt "..."`)
3. **CRAP workspace**: Runs the CRAP agent
4. **Mutation workspace**: Runs the Mutation agent
5. **Acceptance workspace**: Runs the Acceptance agent

Benefits over pure worktrees:
- Visual: sidebar shows which agent is active, waiting, or done
- Progress: each agent can `cmux set-progress` and `cmux log` its status
- Notifications: agents send `cmux notify` when they need review
- Cross-agent comms: orchestrator can `read-screen` and `send` to coordinate

## Integration with /nightshift

Nightshift can use cmux to:
1. Spawn a workspace per task from the backlog
2. Monitor progress via `read-screen` between tasks
3. Use `cmux notify` for the morning briefing
4. Set sidebar status to show task completion state

## Notification hooks for Claude Code

Wire Claude Code's hooks to cmux notifications:

```json
// .claude/settings.json
{
  "hooks": {
    "notification": [
      {
        "command": "cmux notify --title \"$CLAUDE_NOTIFICATION_TITLE\" --body \"$CLAUDE_NOTIFICATION_BODY\""
      }
    ]
  }
}
```

Or use OSC sequences directly from within a terminal:

```bash
printf '\033]777;notify;Build Complete;All tests passing\033\\'
```

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| Cmd+N | New workspace |
| Cmd+1–8 | Jump to workspace |
| Cmd+Shift+W | Close workspace |
| Cmd+Shift+R | Rename workspace |
| Cmd+D | Split right |
| Cmd+Shift+D | Split down |
| Cmd+T | New surface (tab in pane) |
| Cmd+B | Toggle sidebar |
| Cmd+Shift+U | Jump to latest unread notification |
| Cmd+I | Notification panel |
| Opt+Cmd+Arrows | Focus pane directionally |
| Cmd+Shift+L | Open browser in split |

## Requirements

- macOS 14.0+
- Reads your existing `~/.config/ghostty/config` for themes, fonts, colors
