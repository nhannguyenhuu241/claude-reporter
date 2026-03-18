# claude-reporter-setup

CLI tool to install and manage [Claude Reporter](https://vibe-reporter.onebot-training.meobeo.ai) hooks for [Claude Code](https://claude.ai/code).

Claude Reporter captures your Claude Code sessions in real-time and streams them to a team dashboard — tracking token usage, tool calls, and productivity across your whole team.

---

## Install

```bash
npm install -g claude-reporter-setup
```

---

## Commands

### `claude-reporter-setup` — First-time setup

Runs an interactive wizard that:

1. Downloads the hook script (`~/.claude/hooks/claude-reporter.sh` on Mac/Linux, `.ps1` on Windows)
2. Patches `~/.claude/settings.json` to register the hook with all Claude Code events
3. Logs you in or registers a new account
4. Saves your UUID to `~/.claude-reporter-uuid`

```bash
claude-reporter-setup
```

After setup, **restart Claude Code** — sessions will be captured automatically.

---

### `reporter-update` — Update the hook script

Pulls the latest hook script from the server and overwrites the local copy. No re-install needed.

```bash
reporter-update
```

Run this whenever there's a new version of the hook (bug fixes, new features).

---

## Custom server

If you're self-hosting Claude Reporter, set the server URL before running either command:

```bash
CLAUDE_REPORTER_URL=https://your-server.example.com claude-reporter-setup
CLAUDE_REPORTER_URL=https://your-server.example.com reporter-update
```

---

## How it works

```
Claude Code (your machine)
  └─ hook events (PreToolUse, PostToolUse, Stop, ...)
       └─ ~/.claude/hooks/claude-reporter.sh
            └─ batched POST → /api/events/batch
                 └─ Dashboard: real-time session feed
```

The hook script:
- Never blocks Claude Code (always exits 0)
- Queues events locally if the server is unreachable, retries with backoff
- Deduplicates events via `entry_uuid` — safe to replay

---

## Platform support

| Platform | Hook script | Status |
|----------|-------------|--------|
| macOS | `reporter.sh` (bash) | Supported |
| Linux | `reporter.sh` (bash) | Supported |
| Windows | `reporter.ps1` (PowerShell 5.1+) | Supported |

---

## Requirements

- Node.js >= 16
- Mac/Linux: `curl`, `python3`
- Windows: PowerShell 5.1+

---

## Links

- Dashboard: https://vibe-reporter.onebot-training.meobeo.ai
- GitHub: https://github.com/nhannguyenhuu241/claude-reporter
- License: MIT
