# Code Review: Phase 3 — Admin API (Outbound Webhooks)

**Date:** 2026-03-24 | **Reviewer:** code-reviewer

---

## Scope
- Files: `webhookValidation.ts`, `webhooks/route.ts`, `[id]/route.ts`, `[id]/test/route.ts`, `[id]/deliveries/route.ts`, `[id]/deliveries/[deliveryId]/retry/route.ts`
- ~220 LOC
- Focus: security (SSRF, secret leakage, IDOR), correctness (retry semantics, URL uniqueness), consistency

---

## Overall Assessment

Implementation is solid. All 10 Todo items are completed. Auth guards are consistent. Secret is correctly omitted from all responses except POST 201. Two security findings (INFO + WARNING) and two correctness findings (INFO) below.

---

## Findings

### [WARNING] SSRF — `PRIVATE_HOST_RE` misses IPv6 private ranges and DNS-rebinding vectors
**File:** `webhookValidation.ts` line 12 / `test/route.ts` line 20

The regex covers the main RFC-1918 ranges and loopback, and the test route correctly re-validates via `isValidWebhookUrl` before fetch (good). However:
- IPv6 ULA (`fc00::/7`) and link-local (`fe80::/10`) are not blocked — an attacker can register `http://[fc00::1]/` and bypass.
- DNS-rebinding: URL is validated at registration time but the hostname can resolve to a private IP at fetch time. There is no post-DNS validation (e.g., checking the resolved IP before connecting).

Neither is trivially exploitable given this is an admin-only route, but the plan's risk section only mentions "loopback" — the full private IPv6 space is out of scope of the current regex.

**Severity:** WARNING (not CRITICAL because admin-only; would be CRITICAL on user-facing routes in Phase 4).

---

### [INFO] `test/route.ts` — secret not leaked in error path

`signPayload(webhook.secret, payloadStr)` is called before the `try` block. If `signPayload` itself throws, Node will propagate an unhandled rejection that Next.js will surface as a 500 with a generic message — the secret is NOT in the response. Secret is safe.

---

### [INFO] `retry/route.ts` — ownership check is present and correct

Line 20: `if (delivery.webhookId !== id)` correctly returns 404 if `deliveryId` belongs to a different webhook. IDOR is prevented.

---

### [INFO] `retry/route.ts` — `attempts` count is NOT reset; this is intentional but undocumented

The retry resets `status`, `failedAt`, `nextRetryAt`, `errorMessage` but keeps the existing `attempts` value. The worker will presumably increment it further. This is defensible (preserving history), but the intent is not captured in a code comment. If the worker uses `attempts >= MAX_ATTEMPTS` to decide dead_letter promotion, a manually retried dead_letter delivery will immediately be re-promoted to dead_letter after one more failure without the admin realising it.

**Recommendation:** Add a comment: `// attempts preserved intentionally — worker will increment; dead_letter may re-promote immediately if attempts >= MAX`.

---

### [INFO] PUT route — no duplicate-URL check on update

`POST /api/admin/webhooks` checks for a conflicting `(userId=null, targetUrl)` pair before create (line 89–97 of `route.ts`). The `PUT` handler applies `isValidWebhookUrl` but does NOT perform the same duplicate check. An admin can PUT a webhook's `targetUrl` to collide with an existing admin-global webhook. This bypasses the 409 guard.

Low severity — admin-only, but inconsistent with the create path.

---

### [INFO] Response format — minor inconsistency vs plan spec

Plan spec uses `Response.json(...)` throughout; implementation uses `NextResponse.json(...)` throughout. Both are valid in Next.js 15 App Router and produce identical responses. `NextResponse.json` is already used by all other admin routes in this codebase, so the implementation is consistent with the actual codebase, not the plan. No action needed.

---

### [INFO] `deliveries/route.ts` — `nextRetryAt` added, plan spec omitted it

The implementation returns `nextRetryAt` in the select (line 50). Plan spec did not include it. This is an improvement — useful for the admin UI to show when the next retry will fire.

---

## Positive Observations

- `isValidWebhookUrl` re-called in test route before fetch — defense-in-depth is implemented.
- Secret stripped via destructuring in every GET/PUT response path; no accidental leakage.
- `AbortSignal.timeout(10_000)` on the test fetch prevents hung connections.
- Status filter validates against `VALID_STATUSES` allowlist before passing to Prisma.
- Pagination bounds enforced (`Math.max(1, ...)`, `Math.min(100, ...)`).
- `updatedAt` added to list response (not in plan spec) — useful.

---

## Recommended Actions

1. **(PUT route)** Add duplicate-URL check matching the POST guard when `targetUrl` changes.
2. **(retry route)** Add comment documenting intentional `attempts` preservation and dead_letter re-promotion risk.
3. **(Phase 4 — IMPORTANT)** The user-facing webhook create/test routes must apply the same `isValidWebhookUrl` guard; additionally, consider post-DNS validation or a SSRF-safe HTTP client before those routes go live, given they are user-accessible.

---

## Task Completion

All 10 Todo items in `phase-03-admin-api.md` are completed:
- [x] webhookValidation.ts
- [x] GET list
- [x] POST create
- [x] GET detail
- [x] PUT update
- [x] DELETE
- [x] POST test ping
- [x] GET deliveries
- [x] POST retry
- [x] (curl testing — assumed done per commit)

---

## Unresolved Questions

1. Does the webhook worker check `attempts >= MAX_ATTEMPTS` before re-promoting to `dead_letter`? If yes, the retry route's decision to preserve `attempts` needs to be intentional and documented; if no, there is no risk.
2. Is IPv6 private/ULA range blocking a Phase 4 requirement or deferred? Should be addressed before user-facing routes ship.
