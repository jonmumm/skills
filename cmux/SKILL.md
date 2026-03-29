---
name: cmux
description: >
  Manage cmux terminal workspaces and browser surfaces for parallel AI agent sessions. Create,
  switch, monitor, and communicate between named workspaces. Automate embedded browsers with
  navigation, DOM interaction, inspection, console/error capture, and session state management.
  Use when running multiple Claude Code agents, when /swarm or /nightshift need terminal-level
  orchestration, when automating browser testing via cmux surfaces, or when the user mentions
  "cmux", "workspaces", "parallel agents", "orchestrator", or "cmux browser".
---

# cmux

cmux is a native macOS terminal (Ghostty-based) with vertical tabs, notifications, and a scriptable CLI/socket API for managing multiple AI coding agent sessions in parallel. You use it to create isolated workspaces, monitor agent progress, send commands between workspaces, and build orchestration workflows.

## When to use this skill

- Running multiple Claude Code agents in parallel (beyond git worktrees)
- `/swarm` or `/nightshift` needs terminal-level workspace management
- User wants to spawn, monitor, or communicate between agent sessions
- Setting up an orchestrator agent that controls other agents
- Configuring notifications for agent completion/attention events
- Automating browser interactions via cmux browser surfaces (navigation, forms, console, network, screenshots)
- Dogfooding or QA testing web apps using cmux's built-in browser

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
# Status pills
cmux set-status <KEY> <VALUE>                              # Set a status pill
cmux set-status build "compiling" --icon hammer --color "#ff9500"
cmux set-status deploy "v1.2.3" --workspace workspace:2    # Target specific workspace
cmux clear-status <KEY>                                    # Remove a status entry
cmux list-status                                           # List all status entries

# Progress bar
cmux set-progress 0.75 --label "Building..."               # Set progress bar (0.0–1.0)
cmux clear-progress                                        # Clear progress bar

# Logs
cmux log "Build started"                                   # Default info level
cmux log --level error --source build "Compilation failed" # With level and source
cmux log --level success -- "All 42 tests passed"
cmux clear-log                                             # Clear all log entries
cmux list-log                                              # List log entries
cmux list-log --limit 5                                    # Limit entries

# Full sidebar dump
cmux sidebar-state                                         # Dump all metadata (cwd, git, ports, status, progress, logs)
cmux sidebar-state --workspace workspace:2
```

### Browser automation

The `cmux browser` command group provides browser automation against cmux browser surfaces. Use it to navigate, interact with DOM elements, inspect page state, evaluate JavaScript, and manage browser session data.

Most subcommands require a target surface. Pass it positionally or with `--surface`.

#### Targeting a browser surface

```bash
cmux browser open https://example.com              # Open a new browser split
cmux browser open-split https://example.com         # Open browser in a new split
cmux browser identify                               # Discover focused IDs and browser metadata
cmux browser identify --surface surface:2           # Identify a specific surface

# Positional vs flag targeting are equivalent
cmux browser surface:2 url
cmux browser --surface surface:2 url
```

#### Navigation

```bash
cmux browser surface:2 navigate <URL> --snapshot-after   # Navigate to URL
cmux browser surface:2 back                              # Browser back
cmux browser surface:2 forward                           # Browser forward
cmux browser surface:2 reload --snapshot-after           # Reload page
cmux browser surface:2 url                               # Get current URL
cmux browser surface:2 focus-webview                     # Focus the webview
cmux browser surface:2 is-webview-focused                # Check if webview is focused
```

#### Waiting

Block until selectors, text, URL fragments, load state, or a JavaScript condition is satisfied.

```bash
cmux browser surface:2 wait --load-state complete --timeout-ms 15000
cmux browser surface:2 wait --selector "#checkout" --timeout-ms 10000
cmux browser surface:2 wait --text "Order confirmed"
cmux browser surface:2 wait --url-contains "/dashboard"
cmux browser surface:2 wait --function "window.__appReady === true"
```

#### DOM interaction

Mutating actions support `--snapshot-after` for fast verification.

```bash
cmux browser surface:2 click "button[type='submit']" --snapshot-after
cmux browser surface:2 dblclick ".item-row"
cmux browser surface:2 hover "#menu"
cmux browser surface:2 focus "#email"
cmux browser surface:2 check "#terms"
cmux browser surface:2 uncheck "#newsletter"
cmux browser surface:2 scroll-into-view "#pricing"

