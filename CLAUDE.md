# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`claude-code-log` is a Python CLI tool that converts Claude Code transcript JSONL files into readable HTML. It has three interfaces: a CLI, an interactive TUI (Textual), and a **real-time web dashboard** (Next.js). The project also includes a shell-based hook system that streams Claude Code events to the web dashboard.

## Development Commands

```bash
# Run unit tests (fast, recommended during development)
just test

# Run specific test categories
just test-tui          # Textual TUI tests (isolated event loop)
just test-browser      # Playwright browser tests (requires Chromium)
just test-integration  # Integration tests with realistic JSONL data
just test-benchmark    # Performance benchmarks

# Run all test categories in sequence (avoids async conflicts)
just test-all

# Run all tests with coverage
just test-cov

# Update snapshot tests after intentional HTML changes
just update-snapshot

# Code quality
just format            # ruff format
just lint              # ruff check --fix
just typecheck         # pyright
just ty                # ty check
just ci                # format + test-all + lint + typecheck + ty

# Run single test file
uv run pytest test/test_markdown_rendering.py -v

# Run CLI
just cli               # uv run claude-code-log

# Performance profiling
CLAUDE_CODE_LOG_DEBUG_TIMING=1 claude-code-log path/to/file.jsonl

# Generate style guide HTML
just style-guide

# Render all test data to HTML for visual testing
just render-test-data

# Release workflow
just release-prep 0.2.5   # or: just release-prep minor
just release-push          # build, publish PyPI, push + GitHub release
```

### Web Dashboard Commands

```bash
cd web

# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Create/push database schema
npm run db:push          # push schema to PostgreSQL
npm run db:migrate       # create migration
npm run db:studio        # open Prisma Studio GUI

# Development server
npm run dev              # → http://localhost:3456

# Production
npm run build && npm start

# Install Claude Code hooks (one-time per machine)
./hooks/install.sh                          # local
./hooks/install.sh http://your-server:3456  # remote
```

## Architecture

### High-Level Systems

```
┌─────────────────────────────────────────────────────────────────────┐
│                        claude-code-log                              │
│                                                                     │
│  1. CLI / TUI (Python)         2. Web Dashboard (Next.js)           │
│  ─────────────────────         ────────────────────────────         │
│  JSONL → parser → models →     Claude Code hooks → reporter.sh →   │
│  renderer → Jinja2 → HTML      /api/events → Prisma + Socket.IO    │
│                                 → Real-time browser dashboard       │
└─────────────────────────────────────────────────────────────────────┘
```

### Part 1: Core Python Library — Data Flow

```
JSONL files → parser.py → models.py (Pydantic) → renderer.py → Jinja2 templates → HTML
                                                       ↓
                                               renderer_timings.py (optional instrumentation)
```

`converter.py` orchestrates the flow; `cli.py` is the entry point. `cache.py` stores parsed session data to speed up repeat runs.

### Part 2: Web Dashboard — Data Flow

```
Claude Code (on dev machines)
  └─ hooks (PreToolUse, PostToolUse, UserPromptSubmit, Stop, Notification)
       └─ reporter.sh (batched queue + retry + dedup)
            └─ curl POST → /api/events/batch
                 ├─ Prisma → PostgreSQL (persist)
                 └─ Socket.io → browser (real-time)
```

---

### Core Library (`claude_code_log/`)

- **`parser.py`** — Reads JSONL, yields `TranscriptEntry` objects
- **`models.py`** — Pydantic models: `TranscriptEntry` (union of User/Assistant/Summary), `UsageInfo`, `ContentItem` (union of Text/ToolUse/ToolResult/Thinking/Image)
- **`renderer.py`** — Converts parsed data to HTML strings, applies Pygments syntax highlighting, generates CSS classes used by the timeline JS (~4000 lines, largest module)
- **`converter.py`** — High-level orchestration; `convert_jsonl_to_html()` and `process_projects_hierarchy()` are the main entry points
- **`cli.py`** — Click CLI; handles path conversion from project names to `~/.claude/projects/-path-format`
- **`tui.py`** — Textual TUI; uses cache for fast loading
- **`cache.py`** — Caches parsed session data per project directory; invalidated by file modification time
- **`utils.py`** — Message filtering utilities (system message detection, session preview creation, working directory extraction)
- **`renderer_timings.py`** — Optional performance instrumentation (enabled via `CLAUDE_CODE_LOG_DEBUG_TIMING=1`)
- **`team_analytics.py`** — Admin-only report aggregating stats across team members from a shared directory (e.g. Google Drive)

### Templates (`claude_code_log/templates/`)

Main templates:
- **`transcript.html`** — Main viewer; includes inline JavaScript for message filtering and timeline
- **`index.html`** — Project directory index
- **`admin_dashboard.html`** — Admin analytics dashboard

