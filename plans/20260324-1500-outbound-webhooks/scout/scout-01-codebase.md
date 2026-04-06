# Scout Report: Outbound Webhooks/Integrations Architecture
**Date:** 2026-03-24 | **Scope:** web/ directory (Next.js + Prisma + BullMQ)

---

## 1. Prisma Schema Models

**File:** `web/prisma/schema.prisma`

### Database Schema (PostgreSQL)

```prisma
model Department
  id        String   @id @default(uuid())
  name      String   @unique
  createdAt DateTime @default(now()) @map("created_at")
  users     User[]

model User
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String?  @map("password_hash")
  createdAt    DateTime @default(now()) @map("created_at")
  role         String   @default("member")  // member | dept_head
  departmentId String?   @map("department_id")
  department   Department? @relation(...)
  sessions     Session[]

model Session
  id                  String    @id
  machineId           String    @default("unknown")
  projectPath         String?
  model               String?
  status              String    @default("active")  // active | completed | error
  startedAt           DateTime  @default(now())
  endedAt             DateTime?
  userId              String?
  user                User?
  // Token aggregates
  inputTokens         Int       @default(0)
  outputTokens        Int       @default(0)
  cacheCreationTokens Int       @default(0)
  cacheReadTokens     Int       @default(0)
  events              Event[]

model Event
  id        Int      @id @default(autoincrement())
  sessionId String   @map("session_id")
  eventType String   @map("event_type")  // tool_start, tool_use, user_prompt, assistant_message, session_start
  timestamp DateTime @default(now())
  entryUuid String?  @map("entry_uuid")  // for dedup (null = no UUID)
  
  // Content fields
  userPrompt      String?    @map("user_prompt")
  toolName        String?    @map("tool_name")
  toolInput       String?    @map("tool_input")       // max 50KB
  toolOutput      String?    @map("tool_output")      // max 100KB
  toolDurationMs  Int?       @map("tool_duration_ms")
  assistantMessage String?   @map("assistant_message")
  
  // Per-event token usage
  inputTokens         Int?
  outputTokens        Int?
  cacheCreationTokens Int?
  cacheReadTokens     Int?
  
  session         Session @relation(...)
  @@unique([sessionId, entryUuid])  // Dedup key
  @@index([eventType])
  @@index([timestamp])
```

**Key insight:** Webhook integration needs to watch these tables for new events and trigger outbound calls.

---

## 2. Event Processing Pipeline

**File:** `web/src/lib/processEvent.ts` (288 lines)

### Function Signature
```typescript
export async function processEvent(
  body: Record<string, unknown>,
  ensuredSessions?: Set<string>
): Promise<void>
```

### Input Parameters (from hook payload)
- `hook_event_name` — Event type (PreToolUse, PostToolUse, UserPromptSubmit, Stop, Notification)
- `session_id` — Session identifier (required)
- `machine_id` — Machine identifier
- `user_uuid` — User ID (optional, for user linkage)
- `entry_uuid` — Transcript UUID for idempotent replay
- `event_timestamp` — Original event time (ISO string, for historical replay)
- `cwd` — Working directory
- `model` — AI model name
- `prompt` — User message text
- `tool_name`, `tool_input`, `tool_output` — Tool execution details
- `usage` — Token counts per turn
- `usage_total` — Aggregate tokens (sent on Stop)
- `stop_hook_active` — Whether stop was triggered by hook

### Event Type Handlers

| Hook Event | DB Event Type | Emits | Socket Rooms |
|------------|---------------|-------|--------------|
| `PreToolUse` | `tool_start` | to session only | `session:{sessionId}` |
| `PostToolUse` | `tool_use` | to session + global | `session:{sessionId}` |
| `UserPromptSubmit` | `user_prompt` | to session + global | `session:{sessionId}`, global feed |
| `Stop` | `assistant_message` | to session + global | `session:{sessionId}`, global feed |
| `Notification` (session_start/resume) | `session_start` | to session + global | `session:{sessionId}`, global |

### Key Processing Details

1. **Idempotent Deduplication**
   - Uses `(sessionId, entryUuid)` unique constraint
   - Returns null if duplicate detected
   - NULL entry_uuid = always inserted (live events)

2. **Session Ensurance** (once per session per batch)
   ```typescript
   ensureSession(sessionId, machineId, body, userUuid)
   ```
   - Upserts session with userId only on create (never overwrite)
   - Retroactive claim: if user UUID is new on machineId, backfills last 90 days
   - Guards against shared machine scenarios

3. **Token Aggregation**
   - Per-event: stored in Event table
   - Session-level: updated in transactions on PostToolUse + Stop
   - Stop event supports `usage_total` (authoritative SET instead of increment)

4. **Socket.IO Emission**
   - Uses `emitEvent(eventName, data, room?)` helper
   - Global events: live feed updates (`"event"` with ownerUserId)
   - Session events: room-scoped `"session:{sessionId}"`
   - System events: `"session_started"`, `"session_updated"`

---

## 3. BullMQ Queue System

