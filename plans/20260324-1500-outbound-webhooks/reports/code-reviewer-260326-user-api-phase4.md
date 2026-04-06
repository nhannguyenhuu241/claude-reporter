# Code Review: Phase 4 — User Webhook API

**Date:** 2026-03-26 | **Reviewer:** code-reviewer subagent

---

## Code Review Summary

### Scope
- Files reviewed: 4 route files + 6 supporting libs
  - `web/src/app/api/webhooks/route.ts` (108 lines)
  - `web/src/app/api/webhooks/[id]/route.ts` (112 lines)
  - `web/src/app/api/webhooks/[id]/test/route.ts` (67 lines)
  - `web/src/app/api/webhooks/[id]/deliveries/route.ts` (59 lines)
  - Supporting: `userAuth.ts`, `webhookValidation.ts`, `webhookSigning.ts`, `webhookPayload.ts`, `webhookEvents.ts`, `rateLimiter.ts`
- Lines of code analyzed: ~500
- Review focus: security, ownership, input validation, SSRF, YAGNI/KISS/DRY

### Overall Assessment

Solid implementation. Auth is on every route. Ownership guard is correct and consistent. Secret never leaks on GET/PUT. SSRF guard applied at both registration (POST) and test delivery. Input validation is thorough. No critical issues found. Three medium issues noted below.

---

### Critical Issues

None.

---

### High Priority Findings

None.

---

### Medium Priority Findings

#### M1 — `status` filter in deliveries not validated against known values

**File:** `web/src/app/api/webhooks/[id]/deliveries/route.ts` line 28-33

```typescript
const status = url.searchParams.get("status") ?? undefined;
const where = {
  webhookId: id,
  ...(status ? { status } : {}),
};
```

Arbitrary string passed directly into Prisma `where.status`. Prisma doesn't throw on an unknown status value — it just returns 0 rows. Not a security risk (it's a read, not injectable), but allows nonsense queries. Known valid values from schema: `pending | success | failed | dead_letter`.

**Impact:** Low — no data leakage, no injection (Prisma parameterizes). But a typo in a client query silently returns empty results with no hint of why.

**Fix:** Validate against the set of known status values and return 400 on invalid input.

---

#### M2 — `description` field has no length cap on PUT or POST

**Files:** `route.ts` line 101, `[id]/route.ts` line 88-90

```typescript
description: typeof description === "string" ? description : null,
```

POST and PUT both accept `description` as any-length string. No `maxLength` guard. A user can store arbitrarily large strings in the DB column (currently `String?` — no `@db.VarChar` limit in schema). Combined with no rate limit on these mutation routes (see M3), this is a mild resource-abuse vector.

**Fix:** Clamp to reasonable max (e.g. 500 chars): `description.slice(0, 500)` or return 400 if over limit.

---

#### M3 — No rate limiting on mutation routes (POST create, POST test)

`checkRateLimit` exists in `rateLimiter.ts` and is used on `/login`. None of the 4 webhook routes call it.

- `POST /api/webhooks` — per-user limit of 5 enforced, but a user could hammer it with 5 concurrent creates to probe timing; also generates a DB write + `generateWebhookSecret()` per call before the count check.
- `POST /api/webhooks/[id]/test` — no rate limit. Each call makes an outbound HTTP request (up to 10s). A user can weaponize this to use the server as an HTTP client to probe external targets rapidly (open-proxy amplification). The SSRF guard blocks internal targets but external endpoints (e.g. slow/large responses) can still be abused.

**Impact:** Test endpoint is the higher concern. 10s timeout × concurrency means one user can sustain many parallel outbound requests.

**Fix for test route:**
```typescript
const allowed = checkRateLimit(`webhook-test:${user.userId}`, 1, { max: 5, refillRate: 2, windowMs: 60_000 });
if (!allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
```

---

### Low Priority Suggestions

#### L1 — `getOwnWebhook` helper not reused in test/deliveries routes

**Files:** `[id]/test/route.ts` lines 19-22 and `[id]/deliveries/route.ts` lines 17-23 both re-implement the same ownership check inline that `[id]/route.ts` centralizes in `getOwnWebhook()`. Not a bug — the check is correct in both places — but violates DRY.

The helper is defined in `[id]/route.ts` and can't be imported from sibling routes without moving it to a shared lib (e.g. `src/lib/webhookAuth.ts`). Both sub-routes do a lighter `select: { userId: true }` variant anyway, which is slightly more efficient. Low priority.