Components (17 files in `components/`):
- **`timeline.html`** — Interactive vis-timeline; detects message types from **CSS classes generated by `renderer.py`**
- **`search.html`** / **`search_inline.html`** — Full-text search functionality
- **`session_nav.html`** — Session navigation sidebar
- **CSS files** — `global_styles.css`, `message_styles.css`, `filter_styles.css`, `timeline_styles.css`, `search_styles.css`, `session_nav_styles.css`, `pygments_styles.css`, `edit_diff_styles.css`, `project_card_styles.css`, `todo_styles.css`
- **`timezone_converter.js`** — Client-side timezone conversion

**Critical coupling**: The timeline component in `components/timeline.html` parses message types from CSS classes that `renderer.py` generates. When adding new message types or modifying CSS class names in `renderer.py`, the timeline's JS detection logic must also be updated. Use Playwright tests to verify this.

---

### Web Dashboard (`web/`)

**Stack**: Next.js 15 (App Router) + TypeScript + Prisma + PostgreSQL + Socket.IO + Redis (optional)

#### Server (`web/server.ts`)
Custom Next.js server that attaches Socket.IO for real-time WebSocket updates and starts the BullMQ event worker. Supports horizontal scaling via Redis adapter when `REDIS_URL` is set. Includes graceful shutdown (SIGTERM/SIGINT).

**Batch processing flow**: When `REDIS_URL` is set, `POST /api/events/batch` enqueues jobs via BullMQ and returns `202` immediately; the worker in `server.ts` processes them asynchronously. Without Redis, the route falls back to inline processing — no events are lost.

#### Database (`web/prisma/schema.prisma`)
PostgreSQL with 6 models:
- **`Department`** — Organization units
- **`User`** — Members with email, passwordHash, role (`member` / `dept_head`), department association, machineId for retroactive session claim
- **`Session`** — Claude Code sessions with aggregated token usage (input, output, cache creation, cache read)
- **`Event`** — Granular events with deduplication via `(sessionId, entryUuid)` unique constraint
- **`Webhook`** — Outbound webhooks configured by users; includes URL, event type filters, and signing secret
- **`WebhookDelivery`** — Delivery history for webhook invocations; tracks HTTP status, payload, and retry attempts

#### Hooks (`web/hooks/` and `web/public/hooks/`)
- **`reporter.sh`** — Main hook script (bash/macOS/Linux). Batched delivery with offline queue & retry. Captures all assistant messages by tracking last-read UUID. Events queued locally then flushed every 30s. Deduplication via `entry_uuid`. Exponential backoff on failure.
- **`reporter.ps1`** — PowerShell hook script for Windows (served at `/hooks/reporter.ps1`). Flush interval is 90s (longer than bash for better batching on Windows).
- **`reporter-replay.sh`** — Replay historical JSONL transcripts to the server
- **`install.sh`** — One-time setup per machine (macOS/Linux); configures Claude Code to call reporter.sh
- **`claude-settings.json`** — Hook configuration template

**Install endpoints:**
- `GET /api/install` — Serves bash installer script (macOS/Linux): `curl ... | bash`
- `GET /api/install/windows` — Serves PowerShell installer script (Windows): `iex (irm '...')`

#### API Routes (`web/src/app/api/`)

| Route | Description |
|-------|-------------|
| `POST /api/events` | Ingest single Claude Code hook event |
| `POST /api/events/batch` | Ingest batched events (up to 100) |
| `GET /api/sessions` | List sessions (paginated) |
| `GET /api/sessions/:id` | Session detail with all events |
| `GET /api/stats` | Aggregate stats (tokens, cost, counts) |
| `GET /api/projects` | List projects |
| `GET /api/departments` | List departments |
| `GET /api/report` | Individual usage report |
| `GET /api/report/team` | Team-wide aggregated report |
| `GET /api/report/prompt-quality` | Prompt quality scoring (vague/code-dump heuristics) |
| `POST /api/analyze` | AI-powered analysis (Gemini) |
| `GET /api/health` | Health check |
| `GET /api/admin/queue` | BullMQ queue stats, Redis health, DB latency, ingestion rate |
| `POST /api/admin/queue` | Queue actions: `retry_all`, `drain`, `pause`, `resume`, `retry`, `clean_failed` |
| `GET /api/departments` | List departments (public) |
| `POST /api/auth/register` | Register email, get UUID |
| `GET /api/auth/verify/[uuid]` | Validate UUID |
| `GET /api/auth/me` | Get current user session |
| `POST /api/auth/logout` | Logout |
| `*/api/admin/*` | Admin CRUD (users, departments, projects, reset, login) |
| `GET /api/install` | Bash installer (macOS/Linux) |
| `GET /api/install/windows` | PowerShell installer (Windows) |