cmux browser surface:2 type "#search" "cmux"             # Type text (keystrokes)
cmux browser surface:2 fill "#email" --text "a@b.com"    # Fill form field
cmux browser surface:2 fill "#email" --text ""           # Clear form field
cmux browser surface:2 press Enter
cmux browser surface:2 keydown Shift
cmux browser surface:2 keyup Shift
cmux browser surface:2 select "#region" "us-east"
cmux browser surface:2 scroll --dy 800 --snapshot-after
cmux browser surface:2 scroll --selector "#log-view" --dx 0 --dy 400
```

#### Inspection

```bash
cmux browser surface:2 snapshot --interactive --compact          # Accessibility tree
cmux browser surface:2 snapshot --selector "main" --max-depth 5  # Scoped snapshot
cmux browser surface:2 screenshot --out /tmp/page.png            # Screenshot

# Structured getters
cmux browser surface:2 get title
cmux browser surface:2 get url
cmux browser surface:2 get text "h1"
cmux browser surface:2 get html "main"
cmux browser surface:2 get value "#email"
cmux browser surface:2 get attr "a.primary" --attr href
cmux browser surface:2 get count ".row"
cmux browser surface:2 get box "#checkout"
cmux browser surface:2 get styles "#total" --property color

# Boolean checks
cmux browser surface:2 is visible "#checkout"
cmux browser surface:2 is enabled "button[type='submit']"
cmux browser surface:2 is checked "#terms"

# Finders (by role, text, label, placeholder, alt, title, testid, position)
cmux browser surface:2 find role button --name "Continue"
cmux browser surface:2 find text "Order confirmed"
cmux browser surface:2 find label "Email"
cmux browser surface:2 find placeholder "Search"
cmux browser surface:2 find alt "Product image"
cmux browser surface:2 find title "Open settings"
cmux browser surface:2 find testid "save-btn"
cmux browser surface:2 find first ".row"
cmux browser surface:2 find last ".row"
cmux browser surface:2 find nth 2 ".row"

cmux browser surface:2 highlight "#checkout"              # Highlight element visually
```

#### JavaScript eval and injection

```bash
cmux browser surface:2 eval "document.title"
cmux browser surface:2 eval --script "window.location.href"

cmux browser surface:2 addinitscript "window.__cmuxReady = true;"  # Runs on every navigation
cmux browser surface:2 addscript "document.querySelector('#name')?.focus()"
cmux browser surface:2 addstyle "#debug-banner { display: none !important; }"
```

#### State (cookies, storage, browser state)

```bash
# Cookies
cmux browser surface:2 cookies get
cmux browser surface:2 cookies get --name session_id
cmux browser surface:2 cookies set session_id abc123 --domain example.com --path /
cmux browser surface:2 cookies clear --name session_id
cmux browser surface:2 cookies clear --all

# Local/session storage
cmux browser surface:2 storage local set theme dark
cmux browser surface:2 storage local get theme
cmux browser surface:2 storage local clear
cmux browser surface:2 storage session set flow onboarding
cmux browser surface:2 storage session get flow

# Full state save/restore
cmux browser surface:2 state save /tmp/browser-state.json
cmux browser surface:2 state load /tmp/browser-state.json
```

#### Tabs

```bash
cmux browser surface:2 tab list
cmux browser surface:2 tab new https://example.com/pricing
cmux browser surface:2 tab switch 1
cmux browser surface:2 tab switch surface:7
cmux browser surface:2 tab close
cmux browser surface:2 tab close surface:7
```

#### Console and errors

```bash
cmux browser surface:2 console list       # Read console messages
cmux browser surface:2 console clear       # Clear console
cmux browser surface:2 errors list         # Read JS errors
cmux browser surface:2 errors clear        # Clear errors
```

#### Dialogs and downloads

```bash
cmux browser surface:2 dialog accept
cmux browser surface:2 dialog accept "Confirmed by automation"
cmux browser surface:2 dialog dismiss

# Frames
cmux browser surface:2 frame "iframe[name='checkout']"    # Enter iframe
cmux browser surface:2 click "#pay-now"
cmux browser surface:2 frame main                         # Return to top-level

# Downloads
cmux browser surface:2 click "a#download-report"
cmux browser surface:2 download --path /tmp/report.csv --timeout-ms 30000
```

#### Common browser patterns

```bash
# Navigate, wait, inspect
cmux browser open https://example.com/login
cmux browser surface:2 wait --load-state complete --timeout-ms 15000
cmux browser surface:2 snapshot --interactive --compact

