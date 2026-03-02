# Claude Code Activity Recorder -- Implementation Plan

**Date**: 2026-03-02
**Status**: Draft
**Scope**: Real-time recording layer for Claude Code sessions via hooks + Next.js dashboard

---

## 1. Architecture Decision: Direct HTTP Hooks (No MCP Server)

### Decision

Use **Claude Code HTTP hooks** directly to a **Next.js API**. No separate MCP server.

### Rationale

| Option | Pros | Cons |
|--------|------|------|
| **Direct HTTP hooks (chosen)** | Single deployment; native Claude Code feature; zero extra process; `type: "http"` hooks send JSON POST natively | Tight coupling between hooks and web app |
| MCP server as relay | Decouples hook format from storage; could serve multiple consumers | Extra process to manage; extra latency hop; MCP protocol overhead for what is fundamentally a logging task; YAGNI |
| Command hooks + curl | Works without HTTP hook support | Spawns shell per event; slower; harder to manage headers/auth |

Claude Code **HTTP hooks** (documented as `type: "http"`) send the hook JSON payload as a POST body directly. The Next.js API routes receive it, validate, store, and broadcast via WebSocket. One process, one deployment.

### High-Level Data Flow

```
Claude Code Instance(s)
    |
    | HTTP POST (hook events)
    v
Next.js API Routes (/api/events/*)
    |
    ├──> SQLite (via Prisma) -- persistent storage
    |
    └──> Socket.io Server -- real-time broadcast
              |
              v
         Dashboard UI (Next.js pages)
```

---

## 2. Hook Events to Capture

We capture 5 core lifecycle events. All others are ignored to keep noise low and storage small.

| Hook Event | What We Capture | Why |
|------------|----------------|-----|
| `SessionStart` | Session begins/resumes; `session_id`, `cwd`, `model`, `source` | Creates session record |
| `UserPromptSubmit` | User prompt text; `session_id`, `prompt` | Records user messages |
| `Stop` | Claude finishes; `session_id`, `last_assistant_message`, `stop_hook_active` | Records assistant responses + marks turn end |
| `PostToolUse` | Tool completed; `tool_name`, `tool_input`, `tool_response` | Tracks tool activity + file changes |
| `SessionEnd` | Session terminates; `session_id`, `reason` | Closes session record |

**Not captured** (to avoid noise): `PreToolUse` (redundant with PostToolUse for recording), `Notification`, `PermissionRequest`, `SubagentStart/Stop`, `ConfigChange`, `WorktreeCreate/Remove`, `PreCompact`, `TeammateIdle`, `TaskCompleted`.

These can be added later by simply adding more hook entries and API routes.

### Hook Payloads (What the API Receives)

Every hook event includes these **common fields** from Claude Code:

```json
{
  "session_id": "abc123",
  "transcript_path": "/home/user/.claude/projects/.../transcript.jsonl",
  "cwd": "/home/user/my-project",
  "permission_mode": "default",
  "hook_event_name": "SessionStart|UserPromptSubmit|Stop|PostToolUse|SessionEnd"
}
```

**SessionStart** adds: `source` ("startup"|"resume"|"clear"|"compact"), `model` (string)

**UserPromptSubmit** adds: `prompt` (string)

**Stop** adds: `last_assistant_message` (string), `stop_hook_active` (boolean)

**PostToolUse** adds: `tool_name` (string), `tool_input` (object), `tool_response` (object), `tool_use_id` (string)

**SessionEnd** adds: `reason` (string)

---

## 3. Data Models

### Prisma Schema

