# Outbound Webhooks — Hướng dẫn sử dụng

**Base URL:** `https://vibe-reporter.onebot-training.meobeo.ai`

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Event Types](#2-event-types)
3. [Payload format & Signature verification](#3-payload-format--signature-verification)
4. [Admin API](#4-admin-api)
5. [User API](#5-user-api)
6. [Authentication](#6-authentication)
7. [Delivery & Retry](#7-delivery--retry)
8. [Test delivery](#8-test-delivery)
9. [Xem delivery logs](#9-xem-delivery-logs)
10. [Admin UI](#10-admin-ui)
11. [Tích hợp Slack / Discord / n8n / Zapier](#11-tích-hợp-slack--discord--n8n--zapier)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Tổng quan

Webhook cho phép Claude Reporter **gửi HTTP POST** đến endpoint của bạn mỗi khi có sự kiện (session bắt đầu, tool được gọi, user gửi prompt…).

```
Claude Code event
      │
      ▼
processEvent()  ──►  dispatchWebhooks()
                            │
                   ┌────────┴────────┐
                   ▼                 ▼
            WebhookDelivery     BullMQ queue
              (audit log)            │
                                     ▼
                             webhookWorker.ts
                             (HTTP POST + HMAC sign)
                                     │
                            ┌────────┴────────┐
                            ▼                 ▼
                         Success          Retry (×5, exp backoff)
```

**Hai loại webhook:**
- **Admin webhook** (`userId = null`) — fire cho **tất cả** sessions/events trong hệ thống
- **User webhook** (`userId = <id>`) — chỉ fire cho sessions của **chính user đó** (max 5/user)

---

## 2. Event Types

| Event Type | Khi nào fire |
|---|---|
| `session.created` | Session Claude Code mới bắt đầu |
| `session.ended` | Session kết thúc (Stop hook) |
| `event.tool_use` | Một tool được thực thi xong (PostToolUse) |
| `event.user_prompt` | User submit prompt mới |
| `event.assistant_message` | *(reserved, chưa fire)* |
| `stats.daily_summary` | *(reserved, chưa fire)* |
| `token_budget.warning` | *(reserved, chưa fire)* |
| `test.ping` | Chỉ dùng cho test delivery — không subscribe |

---

## 3. Payload format & Signature verification

### Payload envelope

Mọi request đều có cùng cấu trúc JSON:

```json
{
  "id": "evt_a3f1b2c4d5e6f7a8b9c0d1e2f3a4b5c6",
  "object": "event",
  "created": 1711234567,
  "type": "session.created",
  "data": {
    "object": {
      "session_id": "abc123",
      "machine_id": "dev-laptop",
      "project_path": "/home/user/myproject",
      "model": "claude-opus-4-5",
      "started_at": "2026-03-26T10:00:00.000Z"
    }
  }
}
```

| Field | Mô tả |
|---|---|
| `id` | ID duy nhất mỗi delivery (`evt_` + uuid) — dùng làm idempotency key |
| `object` | Luôn là `"event"` |
| `created` | Unix timestamp (seconds) |
| `type` | Event type (xem bảng trên) |
| `data.object` | Payload cụ thể theo từng event type |

### HTTP Headers

```
Content-Type: application/json
X-Webhook-Signature: t=1711234567,v1=abc123def456...
X-Webhook-Event: session.created
X-Webhook-Delivery: evt_a3f1b2c4d5e6f7a8b9c0d1e2f3a4b5c6
User-Agent: ClaudeReporter-Webhook/1.0
```

### Verify signature (HMAC-SHA256)

```javascript
// Node.js
const crypto = require('crypto');

function verifyWebhookSignature(payload, signatureHeader, secret) {
  // header format: "t=<timestamp>,v1=<signature>"
  const parts = Object.fromEntries(
    signatureHeader.split(',').map(p => p.split('=', 2))
  );
  const timestamp = parts.t;
  const received  = parts.v1;

  // Signed string = "timestamp.payload"
  const signedString = `${timestamp}.${payload}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedString)
    .digest('hex');

  // Timing-safe compare
  return crypto.timingSafeEqual(
    Buffer.from(received, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// Express example
app.post('/webhook', (req, res) => {
  const raw = JSON.stringify(req.body); // use raw body string
  const sig = req.headers['x-webhook-signature'];
  if (!verifyWebhookSignature(raw, sig, process.env.WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }
  // process event...
  res.sendStatus(200);
});
```

```python
# Python
import hmac, hashlib

def verify_signature(payload: str, signature_header: str, secret: str) -> bool:
    parts = dict(p.split('=', 1) for p in signature_header.split(','))
    signed_string = f"{parts['t']}.{payload}"
    expected = hmac.new(
        secret.encode(), signed_string.encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(parts['v1'], expected)
```

> **Lưu ý:** Luôn dùng raw body string (không parse rồi stringify lại) để verify chính xác.

### Event payloads

**`session.created`**
```json
{
  "session_id": "abc123",
  "machine_id": "dev-laptop",
  "project_path": "/home/user/project",
  "model": "claude-opus-4-5",
  "started_at": "2026-03-26T10:00:00.000Z"
}
```

**`session.ended`**
```json
{
  "session_id": "abc123",
  "message": "Session summary…",
  "usage": { "input_tokens": 1200, "output_tokens": 340 },
  "usage_total": { "input_tokens": 8500, "output_tokens": 2100 }
}
```

**`event.tool_use`**
```json
{
  "session_id": "abc123",
  "tool_name": "Bash",
  "duration_ms": 432
}
```

**`event.user_prompt`**
```json
{
  "session_id": "abc123",
  "prompt_preview": "Implement a login form with…"
}
```

> Tool input/output không được gửi trong payload để tránh lộ thông tin nhạy cảm.

---

## 4. Admin API

Tất cả admin API yêu cầu cookie admin (đăng nhập tại `/admin`).

### List webhooks

```http
GET /api/admin/webhooks
```

**Response:**
```json
{
  "webhooks": [
    {
      "id": "clxxx...",
      "targetUrl": "https://hooks.slack.com/...",
      "description": "Slack #dev-alerts",
      "events": ["session.created", "session.ended"],
      "active": true,
      "createdAt": "2026-03-26T10:00:00.000Z",
      "user": null,
      "deliveryCount": 42,
      "lastDelivery": {
        "status": "success",
        "statusCode": 200,
        "createdAt": "2026-03-26T11:30:00.000Z"
      }
    }
  ]
}
```

### Tạo webhook (admin-global)

```http
POST /api/admin/webhooks
Content-Type: application/json

{
  "targetUrl": "https://your-server.com/webhook",
  "events": ["session.created", "session.ended", "event.tool_use"],
  "description": "Production alert webhook"
}
```

**Response 201:**
```json
{
  "id": "clxxx...",
  "targetUrl": "https://your-server.com/webhook",
  "events": ["session.created", "session.ended", "event.tool_use"],
  "active": true,
  "secret": "whsec_a1b2c3d4e5f6...",
  "createdAt": "2026-03-26T10:00:00.000Z"
}
```

> ⚠️ **`secret` chỉ trả về 1 lần duy nhất.** Lưu lại ngay.

### Cập nhật webhook

```http
PUT /api/admin/webhooks/:id
Content-Type: application/json

{
  "active": false,
  "events": ["session.created"],
  "description": "Updated description"
}
```

### Xóa webhook

```http
DELETE /api/admin/webhooks/:id
```

Response: `204 No Content`

### Test delivery

```http
POST /api/admin/webhooks/:id/test
```

**Response:**
```json
{
  "success": true,
  "statusCode": 200,
  "responseBody": "ok",
  "latencyMs": 143
}
```

### Delivery logs (paginated)

```http
GET /api/admin/webhooks/:id/deliveries?page=1&limit=50&status=failed
```

| Query param | Default | Options |
|---|---|---|
| `page` | `1` | số nguyên dương |
| `limit` | `50` | tối đa `100` |
| `status` | *(tất cả)* | `pending`, `success`, `failed`, `dead_letter` |

### Retry một delivery

```http
POST /api/admin/webhooks/:webhookId/deliveries/:deliveryId/retry
```

---

## 5. User API

User tự quản lý webhook cá nhân (tối đa **5 webhooks/user**). Yêu cầu đăng nhập member (`/login`).

### List webhook của tôi

```http
GET /api/webhooks
```

### Tạo webhook

```http
POST /api/webhooks
Content-Type: application/json

{
  "targetUrl": "https://my-server.com/hook",
  "events": ["session.ended"],
  "description": "My Zapier hook"
}
```

Response 201 trả về `secret` (1 lần duy nhất).

**Giới hạn:**
- Tối đa 5 webhooks/user
- Không thể đăng ký cùng URL 2 lần (409)
- URL phải HTTPS (trong production)

### GET / PUT / DELETE

```http
GET    /api/webhooks/:id
PUT    /api/webhooks/:id    { "active": false, "events": [...] }
DELETE /api/webhooks/:id
```

- Chỉ xem/sửa webhook của chính mình — webhook của người khác trả về `404`

### Test & Delivery logs

```http
POST /api/webhooks/:id/test
GET  /api/webhooks/:id/deliveries?page=1&limit=50&status=success
```

Test bị rate-limit: **5 requests/phút/user**.

---

## 6. Authentication

### Admin API
Đăng nhập tại `/admin`, cookie `admin_session` được set tự động.

```bash
# Login lấy cookie
curl -c cookies.txt -X POST https://vibe-reporter.onebot-training.meobeo.ai/api/admin/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"YOUR_ADMIN_PASSWORD"}'

# Dùng cookie cho các request tiếp theo
curl -b cookies.txt https://vibe-reporter.onebot-training.meobeo.ai/api/admin/webhooks
```

### User API — 3 cách auth

#### Cách 1: Cookie (browser)
Đăng nhập tại `/login`, cookie `user_session` tự động gửi kèm từ browser.

#### Cách 2: Email + UUID (API / programmatic)

```
X-User-Email: user@example.com
X-User-UUID:  <uuid-của-bạn>
```

**Lấy UUID ở đâu?** Xem tại trang `/profile` sau khi login, hoặc từ response `POST /api/auth/register`.

```bash
# List webhooks qua UUID
curl https://vibe-reporter.onebot-training.meobeo.ai/api/webhooks \
  -H 'X-User-Email: user@example.com' \
  -H 'X-User-UUID: 550e8400-e29b-41d4-a716-446655440000'
```

#### Cách 3: Email + Password (API / programmatic)

```
X-User-Email:    user@example.com
X-User-Password: mypassword
```

Dùng khi không có UUID. Chỉ hoạt động khi user đã set password (bcrypt verify).

```bash
# Tạo webhook qua password auth
curl -X POST https://vibe-reporter.onebot-training.meobeo.ai/api/webhooks \
  -H 'Content-Type: application/json' \
  -H 'X-User-Email: user@example.com' \
  -H 'X-User-Password: mypassword' \
  -d '{
    "targetUrl": "https://my-server.com/hook",
    "events": ["session.ended"],
    "description": "My hook"
  }'

# Test delivery
curl -X POST https://vibe-reporter.onebot-training.meobeo.ai/api/webhooks/WEBHOOK_ID/test \
  -H 'X-User-Email: user@example.com' \
  -H 'X-User-Password: mypassword'
```

**Thứ tự ưu tiên:** Cookie → UUID → Password

**Bảo mật:**
- UUID: verify bằng DB lookup + timing-safe email compare
- Password: bcrypt verify, constant-time để chống user enumeration
- Cả UUID và Password đều yêu cầu kèm email — không thể dùng mỗi credentials một mình

---

## 7. Delivery & Retry

| Thông số | Giá trị |
|---|---|
| Max attempts | 5 |
| Backoff | Exponential: 1s → 2s → 4s → 8s → 16s |
| Timeout per attempt | 30 giây |
| Concurrency | 3 deliveries đồng thời |
| Dead letter | Sau 5 lần thất bại → status `dead_letter` |

**Delivery status:**

| Status | Ý nghĩa |
|---|---|
| `pending` | Đã tạo, chưa xử lý |
| `success` | HTTP 2xx nhận được |
| `failed` | HTTP non-2xx hoặc timeout, còn retry |
| `dead_letter` | Hết retry, không giao được |

> **At-least-once delivery:** Endpoint của bạn nên idempotent — dùng `id` field trong payload làm idempotency key.

**Webhook chỉ hoạt động khi Redis available.** Nếu `REDIS_URL` không được set, webhook delivery bị tắt hoàn toàn (không có lỗi, chỉ im lặng).

---

## 8. Test delivery

Dùng curl để test nhanh:

```bash
# Admin test
curl -b cookies.txt -X POST \
  https://vibe-reporter.onebot-training.meobeo.ai/api/admin/webhooks/WEBHOOK_ID/test

# User test
curl -b user-cookies.txt -X POST \
  https://vibe-reporter.onebot-training.meobeo.ai/api/webhooks/WEBHOOK_ID/test
```

Endpoint test phải phản hồi trong **10 giây** (timeout ngắn hơn delivery thật).

---

## 9. Xem delivery logs

```bash
# Last 20 failed deliveries
curl -b cookies.txt \
  "https://vibe-reporter.onebot-training.meobeo.ai/api/admin/webhooks/WEBHOOK_ID/deliveries?limit=20&status=failed"
```

---

## 10. Admin UI

Đăng nhập `/admin` → tab **🔗 Webhooks**:

| Action | Cách dùng |
|---|---|
| Tạo webhook | Nút **+ Tạo Webhook** → điền URL + chọn events → **Tạo** |
| Copy secret | Hiển thị ngay sau khi tạo — nhấn **Copy** rồi **Dismiss** |
| Test | Nút **⚡ Test** → kết quả hiển thị ngay dưới dòng |
| Xem logs | Nút **▼ Logs** → expand 20 deliveries gần nhất |
| Enable/Disable | Nút **Enable** / **Disable** |
| Sửa | Nút **Edit** → prefill form → **Lưu** |
| Xóa | Nút **Delete** → confirm dialog |

---

## 11. Tích hợp Slack / Discord / n8n / Zapier

### Slack Incoming Webhook

1. Tạo Slack App → Incoming Webhooks → copy URL
2. Tạo webhook trong Claude Reporter với URL Slack và events `session.ended`
3. Lưu ý: Slack không verify HMAC — bỏ qua bước verify signature

```javascript
// Express endpoint nhận webhook và forward Slack
app.post('/forward-to-slack', async (req, res) => {
  const event = req.body;
  if (event.type === 'session.ended') {
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `Session ended: ${event.data.object.session_id} — ${event.data.object.usage_total?.output_tokens ?? 0} output tokens`
      }),
    });
  }
  res.sendStatus(200);
});
```

### n8n

1. Tạo **Webhook node** trong n8n → copy URL
2. Tạo webhook trong Claude Reporter với URL n8n
3. n8n nhận payload, dùng `{{ $json.body.type }}` để route logic

### Zapier

1. Tạo **Webhooks by Zapier** → Catch Hook → copy URL
2. Tạo webhook trong Claude Reporter
3. Gửi test để Zapier bắt sample data
4. Xây tiếp workflow (Google Sheets, Slack, Email…)

---

## 12. Troubleshooting

### Webhook không nhận được request

1. Kiểm tra `active: true` và events đúng type
2. Xem delivery logs: `GET /api/admin/webhooks/:id/deliveries`
3. Kiểm tra `REDIS_URL` được set trong docker-compose
4. Xem container logs: `docker logs claude-reporter --tail 50`

### HTTP 400 khi tạo webhook

- URL phải là HTTPS trong production
- URL không được trỏ vào localhost/127.0.0.1/internal IP
- `events` phải là mảng không rỗng với các giá trị hợp lệ

### Signature verify thất bại

- Dùng **raw body** (không parse JSON rồi stringify lại)
- Secret phải đúng với lúc tạo webhook (chỉ hiển thị 1 lần)
- Kiểm tra không có whitespace/newline thừa trong secret

### Dead letter delivery

```bash
# Retry thủ công qua Admin UI: tab Webhooks → Logs → chọn delivery
# Hoặc qua API:
curl -b cookies.txt -X POST \
  https://vibe-reporter.onebot-training.meobeo.ai/api/admin/webhooks/WEBHOOK_ID/deliveries/DELIVERY_ID/retry
```

### Test timeout

Endpoint test có timeout 10 giây — endpoint của bạn phải phản hồi nhanh hơn 10s. Delivery thật có timeout 30 giây.

---

## Appendix: Valid event type list

```
session.created
session.ended
event.tool_use
event.user_prompt
event.assistant_message
stats.daily_summary
token_budget.warning
```

*(Không subscribe `test.ping` — chỉ dùng nội bộ cho test delivery)*
