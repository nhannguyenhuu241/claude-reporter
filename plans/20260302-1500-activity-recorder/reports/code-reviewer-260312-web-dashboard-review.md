# Code Review Summary

## Scope
- Files reviewed: 18 source files across `web/src/app/api/`, `web/src/components/`, `web/src/lib/`
- Key paths: `api/events/route.ts`, `api/events/batch/route.ts`, `api/sessions/route.ts`, `api/sessions/[id]/route.ts`, `api/stats/route.ts`, `api/report/route.ts`, `api/report/team/route.ts`, `api/report/prompt-quality/route.ts`, `api/analyze/route.ts`, `api/admin/login/route.ts`, `api/admin/reset/route.ts`, `api/admin/users/route.ts`, `api/auth/register/route.ts`, `lib/reportUtils.ts`, `lib/rateLimiter.ts`, `lib/adminAuth.ts`, `lib/processEvent.ts`, `components/LiveFeed.tsx`, `app/sessions/[id]/page.tsx`, `app/login/page.tsx`, `app/report/page.tsx`
- Review focus: bugs, security, auth/permission logic, race conditions, memory leaks, data leaks
- Updated plans: none (no plan tasks related to this review)

## Overall Assessment

The codebase is well-structured with clear separation of concerns. Auth primitives (HMAC-signed cookie, UUID-as-token), rate limiting, and idempotent event processing are solid. However there are several meaningful issues ranging from auth bypass vectors to data leaks and React cleanup problems.

---

## Critical Issues

### C1 — `resolveDeptScope` short-circuits on `userId` BEFORE admin check
**File:** `web/src/lib/reportUtils.ts` lines 106-110

```ts
if (userId) {
  const valid = await validateUserId(userId);
  if (!valid) return { userIds: [] };
  return { userIds: [valid] };
}
// No userId → admin sees everything...
if (checkAdminAuth(req)) return { userIds: null };
```

Admin requests that include a `userId` query param are silently scoped to that single user instead of being granted unrestricted access. This is documented as intentional in the comment ("even admins are restricted so the main page shows only personal sessions") but the comment is misleading: it means a logged-in admin visiting `/api/stats?userId=X` sees only user X's data even with a valid admin cookie. The real consequence is that **any public caller who knows a valid user UUID gets scoped access to that user's data from stats/sessions/report without any admin auth** — i.e., by sending `?userId=<any_valid_uuid>` an unauthenticated caller can enumerate any user's tokens, costs, projects, and sessions. `validateUserId` only confirms the UUID exists; it doesn't verify the _caller_ is that user.

**Affected routes:** `GET /api/stats`, `GET /api/sessions`, `GET /api/report`, `GET /api/report/prompt-quality`

### C2 — `GET /api/sessions` exposes all sessions to any caller with a known UUID
**File:** `web/src/app/api/sessions/route.ts` — no auth check, relies entirely on `resolveDeptScope`

Same root as C1. Unauthenticated callers passing `?userId=<uuid>` get a paginated list of session metadata (project paths, timestamps, email addresses) for that user. There is zero verification that the caller _is_ that user.

### C3 — `GET /api/report/team` non-admin path with only `userId` param bypasses dept scope completely
**File:** `web/src/app/api/report/team/route.ts` lines 65-67

```ts
} else if (filterUserId) {
  userFilter = { userId: filterUserId };
}
```

When neither admin nor `deptHeadUuid` is present, any caller can pass `?userId=X` to fetch the full team report (all sessions, all prompts with content) for a specific user. No verification the caller owns that UUID.

---

## High Priority Findings

### H1 — Admin token secret derived from env vars — empty string fallback allows trivially forged tokens
**File:** `web/src/lib/adminAuth.ts` lines 6-8

```ts
function secret(): string {
  return (process.env.ADMIN_PASSWORD ?? "") + (process.env.ADMIN_EMAIL ?? "");
}
```

If `ADMIN_PASSWORD` and `ADMIN_EMAIL` are both unset (e.g., during local dev or a misconfigured deploy), the HMAC secret is `""` — an empty string. An attacker can generate a valid admin token with `createHmac("sha256", "").update(exp).digest("base64url")`. The admin login route (`POST /api/admin/login`) already returns 500 when these vars are unset, but `checkAdminAuth` and `verifyAdminToken` still succeed with an empty secret. Add an explicit check: if secret is empty, always return false.