```prisma
// web/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")  // file:./data/recorder.db
}

model Machine {
  id        String   @id @default(cuid())
  name      String   @unique        // hostname or user-defined label
  createdAt DateTime @default(now())
  sessions  Session[]
}

model Session {
  id           String   @id               // Claude's session_id
  machineId    String?
  machine      Machine? @relation(fields: [machineId], references: [id])
  cwd          String                     // working directory
  model        String?                    // claude model used
  startSource  String?                    // "startup" | "resume" | "clear" | "compact"
  endReason    String?                    // "clear" | "logout" | "prompt_input_exit" | "other"
  status       String   @default("active") // "active" | "ended"
  startedAt    DateTime @default(now())
  endedAt      DateTime?
  updatedAt    DateTime @updatedAt

  // Aggregated token counters (updated by Stop events)
  totalInputTokens         Int @default(0)
  totalOutputTokens        Int @default(0)
  totalCacheCreationTokens Int @default(0)
  totalCacheReadTokens     Int @default(0)

  events Event[]

  @@index([machineId])
  @@index([status])
  @@index([startedAt])
}

model Event {
  id        String   @id @default(cuid())
  sessionId String
  session   Session  @relation(fields: [sessionId], references: [id])
  type      String                       // "session_start" | "user_prompt" | "assistant_stop" | "tool_use" | "session_end"
  timestamp DateTime @default(now())

  // Content fields (nullable, depends on type)
  prompt              String?            // UserPromptSubmit: user's prompt
  assistantMessage    String?            // Stop: last_assistant_message
  toolName            String?            // PostToolUse: tool_name
  toolInput           String?            // PostToolUse: JSON stringified tool_input
  toolResponse        String?            // PostToolUse: JSON stringified tool_response (truncated)
  toolUseId           String?            // PostToolUse: tool_use_id

  // Metadata
  raw                 String?            // Full raw JSON payload (for debugging, optional)

  @@index([sessionId, timestamp])
  @@index([type])
  @@index([timestamp])
}
```

### Key Design Decisions

1. **Session ID = Claude's `session_id`**: No surrogate key. Claude already provides a unique session identifier.
2. **Events are denormalized**: A single `Event` table with nullable columns per event type. Simpler than separate tables per event type, and SQLite handles NULLs efficiently.
3. **Machine concept**: Optional. Each Claude Code installation can identify itself via a `X-Machine-Id` header. Useful for multi-machine setups.
4. **Token tracking on Session**: Aggregated counters updated when we can parse them (from Stop events or JSONL parsing). Not per-event because Claude hooks do not include token usage directly -- tokens live in the JSONL transcript.
5. **tool_response truncated**: Tool responses (especially file reads) can be large. Store first 10KB max.
6. **raw field optional**: Controlled by env var `STORE_RAW_EVENTS=true`. Off by default to save space.

### Token Tracking Strategy

Claude Code hooks do **not** include token usage in their payloads. Tokens are only in the JSONL transcript file. Two approaches:

- **Approach A (Recommended)**: On `SessionEnd`, read `transcript_path` from the hook payload and parse token usage from the JSONL file server-side. This requires the Next.js server to have filesystem access to `~/.claude/projects/` (works for local/same-machine deployments).
- **Approach B**: For remote servers where JSONL files are not accessible, periodically run a companion script that parses JSONL files and POSTs aggregated token data to `POST /api/sessions/:id/tokens`.

Phase 1 skips token tracking entirely. Phase 2 implements Approach A for local deployments.

---

## 4. API Route Design

All routes are under `/api/`. The primary ingestion route is a single unified endpoint.

### Event Ingestion

```
POST /api/events
```

Receives any hook event. The `hook_event_name` field in the body determines how it is processed.

**Request body**: Raw Claude Code hook JSON payload (see Section 2).

**Headers**:
- `Content-Type: application/json` (set by Claude Code automatically)
- `Authorization: Bearer $RECORDER_API_KEY` (optional, for auth)
- `X-Machine-Id: my-macbook` (optional, for multi-machine)

**Response**: `200 OK` with empty body (hooks expect fast responses)

