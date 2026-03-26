# Claude Reporter — API Reference

**Base URL:** `https://vibe-reporter.onebot-training.meobeo.ai`

---

## Mục lục

- [Authentication](#authentication)
- [Events (Ingest)](#events-ingest)
- [Sessions](#sessions)
- [Stats & Reports](#stats--reports)
- [Projects & Departments](#projects--departments)
- [Auth — User](#auth--user)
- [Webhooks — User](#webhooks--user)
- [Admin — Login](#admin--login)
- [Admin — Users](#admin--users)
- [Admin — Departments](#admin--departments)
- [Admin — Projects](#admin--projects)
- [Admin — Webhooks](#admin--webhooks)
- [Admin — Queue / System](#admin--queue--system)
- [Install Hooks](#install-hooks)
- [Health](#health)

---

## Authentication

### Admin routes (`/api/admin/*`)

Yêu cầu cookie `admin_session`. Đăng nhập qua `POST /api/admin/login`.

```bash
curl -c cookies.txt -X POST BASE_URL/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"ADMIN_PASSWORD"}'

# Mọi request sau đó
curl -b cookies.txt BASE_URL/api/admin/webhooks
```

### User routes (`/api/webhooks/*`, `/api/report`, `/api/sessions`, v.v.)

**Cách 1 — Cookie (browser):** Đăng nhập tại `/login`, cookie `user_session` tự động gửi kèm.

**Cách 2 — Email + UUID (API / programmatic):**

```bash
curl BASE_URL/api/webhooks \
  -H 'X-User-Email: user@example.com' \
  -H 'X-User-UUID: 550e8400-e29b-41d4-a716-446655440000'
```

UUID = `user.id` trong DB — lấy tại trang `/profile` sau khi đăng nhập, hoặc từ response `POST /api/auth/register`.

### Public routes (không cần auth)

`/api/events`, `/api/events/batch`, `/api/health`, `/api/install`, `/api/departments`

---

## Events (Ingest)

### `POST /api/events`

Nhận 1 event từ Claude Code hook script.

**Request body:** Claude Code hook payload JSON

```json
{
  "hook_event_name": "PostToolUse",
  "session_id": "abc123",
  "machine_id": "dev-laptop",
  "user_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "tool_name": "Bash",
  "tool_duration_ms": 432
}
```

**Response:** `200 OK`

---

### `POST /api/events/batch`

Nhận batch tối đa **100 events** một lúc. Dùng bởi `reporter.sh` để giảm số lượng HTTP requests.

**Request body:**

```json
{
  "events": [ /* mảng tối đa 100 event objects */ ]
}
```

**Response (với Redis):** `202 Accepted` — job đã enqueue, xử lý bất đồng bộ

**Response (không có Redis):** `200 OK` — xử lý inline đồng bộ

---

## Sessions

### `GET /api/sessions`

Danh sách sessions, paginated.

**Query params:**

| Param | Default | Mô tả |
|---|---|---|
| `page` | `1` | Trang |
| `limit` | `20` | Số session/trang (tối đa 100) |
| `userId` | — | Lọc theo user ID |
| `projectPath` | — | Lọc theo project path |

**Response:**

```json
{
  "sessions": [
    {
      "id": "abc123",
      "machineId": "dev-laptop",
      "projectPath": "/home/user/project",
      "model": "claude-opus-4-5",
      "status": "active",
      "startedAt": "2026-03-26T10:00:00.000Z",
      "inputTokens": 8500,
      "outputTokens": 2100,
      "user": { "id": "uuid", "email": "user@example.com" }
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

### `GET /api/sessions/:id`

Chi tiết 1 session kèm toàn bộ events.

**Response:**

```json
{
  "session": {
    "id": "abc123",
    "events": [
      {
        "id": "evt1",
        "eventType": "tool_use",
        "toolName": "Bash",
        "toolDurationMs": 432,
        "timestamp": "2026-03-26T10:01:00.000Z"
      }
    ]
  }
}
```

---

## Stats & Reports

### `GET /api/stats`

Tổng hợp toàn bộ hệ thống.

**Query params:** `userId` (filter), `from`, `to` (ISO date range)

**Response:**

```json
{
  "totalSessions": 120,
  "activeSessions": 3,
  "totalEvents": 8500,
  "totalInputTokens": 1200000,
  "totalOutputTokens": 340000,
  "estimatedCostUsd": 12.45
}
```

---

### `GET /api/report`

Báo cáo cá nhân của user đang đăng nhập.

**Auth:** Cookie `user_session` hoặc `X-User-Email` + `X-User-UUID`

**Query params:** `from`, `to` (ISO date string)

**Response:**

```json
{
  "user": { "email": "user@example.com" },
  "period": { "from": "2026-03-01", "to": "2026-03-26" },
  "totalSessions": 45,
  "totalInputTokens": 500000,
  "totalOutputTokens": 120000,
  "estimatedCostUsd": 4.2,
  "dailyBreakdown": [ /* array ngày */ ]
}
```

---

### `GET /api/report/team`

Báo cáo tổng hợp toàn team (admin hoặc dept_head).

**Auth:** Cookie user session với role `dept_head` hoặc admin cookie

---

### `GET /api/report/prompt-quality`

Phân tích chất lượng prompt (vague/code-dump heuristics).

**Auth:** User session

---

### `POST /api/analyze`

AI-powered analysis (Gemini). Phân tích session hoặc events.

**Auth:** User session

**Request body:**

```json
{
  "sessionId": "abc123",
  "question": "Summarize what was done in this session"
}
```

**Response:**

```json
{
  "analysis": "In this session, the developer..."
}
```

---

## Projects & Departments

### `GET /api/projects`

Danh sách projects đã có activity.

**Response:**

```json
{
  "projects": [
    {
      "name": "my-app",
      "path": "/home/user/my-app",
      "sessionCount": 12,
      "lastActivity": "2026-03-26T11:00:00.000Z"
    }
  ]
}
```

---

### `GET /api/departments`

Danh sách phòng ban (public, không cần auth).

**Response:**

```json
{
  "departments": [
    { "id": "uuid", "name": "Engineering" }
  ]
}
```

---

## Auth — User

### `POST /api/auth/register`

Đăng ký tài khoản mới. Trả về `uuid` = `user.id` dùng để auth API.

**Rate limit:** 5 requests / 10 phút / IP

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "mypassword",
  "departmentId": "dept-uuid"
}
```

**Response 201:**

```json
{
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com",
  "isNew": true,
  "department": { "id": "uuid", "name": "Engineering" }
}
```

> Cookie `user_session` được set tự động.

---

### `POST /api/auth/login`

Đăng nhập bằng email + password.

**Rate limit:** 10 attempts / 5 phút / IP

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "mypassword"
}
```

**Response 200:** Set cookie `user_session`, trả về user info + uuid.

---

### `GET /api/auth/verify/:uuid`

Kiểm tra UUID có hợp lệ không. Dùng bởi hook script.

**Rate limit:** 30 requests / 5 phút / IP

**Response 200:**

```json
{
  "valid": true,
  "email": "user@example.com",
  "role": "member",
  "department": { "id": "uuid", "name": "Engineering" }
}
```

---

### `GET /api/auth/me`

Thông tin user hiện tại (từ cookie session).

**Auth:** Cookie `user_session`

**Response 200:**

```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "role": "member",
  "departmentId": "dept-uuid"
}
```

---

### `POST /api/auth/logout`

Xoá cookie `user_session`.

**Response:** `200 OK`

---

## Webhooks — User

User tự quản lý webhook cá nhân. **Auth:** Cookie session hoặc `X-User-Email` + `X-User-UUID`.

> Xem [docs/webhooks.md](./webhooks.md) để biết đầy đủ về payload, signature, và tích hợp.

### `GET /api/webhooks`

Danh sách webhook của user hiện tại.

**Response:**

```json
{
  "webhooks": [
    {
      "id": "wh_abc",
      "targetUrl": "https://my-server.com/hook",
      "description": "My Slack hook",
      "events": ["session.ended"],
      "active": true,
      "createdAt": "2026-03-26T10:00:00.000Z",
      "_count": { "deliveries": 15 }
    }
  ]
}
```

---

### `POST /api/webhooks`

Tạo webhook mới. Tối đa **5 webhooks/user**.

**Request body:**

```json
{
  "targetUrl": "https://my-server.com/hook",
  "events": ["session.created", "session.ended"],
  "description": "Optional description"
}
```

**Response 201:** Trả về webhook object + `secret` (chỉ 1 lần).

**Errors:**

| Status | Lý do |
|---|---|
| `400` | URL không hợp lệ / events rỗng / description quá 500 ký tự |
| `400` | Đã đủ 5 webhooks |
| `409` | URL này đã được đăng ký |

---

### `GET /api/webhooks/:id`

Chi tiết 1 webhook (chỉ xem của chính mình — người khác trả `404`).

---

### `PUT /api/webhooks/:id`

Cập nhật webhook. Tất cả fields đều optional.

**Request body:**

```json
{
  "targetUrl": "https://new-url.com/hook",
  "events": ["session.ended"],
  "active": false,
  "description": "Updated"
}
```

---

### `DELETE /api/webhooks/:id`

Xoá webhook và toàn bộ delivery history.

**Response:** `204 No Content`

---

### `POST /api/webhooks/:id/test`

Gửi `test.ping` đồng bộ, trả về kết quả ngay.

**Rate limit:** 5 requests / phút / user

**Response:**

```json
{
  "success": true,
  "statusCode": 200,
  "responseBody": "ok",
  "latencyMs": 143
}
```

---

### `GET /api/webhooks/:id/deliveries`

Delivery logs, paginated.

**Query params:**

| Param | Default | Options |
|---|---|---|
| `page` | `1` | — |
| `limit` | `50` | tối đa `100` |
| `status` | — | `pending`, `success`, `failed`, `dead_letter` |

**Response:**

```json
{
  "deliveries": [
    {
      "id": "del_abc",
      "eventType": "session.ended",
      "status": "success",
      "statusCode": 200,
      "attempts": 1,
      "latencyMs": 143,
      "createdAt": "2026-03-26T10:00:00.000Z",
      "succeededAt": "2026-03-26T10:00:00.143Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 50
}
```

---

## Admin — Login

### `POST /api/admin/login`

**Request body:** `{ "email": "...", "password": "ADMIN_PASSWORD" }`

**Response 200:** Set cookie `admin_session`.

---

## Admin — Users

### `GET /api/admin/users`

Danh sách tất cả users kèm stats (tokens, cost, sessions).

**Auth:** Admin cookie

**Response:**

```json
{
  "users": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "role": "member",
      "department": { "id": "uuid", "name": "Engineering" },
      "totalSessions": 45,
      "totalTokens": 1200000,
      "estimatedCostUsd": 4.2
    }
  ],
  "anonymousSessions": 12
}
```

---

### `PATCH /api/admin/users/:id`

Cập nhật role hoặc department.

**Request body:**

```json
{
  "role": "dept_head",
  "departmentId": "dept-uuid"
}
```

---

### `DELETE /api/admin/users/:id`

Xoá user (cascade sessions/events).

---

## Admin — Departments

### `GET /api/admin/departments`

Danh sách phòng ban kèm số lượng members và token usage.

### `POST /api/admin/departments`

```json
{ "name": "Engineering" }
```

### `PATCH /api/admin/departments/:id`

```json
{ "name": "New Name" }
```

### `DELETE /api/admin/departments/:id`

Xoá phòng ban (members được set `departmentId = null`).

---

## Admin — Projects

### `GET /api/admin/projects`

Danh sách projects toàn hệ thống kèm stats.

---

## Admin — Webhooks

> Xem [docs/webhooks.md](./webhooks.md#4-admin-api) để biết đầy đủ.

### `GET /api/admin/webhooks`

Danh sách tất cả webhooks (admin-global + user) kèm delivery stats.

### `POST /api/admin/webhooks`

Tạo admin-global webhook (`userId = null`, fire cho tất cả sessions).

**Request:** `{ "targetUrl", "events", "description?" }`

**Response 201:** Trả về webhook + `secret` (chỉ 1 lần).

### `GET /api/admin/webhooks/:id`

Chi tiết webhook (không có `secret`).

### `PUT /api/admin/webhooks/:id`

Cập nhật `targetUrl`, `events`, `active`, `description`.

### `DELETE /api/admin/webhooks/:id`

Xoá webhook + cascade deliveries.

### `POST /api/admin/webhooks/:id/test`

Test delivery đồng bộ. Response: `{ success, statusCode, responseBody, latencyMs }`.

### `GET /api/admin/webhooks/:id/deliveries`

Paginated delivery logs. Query: `page`, `limit`, `status`.

### `POST /api/admin/webhooks/:id/deliveries/:deliveryId/retry`

Retry thủ công 1 delivery đã `failed` hoặc `dead_letter`.

---

## Admin — Queue / System

### `GET /api/admin/queue`

Trạng thái hệ thống: BullMQ queue stats, Redis health, DB latency, ingestion rate.

**Response:**

```json
{
  "queue": {
    "waiting": 0, "active": 2, "completed": 1500, "failed": 3, "delayed": 0, "ok": true
  },
  "redis": { "ok": true, "usedMemory": "12.4MB", "connectedClients": 4 },
  "db": { "ok": true, "latencyMs": 2 },
  "eventsLast5m": 45,
  "eventsLastHour": 312,
  "ingestionRate": [ { "minute": "10:01", "count": 8 } ],
  "topUsers": [ { "email": "user@example.com", "count": 120 } ]
}
```

---

### `POST /api/admin/queue`

Thực hiện action trên queue.

**Request body:**

```json
{ "action": "retry_all" }
```

| Action | Mô tả |
|---|---|
| `retry_all` | Retry tất cả failed jobs |
| `drain` | Xoá tất cả waiting jobs |
| `pause` | Tạm dừng worker |
| `resume` | Tiếp tục worker |
| `retry` | Retry 1 job (kèm `jobId`) |
| `clean_failed` | Xoá failed jobs cũ |

---

### `POST /api/admin/reset`

**⚠️ Destructive.** Xoá dữ liệu.

```json
{ "scope": "sessions" }   // xoá sessions + events, giữ users
{ "scope": "all" }        // xoá toàn bộ: users + sessions + events
```

---

## Install Hooks

### `GET /api/install`

Trả về bash installer script cho macOS/Linux.

```bash
curl -s BASE_URL/api/install | bash
```

### `GET /api/install/windows`

Trả về PowerShell installer script cho Windows.

```powershell
iex (irm 'BASE_URL/api/install/windows')
```

---

## Health

### `GET /api/health`

Liveness check.

**Response 200:**

```json
{ "ok": true, "timestamp": "2026-03-26T10:00:00.000Z" }
```

---

## Error format

Mọi lỗi đều trả về JSON:

```json
{ "error": "Mô tả lỗi" }
```

| Status | Ý nghĩa |
|---|---|
| `400` | Bad request — dữ liệu không hợp lệ |
| `401` | Unauthorized — chưa đăng nhập hoặc sai credentials |
| `404` | Not found — resource không tồn tại hoặc không thuộc về bạn |
| `409` | Conflict — duplicate (URL đã tồn tại, email đã đăng ký…) |
| `429` | Rate limited |
| `500` | Internal server error |

---

## Socket.IO Events (real-time)

Kết nối: `const socket = io('BASE_URL')`

| Event | Payload | Mô tả |
|---|---|---|
| `event` | `{ sessionId, event, ownerUserId? }` | Event mới (tool_use, user_prompt, assistant_message) |
| `session_started` | `{ sessionId }` | Session mới bắt đầu |
| `session_updated` | `{ sessionId }` | Token counters cập nhật |

Subscribe vào room của 1 session cụ thể:

```javascript
socket.emit('subscribe', sessionId);
// Nhận events chỉ của session này
```
