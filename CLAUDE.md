# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Reporter is an NPM package that auto-installs a session tracking wrapper for Claude Code CLI. When users run `npx @lexnguyen/claude-reporter-setup`, it creates a Python wrapper that intercepts all `claude` commands, tracks sessions in SQLite, and reports them to configurable destinations (Google Drive, webhooks, or local storage).

## Commands

```bash
# Install dependencies
npm install

# Run tests
npm test
node test.js

# Local testing (link package globally)
npm link
claude-reporter-setup

# Publish to NPM
npm login
npm publish --access public
```

## Architecture

### Installation Flow
1. `npx @lexnguyen/claude-reporter-setup` → `bin/setup.js`
2. Creates `~/.claude-reporter/` with Python wrapper, config, and SQLite DB
3. Adds shell alias: `alias claude='python3 ~/.claude-reporter/claude-reporter.py'`
4. User's subsequent `claude` commands are intercepted by the Python wrapper

### Key Components

**`bin/setup.js`** - Main entry point (Node.js)
- Interactive setup wizard using inquirer
- Checks prerequisites with auto-install support:
  - **Python 3**: macOS (Homebrew), Linux (apt/dnf/yum/pacman), Windows (instructions)
  - **pip**: auto-install via `python3 -m ensurepip`
  - **Claude CLI**: offers `npm install -g @anthropic-ai/claude-code`
- Installs Python dependencies (requests, psutil, google-api-python-client)
- Writes the embedded Python wrapper script to `~/.claude-reporter/claude-reporter.py`
- Configures storage backend and shell alias
- Creates helper scripts (switch-storage.sh, uninstall.sh, etc.)

**Embedded Python Script** (in `bin/setup.js:370-836`)
- `ClaudeReporter` class wraps Claude CLI execution
- Tracks sessions in SQLite (`~/.claude-reporter/sessions.db`)
- Handles signals (SIGINT, SIGTERM) for interrupted sessions
- Reports to configured endpoints (Google Drive, HTTP webhook, Discord)

### Storage Backends
- **Google Drive**: OAuth2 flow, uploads JSON reports to specified folder
- **Webhook/HTTP**: POST JSON to any endpoint
- **Local**: Saves to `~/.claude-reporter/reports/`
- **Discord**: Optional notifications via webhook

### Session Tracking
- Each session gets a UUID
- Stores: session_id, started_at, ended_at, status, working_dir, command, exit_code
- Status values: `completed`, `interrupted`, `error`

### Special Commands (via Python wrapper)
- `claude --config` - Show current configuration
- `claude --view` - List 20 recent sessions
- `claude --stats` - Show statistics by status
- `claude --serve [port]` - Start web dashboard on localhost (default port 8765)

### Web Dashboard Features
- Stats overview (total, completed, errors, interrupted)
- Session list with status indicators
- Session detail page with full conversation log
- Auto-refresh every 10 seconds
- Dark theme UI

### Log Processing
- Uses Unix `script` command for reliable terminal capture
- `clean_log()` function strips ANSI escape codes, control characters, and script artifacts
- Logs are human-readable in dashboard and API responses

## Runtime Files Created

```
~/.claude-reporter/
├── config.json           # User configuration (storage_type, endpoints)
├── sessions.db           # SQLite database
├── claude-reporter.py    # Python wrapper script
├── reports/              # JSON session reports
├── logs/                 # Session stdout logs
├── view-reports.sh       # List recent reports
├── update-webhook.sh     # Update webhook URL
├── switch-storage.sh     # Switch between storage backends
└── uninstall.sh          # Remove claude-reporter completely
```

## Dependencies

**Node.js** (for setup wizard):
- chalk - Terminal colors
- inquirer - Interactive prompts
- ora - Spinners
- node-fetch - HTTP requests

**Python** (installed at runtime):
- requests, psutil, google-auth, google-auth-oauthlib, google-api-python-client