**Processing logic** (pseudo):
```
switch (body.hook_event_name):
  "SessionStart":
    - Upsert Session record (id=session_id, cwd, model, startSource=source)
    - Create Event(type="session_start")
    - Broadcast via Socket.io: { channel: "session:start", data: session }

  "UserPromptSubmit":
    - Ensure Session exists (upsert if not)
    - Create Event(type="user_prompt", prompt=body.prompt)
    - Broadcast: { channel: "event:new", data: event }

  "Stop":
    - Ensure Session exists
    - Create Event(type="assistant_stop", assistantMessage=body.last_assistant_message)
    - Broadcast: { channel: "event:new", data: event }

  "PostToolUse":
    - Ensure Session exists
    - Create Event(type="tool_use", toolName, toolInput, toolResponse[truncated])
    - Broadcast: { channel: "event:new", data: event }

  "SessionEnd":
    - Update Session(status="ended", endReason=body.reason, endedAt=now)
    - Create Event(type="session_end")
    - Broadcast: { channel: "session:end", data: session }
```

**Why a single endpoint?** Claude Code HTTP hooks send different payloads to potentially different URLs. But since we control the hook config, routing all events to one URL is simpler. The server switches on `hook_event_name`. If we later need per-event URLs (e.g., for different auth), we can split.

### Dashboard Query Routes

```
GET  /api/sessions                  # List sessions (paginated, filterable)
     ?status=active|ended
     &machine=my-macbook
     &limit=50&offset=0

GET  /api/sessions/:id              # Single session detail

GET  /api/sessions/:id/events       # Events for a session (paginated)
     ?type=user_prompt|assistant_stop|tool_use
     &limit=100&offset=0

GET  /api/stats                     # Aggregate statistics
     ?period=today|week|month|all
     # Returns: total sessions, events, active sessions, tool usage breakdown

GET  /api/events/live               # Socket.io endpoint (auto-handled)
```

### Optional: Token Update

```
POST /api/sessions/:id/tokens       # Update token counts for a session
     Body: { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens }
```

---

## 5. Next.js Web App File Structure

```
web/
├── package.json
├── tsconfig.json
├── next.config.ts
├── .env.example                    # DATABASE_URL, RECORDER_API_KEY, PORT
├── .env.local                      # gitignored, actual values
├── Dockerfile
├── docker-compose.yml
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout with providers
│   │   ├── page.tsx                # Dashboard home (redirect to /dashboard)
│   │   ├── globals.css
│   │   │
│   │   ├── dashboard/
│   │   │   ├── page.tsx            # Main dashboard: active sessions + stats
│   │   │   └── layout.tsx          # Dashboard layout with nav
│   │   │
│   │   ├── sessions/
│   │   │   ├── page.tsx            # Session list with filters
│   │   │   └── [id]/
│   │   │       └── page.tsx        # Session detail: event timeline
│   │   │
│   │   └── api/
│   │       ├── events/
│   │       │   └── route.ts        # POST /api/events -- main ingestion
│   │       ├── sessions/
│   │       │   ├── route.ts        # GET /api/sessions
│   │       │   └── [id]/
│   │       │       ├── route.ts    # GET /api/sessions/:id
│   │       │       ├── events/
│   │       │       │   └── route.ts # GET /api/sessions/:id/events
│   │       │       └── tokens/
│   │       │           └── route.ts # POST /api/sessions/:id/tokens
│   │       └── stats/
│   │           └── route.ts        # GET /api/stats
│   │
│   ├── lib/
│   │   ├── prisma.ts               # Prisma client singleton
│   │   ├── socket.ts               # Socket.io server setup
│   │   ├── auth.ts                 # API key validation middleware
│   │   ├── constants.ts            # Shared constants
│   │   └── utils.ts                # Helpers (truncateToolResponse, etc.)
│   │
│   ├── components/
│   │   ├── SessionCard.tsx         # Session summary card
│   │   ├── EventTimeline.tsx       # Chronological event list
│   │   ├── EventItem.tsx           # Single event display (user/assistant/tool)
│   │   ├── ActivityFeed.tsx        # Real-time event stream
│   │   ├── StatsPanel.tsx          # Token/cost/session counters
│   │   ├── StatusBadge.tsx         # Active/Ended badge
│   │   ├── ToolBadge.tsx           # Tool name pill
│   │   └── NavBar.tsx              # Top navigation
│   │
│   ├── hooks/
│   │   ├── useSocket.ts            # Socket.io client hook
│   │   ├── useSessions.ts          # SWR/React Query for sessions
│   │   └── useStats.ts             # SWR/React Query for stats
│   │
│   └── types/
│       ├── events.ts               # Hook event type definitions
│       └── api.ts                  # API request/response types
│
├── public/
│   └── favicon.ico
│
└── data/                           # SQLite database directory (gitignored)
    └── recorder.db
```