### H2 — `GET /api/events` returns full `userPrompt` and `assistantMessage` content to unauthenticated caller with any known UUID
**File:** `web/src/app/api/events/route.ts` lines 31, 44-52

The select includes `userPrompt` and `assistantMessage` (full text) plus `session.user.email`. Any caller who knows a valid userId can read the raw contents of all user prompts and AI responses for that user. Highly sensitive.

### H3 — `resolveDeptScope` with `deptHeadUuid` requires `callerId === deptHeadUuid` but both come from query string — trivial to forge
**File:** `web/src/lib/reportUtils.ts` lines 118-121

```ts
const callerId = searchParams.get("callerId");
if (!callerId || callerId !== deptHeadUuid) {
  return { userIds: [], error: "Unauthorized" };
}
```

`callerId` is a query parameter that the client sets to match `deptHeadUuid`. Any caller who knows a dept_head's UUID can set both `deptHeadUuid=X&callerId=X` and get access to the entire department's data. This provides no security over just checking the UUID exists. Same pattern in `api/report/team/route.ts` lines 33-35.

### H4 — `processEvent.ts` retroactive session claiming via `machineId` is racy and unbounded
**File:** `web/src/lib/processEvent.ts` lines 236-247

```ts
await prisma.session.updateMany({
  where: { machineId, userId: null, startedAt: { gte: since } },
  data: { userId: validUserId },
});
```

This runs outside the transaction and outside any lock. If two users share the same machine (e.g., CI server), whichever user sends an event last can claim all prior anonymous sessions on that machine going back 90 days. Also runs on every single event for the life of the session, not just on first-time UUID association — unnecessary DB pressure.

### H5 — `GET /api/sessions/[id]` — session fetched before auth check, leaks timing
**File:** `web/src/app/api/sessions/[id]/route.ts` lines 14-19

The Prisma query runs unconditionally before the auth check. An attacker can use response timing to detect whether a session ID exists even for sessions owned by other users (DB hit vs fast 404). Minor but worth noting.

### H6 — `sessions/[id]/page.tsx` — fetch error not handled; network failure causes silent broken state
**File:** `web/src/app/sessions/[id]/page.tsx` lines 70-81

```ts
fetch(`/api/sessions/${id}${qs}`)
  .then((r) => {
    if (r.status === 404 || r.status === 401) { router.replace("/"); return null; }
    return r.json();
  })
```

Non-404/401 HTTP errors (500, 503, 429) fall through to `.then(data => setSession(data))` where `data` will be a Response object, not a session, causing a render crash. `r.ok` is never checked.

### H7 — `LiveFeed.tsx` — two `useEffect` hooks both depend on `filter` and both create Socket.IO connections; second mount causes double connection
**File:** `web/src/components/LiveFeed.tsx` lines 303-333

The first `useEffect` (line 303) fetches initial events on filter change. The second `useEffect` (line 313) creates a socket and also fires on `filter` change — but the socket setup is independent of filter; the filter only affects the initial HTTP fetch. Each filter toggle creates a new socket connection (old one disconnected by cleanup) which is fine but causes a brief gap where missed events are re-fetched. More importantly, the `mergeEvents` callback in the dependency array (line 333) is stable due to `useCallback`, but the socket `useEffect` depends on `filter` for no reason — the socket doesn't use the filter value. Removing `filter` from the socket effect deps array would avoid unnecessary socket reconnects on filter change.

### H8 — Rate limiter is in-memory only — bypassed by horizontal scaling / multi-process
**File:** `web/src/lib/rateLimiter.ts` — documented as single-process. In the Docker deployment with multiple replicas or PM2 cluster mode, rate limits are per-process. An attacker can exceed per-key limits by round-robining across instances. This is a known architectural gap but important to document.

---

## Medium Priority Improvements

### M1 — `analyze/route.ts` — `reportData` is sent verbatim to Gemini without sanitization of PII
**File:** `web/src/app/api/analyze/route.ts` line 56