### Queue Configuration
**File:** `web/src/lib/eventQueue.ts` (47 lines)

```typescript
export interface BatchJobData {
  events: Record<string, unknown>[];      // Array of hook events
  validUserIds: string[];                 // Pre-validated in API route
}

export function getEventQueue(): Queue<BatchJobData> | null
```

**Settings:**
- Queue name: `"claude-event-batch"`
- Connection: Lazy singleton from `REDIS_URL`
- Retry: 3 attempts with exponential backoff (2s initial)
- Completed: Keep 1000 jobs or 24h
- Failed: Keep 1000 jobs or 7 days (for manual investigation)

### Worker Implementation
**File:** `web/src/lib/eventWorker.ts` (89 lines)

```typescript
export function startEventWorker(redisUrl: string): Worker<BatchJobData>
```

**Configuration:**
- Concurrency: 5 jobs simultaneous
- Lock duration: 60s (generous for 100-event batches)
- Stall interval: 15s (check for stalled jobs)

**Processing:**
1. Restores pre-validated user ID set
2. Creates shared `ensuredSessions` cache
3. Processes each event sequentially via `processEvent(event, ensuredSessions)`
4. Tracks processed/error counts
5. Throws if all events fail (triggers retry)
6. Partial failures OK (dedup prevents double-processing)

---

## 4. Server.ts — Socket.IO & Worker Bootstrap

**File:** `web/server.ts` (126 lines)

### Socket.IO Setup
```typescript
export let io: SocketIOServer | null = null;
let eventWorker: Worker | null = null;

// Server initialization
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: allowedOrigins,  // from env or NEXT_PUBLIC_BASE_URL
    methods: ["GET", "POST"],
  },
});
```

### Redis Adapter (Horizontal Scaling)
When `REDIS_URL` is set:
```typescript
const pubClient = createClient({ url: redisUrl });
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));
eventWorker = startEventWorker(redisUrl);
```

Falls back to in-memory adapter if Redis unavailable.

### Socket.IO Event Handlers
```typescript
socket.on("subscribe", ({ sessionId }) => {
  socket.join(`session:${sessionId}`);
});

socket.on("unsubscribe", ({ sessionId }) => {
  socket.leave(`session:${sessionId}`);
});
```

### Graceful Shutdown
- Listens for SIGTERM/SIGINT
- Closes HTTP server
- Drains BullMQ worker
- Disconnects Prisma + Redis
- 10s timeout before forced exit

---

## 5. Admin API Routes

**Location:** `web/src/app/api/admin/`

### Queue Management
**File:** `web/src/app/api/admin/queue/route.ts` (206 lines)

#### GET /api/admin/queue
Returns system health snapshot:
```typescript
{
  queue: { waiting, active, completed, failed, delayed, ok },
  failedJobs: [
    { id, failedReason, timestamp, attemptsMade, eventCount }
  ],
  redis: { ok, usedMemory, maxMemory, connectedClients, evictionPolicy },
  db: { ok, latencyMs },
  ingestionRate: [{ minute, count }],       // last 30 min buckets
  eventsLast5m: number,
  eventsLastHour: number,
  topUsers: [{ email, count }],              // last hour, top 5
  dedupHealth: { total, noUuid, ratio },     // % of events with NULL entry_uuid
  timestamp: ISO string
}
```

#### POST /api/admin/queue
Actions:
- `"retry_all"` — Retry all failed jobs
- `"drain"` — Clear queue
- `"pause"` — Pause processing
- `"resume"` — Resume processing
- `"retry"` — Retry single job (requires `jobId`)
- `"clean_failed"` — Remove all failed jobs

### Users Listing
**File:** `web/src/app/api/admin/users/route.ts` (100 lines)

```typescript
GET /api/admin/users
→ {
    users: [
      {
        id, email, createdAt, role,
        department: { id, name },
        totalSessions, totalEvents,
        totalTokens, estimatedCostUsd,
        projects: string[],              // up to 6
        lastActiveAt: ISO | null
      }
    ],
    total, anonymousSessions
  }
```

Query pattern: Single SQL query with aggregations (no N+1).

### Other Admin Routes
- `GET/POST /api/admin/users` — List/create users
- `GET/PUT/DELETE /api/admin/users/[id]` — User CRUD
- `GET/POST /api/admin/departments` — Department CRUD
- `GET/PUT/DELETE /api/admin/departments/[id]` — Dept detail
- `GET /api/admin/projects` — Project listing
- `POST /api/admin/login` — Admin password auth

---

## 6. Admin UI Component

**File:** `web/src/app/admin/page.tsx` (partial, 150 lines shown)

### Interface Definitions

```typescript
interface AdminUser {
  id, email, createdAt, role,
  department: { id, name } | null,
  totalSessions, totalEvents, totalTokens,
  estimatedCostUsd, projects[], lastActiveAt
}

interface QueueHealth {
  queue: { waiting, active, completed, failed, delayed, ok },
  failedJobs: Array<{
    id, failedReason, timestamp, attemptsMade, eventCount
  }>,
  redis: { ok, usedMemory, maxMemory, connectedClients, evictionPolicy },
  db: { ok, latencyMs },
  ingestionRate: Array<{ minute, count }>,
  eventsLast5m, eventsLastHour,
  topUsers: Array<{ email, count }>,
  dedupHealth: { total, noUuid, ratio },
  timestamp
}
```