### Key Technology Choices

| Component | Choice | Reason |
|-----------|--------|--------|
| Framework | Next.js 15 App Router | Modern RSC, API routes, single deployment |
| Database | SQLite via Prisma | Zero-config, single file, perfect for self-hosted |
| Real-time | Socket.io | Mature WebSocket lib with fallback; works behind reverse proxies |
| Styling | Tailwind CSS | Fast to build dashboards; already standard in Next.js |
| Data fetching | SWR | Lightweight, revalidation-friendly, pairs well with Socket.io invalidation |
| Runtime | Node.js 20+ | LTS, required for Next.js 15 |

### Socket.io Integration with Next.js

Next.js App Router does not natively support WebSocket upgrade on API routes. The standard approach:

1. Create a custom `server.ts` that wraps the Next.js handler with a Node HTTP server.
2. Attach Socket.io to that HTTP server.
3. API routes emit to Socket.io via a shared server instance (imported from `lib/socket.ts`).

```typescript
// web/server.ts (custom entry point)
import { createServer } from "http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));
  const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });

  // Store io instance for API routes to access
  (globalThis as any).__socketIO = io;

  io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Join session-specific rooms
    socket.on("join:session", (sessionId: string) => {
      socket.join(`session:${sessionId}`);
    });
  });

  const port = process.env.PORT || 3456;
  httpServer.listen(port, () => {
    console.log(`Recorder running on http://localhost:${port}`);
  });
});
```

```typescript
// web/src/lib/socket.ts
import { Server as SocketIOServer } from "socket.io";

export function getIO(): SocketIOServer | null {
  return (globalThis as any).__socketIO || null;
}

export function broadcast(channel: string, data: unknown) {
  const io = getIO();
  if (io) io.emit(channel, data);
}

export function broadcastToSession(sessionId: string, channel: string, data: unknown) {
  const io = getIO();
  if (io) io.to(`session:${sessionId}`).emit(channel, data);
}
```

---

## 6. Hook Configuration

### `~/.claude/settings.json` (Global, All Projects)

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3456/api/events",
            "timeout": 5,
            "headers": {
              "Authorization": "Bearer $RECORDER_API_KEY",
              "X-Machine-Id": "$HOSTNAME"
            },
            "allowedEnvVars": ["RECORDER_API_KEY", "HOSTNAME"]
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3456/api/events",
            "timeout": 5,
            "headers": {
              "Authorization": "Bearer $RECORDER_API_KEY",
              "X-Machine-Id": "$HOSTNAME"
            },
            "allowedEnvVars": ["RECORDER_API_KEY", "HOSTNAME"]
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3456/api/events",
            "timeout": 5,
            "headers": {
              "Authorization": "Bearer $RECORDER_API_KEY",
              "X-Machine-Id": "$HOSTNAME"
            },
            "allowedEnvVars": ["RECORDER_API_KEY", "HOSTNAME"]
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3456/api/events",
            "timeout": 5,
            "headers": {
              "Authorization": "Bearer $RECORDER_API_KEY",
              "X-Machine-Id": "$HOSTNAME"
            },
            "allowedEnvVars": ["RECORDER_API_KEY", "HOSTNAME"]
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:3456/api/events",
            "timeout": 5,
            "headers": {
              "Authorization": "Bearer $RECORDER_API_KEY",
              "X-Machine-Id": "$HOSTNAME"
            },
            "allowedEnvVars": ["RECORDER_API_KEY", "HOSTNAME"]
          }
        ]
      }
    ]
  }
}
```

### Notes on Hook Config