# Fill a form and verify
cmux browser surface:2 fill "#email" --text "ops@example.com"
cmux browser surface:2 fill "#password" --text "$PASSWORD"
cmux browser surface:2 click "button[type='submit']" --snapshot-after
cmux browser surface:2 wait --text "Welcome"

# Debug artifacts on failure
cmux browser surface:2 console list
cmux browser surface:2 errors list
cmux browser surface:2 screenshot --out /tmp/failure.png
cmux browser surface:2 snapshot --interactive --compact

# Persist and restore session
cmux browser surface:2 state save /tmp/session.json
cmux browser surface:2 state load /tmp/session.json
cmux browser surface:2 reload
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
| `CMUX_SOCKET_PATH` | Override socket path |
| `CMUX_SOCKET_ENABLE` | Force enable/disable socket (`1`/`0`, `true`/`false`, `on`/`off`) |
| `CMUX_SOCKET_MODE` | Override access mode (`cmuxOnly`, `allowAll`, `off`) |
| `TERM_PROGRAM` | Set to `ghostty` |
| `TERM` | Set to `xterm-ghostty` |

## Utility commands

```bash
cmux ping                               # Health check
cmux capabilities                       # List available socket methods
cmux capabilities --json
cmux identify                           # Show focused window/workspace/pane/surface context
cmux identify --json
```

## Socket API (v2 JSON protocol)

For programmatic access beyond the CLI, cmux exposes a Unix socket with a JSON protocol.

### Socket paths

| Build | Path |
|-------|------|
| Release | `/tmp/cmux.sock` |
| Debug | `/tmp/cmux-debug.sock` |
| Tagged debug | `/tmp/cmux-debug-<tag>.sock` |

Override with `CMUX_SOCKET_PATH`.

### Request format

Send one newline-terminated JSON request per call:

```bash
echo '{"id":"req-1","method":"workspace.list","params":{}}' | nc -U /tmp/cmux.sock
# Response: {"id":"req-1","ok":true,"result":{"workspaces":[...]}}
```

### Access modes

| Mode | Description |
|------|-------------|
| `off` | Socket disabled |
| `cmuxOnly` | Only cmux-spawned processes can connect (default) |
| `allowAll` | Any local process can connect (env override: `CMUX_SOCKET_MODE=allowAll`) |

### Key v2 methods

| Method | Description |
|--------|-------------|
| `system.ping` | Health check |
| `system.capabilities` | List available methods |
| `system.identify` | Current window/workspace/pane/surface context |
| `workspace.list` | List all workspaces |
| `workspace.create` | Create workspace |
| `workspace.select` | Switch to workspace |
| `workspace.current` | Get active workspace |
| `workspace.close` | Close workspace |
| `surface.list` | List surfaces |
| `surface.split` | Create split |
| `surface.focus` | Focus a surface |
| `surface.send_text` | Send text to surface |
| `surface.send_key` | Send keystroke |
| `notification.create` | Send notification |
| `notification.list` | List notifications |
| `notification.clear` | Clear notifications |
| `browser.open_split` | Open browser in split |
| `browser.navigate` | Navigate browser |

### CLI flags

| Flag | Description |
|------|-------------|
| `--socket PATH` | Custom socket path |
| `--json` | JSON output |
| `--window ID` | Target a specific window |
| `--workspace ID` | Target a specific workspace |
| `--surface ID` | Target a specific surface |
| `--id-format refs\|uuids\|both` | Control identifier format in JSON output |

### Detecting cmux

```bash
SOCK="${CMUX_SOCKET_PATH:-/tmp/cmux.sock}"
[ -S "$SOCK" ] && echo "Socket available"
command -v cmux &>/dev/null && echo "cmux CLI available"
[ -n "${CMUX_WORKSPACE_ID:-}" ] && [ -n "${CMUX_SURFACE_ID:-}" ] && echo "Inside cmux surface"
```

### Python client example

```python
import json, os, socket

SOCKET_PATH = os.environ.get("CMUX_SOCKET_PATH", "/tmp/cmux.sock")

def rpc(method, params=None, req_id=1):
    payload = {"id": req_id, "method": method, "params": params or {}}
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
        sock.connect(SOCKET_PATH)
        sock.sendall(json.dumps(payload).encode("utf-8") + b"\n")
        return json.loads(sock.recv(65536).decode("utf-8"))

rpc("workspace.list", req_id="ws")
rpc("notification.create", {"title": "Done", "body": "From Python!"}, req_id="notify")
```

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