---

#### L2 — `test.ping` subscribable via POST /api/webhooks

`test.ping` is in `WEBHOOK_EVENT_TYPES` and passes `isValidWebhookEventType()`, so users can subscribe their webhook to `test.ping` as a real event type. This is intentional per the comment in `webhookEvents.ts` ("Synthetic event used only by the test-delivery endpoint") but the validation doesn't block it at subscription time. Not harmful today since `test.ping` is never fired from the delivery pipeline, but creates confusion.

**Fix (optional):** Filter `test.ping` out of valid subscription events in POST/PUT validation, or document that it's a no-op subscription.

---

#### L3 — `page` parse doesn't guard against `NaN` + large values

```typescript
const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
```

`parseInt("abc", 10)` returns `NaN`. `Math.max(1, NaN)` returns `NaN`. Then `(NaN - 1) * limit` = `NaN` → Prisma receives `skip: NaN` which coerces to `0` in practice, but this is fragile. Same for `limit` though `Math.min/max` chain handles `NaN` slightly differently. No `isNaN` guard present.

**Fix:** Add `isNaN` check or use `Number()` with fallback: `const page = Math.max(1, Number.isFinite(+rawPage) ? +rawPage : 1)`.

---

### Positive Observations

1. **Ownership guard design is correct**: `getOwnWebhook()` returns 401 vs 404 correctly — 401 on missing session, 404 on wrong owner. No 403 that would leak existence.
2. **Secret stripping is consistent**: All GET and PUT responses destructure `{ secret: _secret, ...safeWebhook }` before returning. POST 201 is the only place it appears.
3. **SSRF re-validation in test route**: `isValidWebhookUrl(webhook.targetUrl)` called again at test time, not just at registration. Correct defense-in-depth.
4. **`events` array validation thorough**: Type-checked as array, non-empty, each element checked via `isValidWebhookEventType()`. Invalid items surfaced in error message.
5. **Response body truncation**: `body.slice(0, 2000)` on test response prevents storing/returning unbounded third-party content.
6. **`AbortSignal.timeout(10_000)`**: Clean 10s timeout on the outbound test fetch.
7. **URL deduplication**: DB-level `@@unique([userId, targetUrl])` + app-level pre-check give clean 409 on duplicate registration.
8. **Deliveries payload excluded from list**: `select` block in deliveries query omits `payload` (the full JSON body), keeping the log endpoint lightweight.
9. **`active` toggle validated as boolean**: `typeof body.active !== "boolean"` check correctly rejects `"true"` strings.

---

### Recommended Actions

1. **(M3, High)** Add rate limit to `POST /api/webhooks/[id]/test` — rate per `userId`, suggest max 5/min.
2. **(M2, Medium)** Cap `description` to ~500 chars in POST and PUT.
3. **(M1, Low)** Validate `status` query param against known values in deliveries route; return 400 on invalid.
4. **(L3, Low)** Add `isNaN` guard on `page`/`limit` parsing.
5. **(L2, Optional)** Exclude `test.ping` from valid subscription event types in POST/PUT validation.

---

### Metrics

- Type Coverage: 100% — all unknowns narrowed before use
- Test Coverage: n/a (no test files shipped with phase)
- Linting Issues: 0 visible
- Security Issues: 0 critical, 0 high, 1 medium (open-proxy abuse via test route)

---

### Task Completeness Verification

All 7 requirements from `phase-04-user-api.md` implemented:

| Requirement | Status |
|---|---|
| GET /api/webhooks | DONE |
| POST /api/webhooks (max 5) | DONE |
| GET /api/webhooks/[id] | DONE |
| PUT /api/webhooks/[id] | DONE |
| DELETE /api/webhooks/[id] | DONE |
| POST /api/webhooks/[id]/test | DONE |
| GET /api/webhooks/[id]/deliveries | DONE |

Success criteria met:
- User can CRUD up to 5 webhooks: YES
- Ownership strictly enforced (404 on wrong user): YES
- Secret returned only on creation: YES
- Delivery logs scoped to own webhooks: YES

---

### Unresolved Questions

1. Is `test.ping` intentionally subscribable, or should it be blocked at subscription time? The comment in `webhookEvents.ts` says "Synthetic event used only by the test-delivery endpoint" but no validation prevents subscribing to it.
2. Phase plan still shows all todos unchecked (`- [ ]`). Should the plan file be updated to reflect completion status?
