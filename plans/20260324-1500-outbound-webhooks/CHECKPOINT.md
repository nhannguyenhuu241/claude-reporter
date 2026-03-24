# Checkpoint — 2026-03-24

## Trạng thái hiện tại

| Phase | Status |
|-------|--------|
| 1 — Database Schema | ✅ DONE — committed `1e062b8` |
| 2 — Delivery Engine | ✅ DONE — committed `1072b1a` |
| 3 — Admin API | ⏳ **CODE DONE, CHƯA COMMIT** — đang chờ user approve để commit |
| 4 — User API | 🔲 Pending |
| 5 — Event Integration | 🔲 Pending |
| 6 — Admin UI | 🔲 Pending |

---

## Phase 3 — Tóm tắt (cần approve + commit)

### Files đã implement (chưa commit):
- `web/src/lib/webhookValidation.ts` — URL validation (IPv4 + IPv6 SSRF guard)
- `web/src/lib/webhookEvents.ts` — thêm `test.ping` event type
- `web/src/lib/webhookWorker.ts` — refactored to use shared `isValidWebhookUrl`
- `web/src/app/api/admin/webhooks/route.ts` — GET list + POST create
- `web/src/app/api/admin/webhooks/[id]/route.ts` — GET detail + PUT update + DELETE
- `web/src/app/api/admin/webhooks/[id]/test/route.ts` — POST test delivery (sync)
- `web/src/app/api/admin/webhooks/[id]/deliveries/route.ts` — GET paginated logs
- `web/src/app/api/admin/webhooks/[id]/deliveries/[deliveryId]/retry/route.ts` — POST retry

### Test results: 10/10 passed, 0 critical issues

### Khi tiếp tục:
1. Nói "approve" hoặc "tiếp tục" → commit Phase 3 → bắt đầu Phase 4
2. Hoặc gõ `/code` → tự động detect và tiếp tục từ Phase 3

---

## Phase 4 — User API (tiếp theo)

Cần implement:
- `GET/POST /api/webhooks` — user tự quản lý webhooks (max 5/user)
- `GET/PUT/DELETE /api/webhooks/[id]`
- `POST /api/webhooks/[id]/test`
- `GET /api/webhooks/[id]/deliveries`

Key differences vs admin:
- Auth: `getUserFromRequest()` thay vì `checkAdminAuth()`
- `userId` = current user (không phải null)
- Max 5 webhooks per user (enforce ở create)
- Ownership guard: chỉ thấy webhook của mình

---

## Phase 5 — Event Integration

Hook `dispatchWebhooks()` vào `processEvent.ts`:
- After session upsert → emit `session.created`
- After session end → emit `session.ended`
- After event created (tool_use, assistant_message, user_prompt) → emit tương ứng
- `dispatchWebhooks()` **không được throw** — wrap try/catch

---

## Phase 6 — Admin UI

Thêm "Webhooks" tab vào `web/src/app/admin/page.tsx`:
- Table: list webhooks với status
- Form: create new webhook
- Test button: gọi POST /[id]/test
- Delivery log expansion

---

## Git status hiện tại

```bash
# Phase 3 files chưa staged:
git status --short
```

Để commit Phase 3 thủ công nếu cần:
```bash
cd web
git add -f src/lib/webhookValidation.ts src/lib/webhookEvents.ts src/lib/webhookWorker.ts
git add src/app/api/admin/webhooks/route.ts
git add "src/app/api/admin/webhooks/[id]/route.ts"
git add "src/app/api/admin/webhooks/[id]/test/route.ts"
git add "src/app/api/admin/webhooks/[id]/deliveries/route.ts"
git add "src/app/api/admin/webhooks/[id]/deliveries/[deliveryId]/retry/route.ts"
```

---

## Deploy note

Khi deploy lên VPS, cần chạy `npm run db:push` để tạo bảng `webhooks` và `webhook_deliveries` trong PostgreSQL.