- **`timeout: 5`**: Hooks should not slow down Claude Code. 5 seconds is generous for a local/LAN POST.
- **`allowedEnvVars`**: Required for env var interpolation in headers. Set `RECORDER_API_KEY` in your shell profile.
- **Non-blocking**: HTTP hook failures are non-blocking by design -- connection failures and timeouts produce non-blocking errors that allow Claude Code to continue normally.
- **No matcher needed**: `UserPromptSubmit`, `Stop`, `SessionEnd` do not support matchers. `SessionStart` could use one but we want all session types. `PostToolUse` captures all tools (no matcher = match all).

### For Remote Server (VPS)

Replace `localhost:3456` with server IP/domain:

```json
"url": "https://recorder.example.com/api/events"
```

### Setup Script (Convenience)

Ship a script at `web/scripts/install-hooks.sh` that patches `~/.claude/settings.json`:

```bash
#!/bin/bash
# web/scripts/install-hooks.sh
# Adds recorder hooks to user's Claude settings

RECORDER_URL="${RECORDER_URL:-http://localhost:3456}"
SETTINGS_FILE="$HOME/.claude/settings.json"

# ... jq-based merge of hooks into existing settings
```

---

## 7. Implementation Phases

### Phase 1: Core Recording (MVP)

**Goal**: Hook events flow into SQLite; basic dashboard shows session list and events.

**Tasks**:

1. **Scaffold Next.js app** in `web/` directory
   - `npx create-next-app@latest web --typescript --tailwind --app --src-dir`
   - Add dependencies: `prisma`, `@prisma/client`, `socket.io`, `socket.io-client`, `swr`
   - Create custom `server.ts` with Socket.io

2. **Define Prisma schema** (Session + Event models, no Machine yet)
   - `npx prisma init --datasource-provider sqlite`
   - Write schema as in Section 3 (skip Machine model)
   - `npx prisma migrate dev --name init`

3. **Build API route: `POST /api/events`**
   - Parse `hook_event_name` from body
   - Switch on event type, upsert Session, create Event
   - Emit Socket.io broadcast
   - Return 200 with empty body

4. **Build query routes**: `GET /api/sessions`, `GET /api/sessions/:id/events`

5. **Dashboard pages**:
   - `/dashboard` -- list of recent sessions (active first), basic stats
   - `/sessions/:id` -- event timeline for a session
   - Real-time updates via `useSocket` hook

6. **Hook configuration**: Document + provide example `settings.json` snippet

7. **Docker setup**: `Dockerfile` + `docker-compose.yml` for one-command startup

**Estimated effort**: 3-4 days

### Phase 2: Real-Time Dashboard Polish

**Goal**: Live activity feed, better UI, filtering.

**Tasks**:

1. **Activity feed component**: Real-time event stream across all sessions
2. **Session filtering**: By status, date range, machine
3. **Event type filtering**: Show/hide user prompts, tool uses, etc.
4. **Tool usage breakdown**: Which tools are used most, in a simple bar chart
5. **Session timeline visualization**: Horizontal timeline of events within a session

**Estimated effort**: 2-3 days

### Phase 3: Token/Cost Tracking

**Goal**: Track and display token usage and estimated costs.

**Tasks**:

1. **Token update endpoint**: `POST /api/sessions/:id/tokens`
2. **JSONL parser service**: On `SessionEnd`, if `transcript_path` is accessible, parse the JSONL for token usage and POST to token endpoint
3. **Cost calculation**: Configurable cost-per-token rates (Sonnet, Opus, Haiku)
4. **Cost dashboard**: Per-session and aggregate cost display
5. **Daily/weekly cost charts**

**Estimated effort**: 2-3 days

### Phase 4: Multi-Machine Support

**Goal**: Track which machine generated which sessions.

**Tasks**:

1. **Machine model**: Add Machine table, link to Session
2. **Auto-registration**: First event from a new `X-Machine-Id` creates Machine record
3. **Machine filter**: Dashboard filtering by machine
4. **Machine stats**: Per-machine session counts, costs

**Estimated effort**: 1-2 days

### Phase 5: Authentication + Production Hardening