`buildPrompt` inlines the full `reportData` JSON (which includes `email` fields, `userPrompt` snippets, project paths) into a prompt sent to an external third-party API. No opt-in consent mechanism, no PII stripping. Depending on deployment context this may violate data privacy obligations.

### M2 — `login/page.tsx` — UUID displayed inline in a `<pre>` block in install command without XSS escaping
**File:** `web/src/app/login/page.tsx` lines 414, 429

```tsx
{`echo '${result.uuid}' > ~/.claude-reporter-uuid`}
```

UUIDs are generated server-side as opaque strings (UUIDs from Prisma default), so injection via UUID content is unlikely in practice. However `result.email` is user-supplied and is displayed without escaping at line 116 (`existingAccount.email[0].toUpperCase()`). React JSX auto-escapes this in normal rendering, so not an XSS risk in React — but the `escapeHtml` util used in the HTML export at `report/page.tsx` line 57 shows the team is aware of the concern. No action needed for React rendering; worth checking the HTML export path.

### M3 — `report/team/route.ts` — prompt content up to 300 chars per prompt is returned in API response to authenticated callers
**File:** `web/src/app/api/report/team/route.ts` lines 184

```ts
wd.prompts.push(prompt.length > 300 ? prompt.slice(0, 300) + "…" : prompt);
```

This is intentional (for the team report UI) but means a dept_head requesting this endpoint gets the actual text of their team members' prompts. If prompts contain sensitive code/PII, this is a data exposure risk. Consider whether prompt text should be redacted for non-admin viewers.

### M4 — `batch/route.ts` — rate limit uses only the first `user_uuid` found in batch
**File:** `web/src/app/api/events/batch/route.ts` lines 27-31

If a batch contains events from multiple users (edge case but possible in relay scenarios), only the first user_uuid is rate-limited. Events from other users in the same batch bypass their own per-user rate limit bucket.

### M5 — `processEvent.ts` — `createEventIdempotent` silently catches all `P2002` errors, not just on `entryUuid`
**File:** `web/src/lib/processEvent.ts` lines 176-181

Any unique constraint violation (e.g., a future column added with unique constraint) is silently swallowed as a "duplicate". This could mask data integrity errors.

### M6 — `resolveDeptScope` — `deptHead.departmentId` null case returns 403 in `team/route.ts` but returns empty `userIds` (no error) in `reportUtils.ts`
**File:** `web/src/lib/reportUtils.ts` line 126 vs `web/src/app/api/report/team/route.ts` line 47

Inconsistent handling: the team route returns a meaningful 403 "dept_head has no department assigned" message; the shared utility silently returns `[]` which gives the caller an empty result with no indication of misconfiguration.

### M7 — `GET /api/report/prompt-quality` — rate limit cost is 5 per call but rate limit default max is 60
**File:** `web/src/app/api/report/prompt-quality/route.ts` line 63

`checkRateLimit(..., 5)` deducts 5 tokens per call from the default 60-token bucket. With 12 calls before exhaustion and 30-token refill per minute, this gives only ~12 calls per minute for the same key. Inconsistent with the 10-call limit on `/api/report` (cost 10). Appears to be a copy-paste error.

---

## Low Priority Suggestions

### L1 — `adminAuth.ts` — HMAC token uses only timestamp as payload; no session binding
**File:** `web/src/lib/adminAuth.ts` lines 11-12

The token contains only an expiry timestamp. Any token valid for a given time window is interchangeable — there's no per-session binding. If a valid token is captured (e.g., from logs), it can be replayed until expiry. Adding a random nonce to the payload would prevent this.

### L2 — `LiveFeed.tsx` — `sessionCacheRef` grows unboundedly
**File:** `web/src/components/LiveFeed.tsx` line 268

`sessionCacheRef.current` accumulates session metadata forever within the component lifecycle. For long-lived sessions (admin dashboard left open for hours), this map could grow large. A simple LRU or max-size eviction would address this.

### L3 — `sessions/[id]/page.tsx` — socket setup race: fetch completes after socket emits `subscribe`
**File:** `web/src/app/sessions/[id]/page.tsx` lines 66-104