#### React Components (`web/src/components/`)
- **`LiveFeed.tsx`** — Real-time event stream display
- **`SessionList.tsx`** — Session listing with filters
- **`StatsCards.tsx`** — Token/cost summary cards
- **`TokenBreakdown.tsx`** — Detailed token usage breakdown
- **`NavBar.tsx`** — Navigation bar
- **`UserBadge.tsx`** — User identification badge
- **`UserProfile.tsx`** — User profile display
- **`ErrorBanner.tsx`** — Dismissible error/warning/info banner with retry support
- **`Toast.tsx`** — Context-based toast notification system (success, error, warning, info)

#### Libraries (`web/src/lib/`)
- **`prisma.ts`** — Prisma client singleton
- **`processEvent.ts`** — Core event processing logic (upsert sessions, create events, update token aggregates)
- **`eventQueue.ts`** — BullMQ queue singleton (producer); lazy-initialized from `REDIS_URL`. Returns `null` when Redis is unavailable.
- **`eventWorker.ts`** — BullMQ worker (consumer); started once in `server.ts`. Processes batch jobs from the `claude-event-batch` queue.
- **`webhookEvents.ts`** — Webhook event type definitions; exports `WEBHOOK_EVENT_TYPES` constant and `isValidWebhookEventType()` validator
- **`adminAuth.ts`** — Admin authentication
- **`rateLimiter.ts`** — API rate limiting
- **`reportUtils.ts`** — Report generation utilities
- **`socket.ts`** — Socket.IO client helper
- **`userAuth.ts`** — User session management (cookie-based auth with bcryptjs password hashing)
- **`useAutoRefresh.ts`** — Custom hook for auto-refreshing data

#### Pages (`web/src/app/`)
- `/` — Home page
- `/login` — Login (rate-limited: 10 attempts per 5 min per IP)
- `/sessions` — Session browser
- `/report` — Usage reports
- `/profile` — User profile with installer script download (Linux/Windows)
- `/dept` — Department view
- `/admin` — Admin dashboard
- `/unauthorized` — Unauthorized access page

---

### Standalone Templates (`templates/`)

- **`center_summary_template.html`** — Summary report template
- **`dashboard_template.html`** — Dashboard template

### Scripts (`scripts/`)

- **`generate_style_guide.py`** — Generates HTML style guide showcasing all CSS components  
- **`add_licenses_to_firestore.py`** — License management utility
- **`drive_list_folders.gs`** — Google Apps Script for Drive folder listing
- **`update_drive_urls.py`** — Updates Google Drive URLs

---

### Test Categories

Tests are split into categories to avoid async event loop conflicts between Textual, Playwright, and pytest-asyncio:

| Mark | Command | Notes |
|------|---------|-------|
| (none) | `just test` | Fast unit + snapshot tests |
| `tui` | `just test-tui` | Textual `run_test()` event loop |
| `browser` | `just test-browser` | Playwright; requires `uv run playwright install chromium` |
| `integration` | `just test-integration` | Realistic JSONL data |
| `benchmark` | `just test-benchmark` | Performance benchmarks |

Snapshot tests (`test/test_snapshot_html.py`) use syrupy to detect unintended HTML regressions. Tests run in parallel via `pytest-xdist` (`-n auto`).

### Session Summary Matching

Summaries are generated asynchronously and stored in separate JSONL entries. They are matched to sessions via `leafUuid → message UUID → sessionId` chain, not by order. This logic lives in `converter.py`.

### Output Directory

`process_projects_hierarchy()` accepts an optional `output_dir`. When set, it mirrors the project structure under that directory instead of writing alongside the JSONL files.

### Scripts (`web/scripts/`)

- **`migrate-sqlite-to-postgres.sh`** — One-shot migration script from SQLite to PostgreSQL

### Deployment

The web dashboard supports Docker deployment (`web/Dockerfile`, `web/docker-compose.yml`) with nginx reverse proxy (`web/nginx.conf`). PM2 config available in `web/ecosystem.config.js`. VPS setup script at `web/setup-vps.sh`.

**Environment variables** (set in `.env` or docker-compose):
- `DATABASE_URL` — PostgreSQL connection string
- `NEXT_PUBLIC_BASE_URL` — Public URL (used in installer scripts and hook downloads)
- `ADMIN_PASSWORD` — Admin dashboard password
- `GEMINI_API_KEY` — For AI-powered analysis (`/api/analyze`)
- `REDIS_URL` — Optional; enables Socket.IO horizontal scaling via Redis adapter
- `ALLOWED_ORIGINS` — CORS allowed origins (configured in `server.ts`)