**Goal**: Secure for network deployment.

**Tasks**:

1. **API key auth middleware**: Validate `Authorization: Bearer` header on ingestion routes
2. **Dashboard auth**: Simple password or OIDC for dashboard access
3. **Rate limiting**: Prevent abuse from misconfigured hooks
4. **HTTPS**: Document reverse proxy setup (nginx/Caddy)
5. **Backup**: SQLite backup script (daily cron)

**Estimated effort**: 2-3 days

---

## 8. Docker Deployment

```yaml
# web/docker-compose.yml
version: "3.8"

services:
  recorder:
    build: .
    ports:
      - "${PORT:-3456}:3456"
    volumes:
      - recorder-data:/app/data    # SQLite persistence
    environment:
      - DATABASE_URL=file:/app/data/recorder.db
      - RECORDER_API_KEY=${RECORDER_API_KEY:-}
      - PORT=3456
    restart: unless-stopped

volumes:
  recorder-data:
```

```dockerfile
# web/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/data ./data

RUN npx prisma migrate deploy
EXPOSE 3456
CMD ["node", "server.ts"]
```

Startup: `cd web && docker-compose up -d`

---

## 9. Cost Estimation Model

For Phase 3, we need configurable pricing. Store in `web/src/lib/constants.ts`:

```typescript
// Prices per million tokens (USD), as of early 2026
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6":  { input: 3.00, output: 15.00 },
  "claude-opus-4-6":    { input: 15.00, output: 75.00 },
  "claude-haiku-3-5":   { input: 0.80, output: 4.00 },
};

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING["claude-sonnet-4-6"];
  return (inputTokens / 1_000_000) * pricing.input
       + (outputTokens / 1_000_000) * pricing.output;
}
```

---

## 10. Unresolved Questions

1. **PostToolUse volume**: In a busy session, PostToolUse fires for every Read, Glob, Grep, etc. This can generate hundreds of events per minute. Should we filter by tool name in the hook matcher (e.g., only capture `Bash|Edit|Write`) to reduce noise, or capture all and filter in the dashboard?
   - **Recommendation**: Start with capturing all tools. Add a matcher filter if storage or performance becomes an issue.

2. **Token data gap**: Claude Code hooks do not include token usage. The JSONL transcript contains tokens but requires file access. For remote deployments (hooks from Machine A to Server B), the server cannot read Machine A's JSONL files. Options:
   - (a) Ship a companion CLI that runs on each machine and syncs token data.
   - (b) Accept the gap for remote deployments; tokens only available for local/same-machine setups.
   - (c) Use the existing `claude-code-log` parser as a periodic sync job.
   - **Recommendation**: (b) for Phase 1-3. Implement (c) as Phase 5+ if needed.

3. **Async hooks**: Should PostToolUse hooks use `"async": true` to avoid blocking Claude Code? HTTP hooks are already non-blocking on failure, but they do wait for the response. Setting a low timeout (5s) should suffice.
   - **Note**: The `async` field is documented for command hooks only. HTTP hooks handle this via timeout. Keep `timeout: 5`.

4. **Dashboard auth for multi-user**: If multiple developers share one recorder server, should each see only their sessions? This implies user accounts.
   - **Recommendation**: Defer to Phase 5. For now, all sessions are visible to all dashboard users. Machine ID provides basic segregation.

5. **Relationship to existing `claude_code_log/` library**: The recorder captures events in real-time. The existing library processes JSONL files after the fact. Should the recorder eventually replace the JSONL parser, or complement it?
   - **Recommendation**: Complement. The recorder captures a lightweight event stream. The JSONL parser provides the full, detailed transcript with all content. They serve different purposes.

---

## Sources

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- Official documentation for hook events, configuration, JSON schemas, HTTP hooks
- [Claude Code Hooks Mastery (GitHub)](https://github.com/disler/claude-code-hooks-mastery) -- Community examples
- [Claude Code Hooks Guide (SmartScope)](https://smartscope.blog/en/generative-ai/claude/claude-code-hooks-guide/) -- February 2026 edition