The two `useEffect` hooks run independently. If the socket connects and emits events before the fetch completes (extremely rare but possible on fast connections), those events arrive while `session` is still null. The socket handler guards against this (`if (!prev) return prev`) so no crash, but those events are lost rather than buffered.

### L4 — `report/page.tsx` — `escapeHtml` is re-defined locally instead of importing from `lib/reportUtils.ts`
**File:** `web/src/app/report/page.tsx` lines 56-59

`reportUtils.ts` already exports an `escapeHtml`-equivalent? Actually it does not — only `fmt`, `calcCost`, etc. But the function is defined inline in a large client component. Not a bug, just a maintainability note if the function diverges.

### L5 — `rateLimiter.ts` — eviction strategy is FIFO on insertion order, not LRU
**File:** `web/src/lib/rateLimiter.ts` lines 33-35

Under a DDoS with 50,000 unique IPs, the oldest (likely inactive) bucket is evicted, which is reasonable. However legitimate users who registered early could be evicted before attackers who registered recently. LRU eviction would be more fair under adversarial conditions.

### L6 — `GET /api/events` — `afterId` pagination uses `parseInt` with no guard against non-numeric strings beyond `isNaN`
**File:** `web/src/app/api/events/route.ts` lines 25-28

`parseInt("1e5", 10)` returns `1` (not 100000) due to how `parseInt` stops at non-digit chars. The caller likely won't send scientific notation, but `Number(afterRaw)` would be more correct.

---

## Positive Observations

- Timing-safe comparison (`timingSafeEqual`) used correctly in admin login to prevent timing attacks.
- HMAC-signed admin cookie with expiry is a good approach for sessionless admin auth.
- `createEventIdempotent` handles duplicate events correctly via unique constraint.
- The retroactive session-claiming logic for offline machines is a thoughtful UX feature.
- Rate limiting is applied consistently across sensitive routes (register, analyze, admin login).
- `processEvent` correctly wraps token-increment and event-create in a single transaction.
- The `MAX_BUCKETS = 50_000` cap in rateLimiter prevents unbounded memory under DDoS.
- Cursor-based pagination in sessions API handles timestamp collisions correctly.
- `GET /api/sessions/[id]` returns 404 (not 403) for unauthorized access to avoid session ID enumeration.

---

## Recommended Actions

1. **[Critical]** Fix `resolveDeptScope` to check admin auth BEFORE checking userId param, or add explicit caller identity verification (e.g., require a bearer token or signed request that proves the caller owns the UUID).
2. **[Critical]** Add caller ownership verification on `GET /api/sessions`, `GET /api/stats`, `GET /api/report`, `GET /api/report/prompt-quality` — knowing a UUID should not be sufficient to read another user's data.
3. **[High]** In `adminAuth.ts::secret()`, return false / throw if both env vars are unset rather than signing with empty string.
4. **[High]** Remove `userPrompt` and `assistantMessage` from the `GET /api/events` response for non-admin callers, or paginate under the assumption that caller = owner of those events.
5. **[High]** In `sessions/[id]/page.tsx`, add `res.ok` check: `if (!r.ok) throw new Error(r.statusText)`.
6. **[High]** Remove `filter` from the socket `useEffect` deps in `LiveFeed.tsx` to prevent unnecessary reconnects.
7. **[Medium]** Consider stripping email/prompt content before sending to Gemini (`analyze/route.ts`), or add a consent gate.
8. **[Medium]** Fix inconsistent dept head null-department error handling between `resolveDeptScope` and `team/route.ts`.

---

## Metrics
- Type Coverage: Not measured (no tsconfig strict mode failures observed in reviewed files)
- Test Coverage: Not assessed
- Linting Issues: 0 found in reviewed files
- Security findings: 3 Critical, 5 High, 5 Medium, 6 Low

---

## Unresolved Questions

1. Is the `userId` query param intentionally designed as "public scoped access" (the comment says "even admins are restricted") or is this an oversight? If intentional, the threat model needs to be documented clearly.
2. Does the deployment use a single-process server or PM2 cluster? If cluster, the in-memory rate limiter is insufficient and Redis adapter should be enabled for the rate limiter as well.
3. Is there a GDPR/privacy policy covering the fact that user prompts are sent to Google Gemini via `/api/analyze`?