### Tab Structure
```typescript
type Tab = "departments" | "users" | "projects" | "sessions" | "system"
```

### System Health UI
- Auto-refreshes every 10s when on "system" tab
- Queue stats visualization
- Failed jobs list (up to 20)
- Redis health + PostgreSQL latency
- Ingestion rate chart (30-min buckets)
- Dedup health ratio

### State Management
```typescript
const [authenticated, setAuthenticated] = useState(false);
const [tab, setTab] = useState<Tab>("departments");
const [sysHealth, setSysHealth] = useState<QueueHealth | null>(null);
```

---

## 7. Environment Variables

**File:** `web/.env.example`

### Current Vars
| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `DATABASE_URL` | string | `file:./claude-reporter.db` | PostgreSQL/SQLite connection |
| `PORT` | number | `3005` | Web server port |
| `HOOK_SECRET` | string (opt) | — | Shared secret for hook validation |
| `MACHINE_ID` | string (opt) | — | Default machine identifier |
| `REDIS_URL` | string (opt) | — | Redis connection (enables BullMQ + Socket.IO scaling) |
| `NEXT_PUBLIC_BASE_URL` | string (opt) | — | Public URL for installer scripts |
| `ADMIN_PASSWORD` | string (opt) | — | Admin dashboard password |
| `GEMINI_API_KEY` | string (opt) | — | For `/api/analyze` AI features |
| `ALLOWED_ORIGINS` | string (opt) | — | CORS comma-separated list |

### New Env Vars Needed for Webhooks
(To be added to schema)
- `WEBHOOK_QUEUE_NAME` — Queue name for outbound webhooks (default: `"webhook-delivery"`)
- `WEBHOOK_MAX_RETRIES` — Retry attempts for failed webhooks (default: `3`)
- `WEBHOOK_TIMEOUT_MS` — HTTP timeout for webhook requests (default: `30000`)

---

## 8. Architecture Summary for Webhooks Integration

### Inbound Flow (Current)
```
Claude Code Hook → POST /api/events → processEvent()
                                   ↓
                          Prisma (Session + Event)
                                   ↓
                       Socket.IO (live dashboard)
```

### Proposed Outbound Flow (Webhooks)
```
Event created in DB
        ↓
Trigger webhook job (BullMQ queue)
        ↓
Webhook worker (retries 3x, backoff)
        ↓
HTTP POST to webhook URL
        ↓
Webhook model (DB: URL, secret, event types, status)
        ↓
Webhook delivery log (success/failure/retry)
```

### Key Integration Points

1. **Watch Tables:**
   - `Event` table — new rows trigger webhook delivery
   - `Session` table — status changes (completed/error)

2. **Queue System:**
   - Reuse existing BullMQ/Redis infrastructure
   - Create separate `"webhook-delivery"` queue
   - Worker subscribes to both event batch + webhook queues

3. **Admin Dashboard:**
   - Add "Webhooks" tab to admin page
   - Manage webhook endpoints (CRUD)
   - View delivery history + retry logs
   - Queue health for webhook queue

4. **Prisma Extensions:**
   - Add `Webhook` model (url, secret, event types filter, active flag)
   - Add `WebhookDelivery` model (webhook_id, event_id, status, attempts, response)

5. **API Routes:**
   - `POST /api/admin/webhooks` — Create webhook
   - `GET /api/admin/webhooks` — List webhooks
   - `PUT /api/admin/webhooks/[id]` — Update webhook
   - `DELETE /api/admin/webhooks/[id]` — Delete webhook
   - `GET /api/admin/webhooks/[id]/deliveries` — Delivery history
   - `POST /api/admin/webhooks/[id]/retry` — Manual retry

---

## Files Relevant to Implementation

| File | Purpose | Lines |
|------|---------|-------|
| `prisma/schema.prisma` | Schema + migrations | 102 |
| `src/lib/processEvent.ts` | Event handler logic | 288 |
| `src/lib/eventQueue.ts` | BullMQ queue setup | 47 |
| `src/lib/eventWorker.ts` | BullMQ worker logic | 89 |
| `server.ts` | Socket.IO + Worker bootstrap | 126 |
| `src/app/api/admin/queue/route.ts` | Admin queue API | 206 |
| `src/app/api/admin/users/route.ts` | Admin users API (example) | 100+ |
| `src/app/admin/page.tsx` | Admin UI shell | 400+ |
| `.env.example` | Environment template | 13 |

---

## Unresolved Questions

1. Should webhooks fire on every event or aggregate per session?
2. Should webhook delivery logs be stored in DB or only in Redis queue?
3. Should there be a webhook signature (HMAC) scheme for security?
4. Should failed webhook attempts spawn a separate retry queue?
5. Should webhook payload be configurable (include all event fields or summary)?

