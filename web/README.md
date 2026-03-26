# Claude Reporter Web

Real-time dashboard for monitoring Claude Code sessions across your team.

## Stack

- **Next.js 15** (App Router) + TypeScript
- **Prisma** + SQLite (zero-config local DB)
- **Socket.io** for real-time WebSocket updates
- **Custom server** (`server.ts`) to combine Next.js + Socket.io

## Quick Start

```bash
cd web

# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env

# 3. Create database
npm run db:push

# 4. Start server (dev)
npm run dev
# → http://localhost:3456

# 5. Install Claude Code hooks (one-time per machine)
./hooks/install.sh
# For remote server: ./hooks/install.sh http://your-server:3456
```

## How It Works

```
Claude Code
  └─ hooks (PreToolUse, PostToolUse, UserPromptSubmit, Stop, Notification)
       └─ curl POST → /api/events
            ├─ Prisma → SQLite (persist)
            └─ Socket.io → browser (real-time)
```

Each Claude Code hook fires a shell command that pipes the event JSON to the `/api/events` endpoint via stdin:

```bash
curl -s -X POST http://localhost:3456/api/events \
  -H 'Content-Type: application/json' \
  -d @-   # reads hook payload from stdin
```

## Token Tracking Note

Claude Code hook payloads do **not** include token usage directly. Token counts shown on the dashboard come from the `usage` field in `PostToolUse` events when available. For complete token history, use the existing `claude-code-log` CLI which reads JSONL transcripts directly.

## Multi-Machine Setup

1. Run the web server on a shared host (VPS or NAS)
2. On each developer machine, install hooks pointing to the server:
   ```bash
   ./hooks/install.sh http://shared-server:3456
   ```
3. Set `MACHINE_ID` in each machine's environment so you can distinguish whose activity is whose

## Production

```bash
# Build Next.js
npm run build

# Start production server
npm start   # NODE_ENV=production tsx server.ts
```

Use a process manager (PM2, systemd) and a reverse proxy (nginx/Caddy) for HTTPS.

## API Reference

Full API documentation: **[docs/api.md](./docs/api.md)**

Webhook integration guide: **[docs/webhooks.md](./docs/webhooks.md)**

Quick overview:

| Group | Endpoints |
|---|---|
| **Ingest** | `POST /api/events`, `POST /api/events/batch` |
| **Sessions** | `GET /api/sessions`, `GET /api/sessions/:id` |
| **Stats** | `GET /api/stats`, `GET /api/report`, `GET /api/report/team` |
| **Auth** | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| **User Webhooks** | `GET/POST /api/webhooks`, `GET/PUT/DELETE /api/webhooks/:id` |
| **Admin** | `/api/admin/users`, `/api/admin/departments`, `/api/admin/webhooks` |
| **System** | `GET /api/admin/queue`, `GET /api/health` |

## Socket.io Events

| Event | Payload | Description |
|-------|---------|-------------|
| `event` | `{ sessionId, event }` | New event recorded |
| `session_started` | `{ sessionId }` | New session detected |
| `session_updated` | `{ sessionId }` | Session tokens updated |
