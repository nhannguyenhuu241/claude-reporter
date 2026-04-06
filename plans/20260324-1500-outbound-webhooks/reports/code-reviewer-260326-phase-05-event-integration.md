# Code Review — Phase 5: Event Integration

**Date:** 2026-03-26
**Reviewer:** code-reviewer agent
**Plan:** `plans/20260324-1500-outbound-webhooks/phase-05-event-integration.md`

---

## Scope

| File | LOC | Status |
|---|---|---|
| `web/src/lib/webhookDispatch.ts` | 90 | NEW |
| `web/src/lib/processEvent.ts` | 307 | MODIFIED (+16 lines) |

Supporting files verified (read-only): `webhookQueue.ts`, `webhookPayload.ts`, `webhookEvents.ts`, `webhookWorker.ts`

TypeScript: `npx tsc --noEmit` — **0 errors**

---

## Overall Assessment

Implementation is clean, correct, and minimal. All 4 dispatch calls wired. Non-blocking pattern is sound. Scoping logic is correct. Payload is lean with no secret leakage. One medium correctness deviation from the plan (session_id duplication in envelope), two low-priority observations.

---

## Critical Issues

**None.**

---

## High Priority Findings

**None.**

---

## Medium Priority Improvements

### M1 — `session_id` duplicated inside `data.object`

**File:** `processEvent.ts` lines 92–95, 115–117, 176–180, 198–203
**File:** `webhookDispatch.ts` line 53

`dispatchWebhooks()` already merges `{ session_id: sessionId, ...eventData }` into the envelope's `data.object` at line 53. The call sites in `processEvent.ts` do **not** pass `session_id` in `eventData` (checked: `event.tool_use`, `event.user_prompt` call sites omit it; `session.created` and `session.ended` also omit it). This is **correct** — `session_id` is added exactly once inside `dispatchWebhooks`. No duplication today.

However, the plan's architecture snippet (lines 159, 172, 183, 193 of plan) showed `session_id` being passed in `eventData` *and* added inside dispatch — that pattern would duplicate it. The implementation correctly resolved this by adding it centrally in dispatch. Good.

Status: **No bug** — just confirming the divergence from the plan spec is intentional and correct.

---

### M2 — `payloadJson` cast via `JSON.parse(JSON.stringify(...))` is correct but lint-suppressed

**File:** `webhookDispatch.ts` line 58

```typescript
const payloadJson = JSON.parse(JSON.stringify(envelope)) as any;
```

Necessary to satisfy Prisma's `InputJsonValue` constraint. The `// eslint-disable-next-line` comment is present. Pattern is acceptable but `as any` is broad. Lower risk here since `payloadJson` only flows into `prisma.webhookDelivery.create({ data: { payload: payloadJson } })` — the DB write sanitizes the type boundary.

No action required, noting for awareness.

---

### M3 — `session.ended` payload includes `usage` and `usage_total` objects — confirm no token secrets

**File:** `processEvent.ts` lines 176–180

```typescript
void dispatchWebhooks("session.ended", sessionId, {
  message: message.slice(0, 500),
  usage: usage ?? null,
  usage_total: usageTotal ?? null,
}, userUuid);
```

`usage` and `usage_total` are token counters only (`input_tokens`, `output_tokens`, `cache_*`). No prompt text, API keys, or user data. This is intentional and acceptable per the security design. Token counts in webhook payloads are low-risk.

No action required.

---

## Low Priority Suggestions

### L1 — `mapToWebhookEvent()` from plan not implemented (YAGNI applied correctly)

The plan's architecture showed a `mapToWebhookEvent()` helper function but the implementation inlines the mapping at each call site. This is simpler and more readable given only 4 sites. YAGNI applied correctly — no helper needed.

### L2 — `getWebhookQueue()` is a lazy singleton; queue init failure returns null silently

**File:** `webhookQueue.ts` line 42 — on Redis connect failure, `_queue` stays null and `getWebhookQueue()` returns null *on first call* (no caching of the failure). If Redis is intermittently unavailable, each `dispatchWebhooks()` call retries queue init. This is the same pattern as `eventQueue.ts` and is intentional. At scale, if Redis flaps, every processEvent call pays a failed-connection overhead. Non-critical for current load (<10 events/sec per plan risk assessment).

---

## Specific Answers to Review Questions

### 1. Non-blocking pattern — is `void fn()` correct?

**Yes.** `void dispatchWebhooks(...)` is correct. The `void` operator discards the returned Promise, making it fire-and-forget. Unhandled rejection: `dispatchWebhooks` has a top-level `try/catch` (lines 32–89) that swallows all errors. The only way an unhandled rejection could escape is if the `async function` itself threw synchronously before the try block — impossible since `try` wraps line 33 (first statement). Pattern is safe.

### 2. userId scoping — OR clause correctness

```typescript
OR: [
  { userId: null },
  ...(sessionUserId ? [{ userId: sessionUserId }] : []),
]
```

**Correct.** When `sessionUserId` is null (anonymous session), the spread is empty and the OR reduces to `[{ userId: null }]` — only admin webhooks fire, which is correct (no user to scope to). When `sessionUserId` is a real UUID, both admin and user-owned webhooks match. The conditional spread avoids passing `{ userId: null }` twice.

One edge case worth noting: if a webhook row has `userId = null` it is treated as admin-global. The Prisma schema must enforce that only admin-created webhooks can have `userId = null`. Reviewed `phase-03-admin-api.md` is not in scope here, but the dispatch logic itself is sound given correct data.

### 3. Payload — sensitive data leakage

Checked all 4 call sites:

| Event | Payload fields |
|---|---|
| `session.created` | `machine_id`, `project_path`, `model`, `started_at` |
| `session.ended` | `message` (500 char truncated), `usage`, `usage_total` |
| `event.tool_use` | `tool_name`, `duration_ms` |
| `event.user_prompt` | `prompt_preview` (200 char truncated) |

`tool_input` and `tool_output` are **excluded** — correct per plan's security considerations. Prompt is truncated to 200 chars. Message to 500 chars. No API keys, secrets, or full tool I/O in any payload. **Clean.**

Note: `project_path` (cwd) is included in `session.created`. This leaks filesystem paths to webhook receivers. Acceptable for a developer tool — users who configure webhooks understand they're receiving session metadata. No action required but worth documenting.

### 4. processEvent integration — are 4 calls in the right place?

Verified each:

| Hook event | Guard | Webhook event type | Correct? |
|---|---|---|---|
| `Notification/session_start` | `if (event)` line 195 | `session.created` | **Yes** |
| `Stop` | `if (event)` line 171 | `session.ended` | **Yes** |
| `PostToolUse` | `if (event)` line 87 | `event.tool_use` | **Yes** |
| `UserPromptSubmit` | `if (event)` line 110 | `event.user_prompt` | **Yes** |

All calls are inside `if (event)` guards, meaning dispatch only fires for new (non-duplicate) events. Correct. Replay/idempotent re-delivery of existing events will not trigger duplicate webhook dispatches.

`PreToolUse` correctly excluded (no dispatch call) per plan.

### 5. Performance — latency on hot path

`dispatchWebhooks` is called as `void` — it does **not** block `processEvent` from returning. The Prisma webhook query + delivery create + BullMQ enqueue all run asynchronously after `processEvent` completes.

However, `dispatchWebhooks` internally does:
1. `prisma.webhook.findMany` — one indexed query
2. `Promise.all(webhooks.map(...))` — N × (prisma.create + queue.add) in parallel

None of this is on the critical path (not awaited). If Redis is unavailable, `getWebhookQueue()` returns null immediately and the function exits. **No latency impact on processEvent hot path.**

Caveat: if the Prisma connection pool is saturated (heavy load), the fire-and-forget dispatch still consumes pool connections. At the stated <10 events/sec, this is negligible.

### 6. Critical security/correctness issues

**None found.** The implementation is correct, non-blocking, and safe. The deviation from plan (no `mapToWebhookEvent` helper, `session_id` centralized in dispatch) are improvements over the plan spec.

---

## Positive Observations

- Top-level try/catch + per-webhook inner try/catch is excellent defensive layering — one bad webhook row never blocks others.
- `jobId: delivery.id` in `queue.add` prevents duplicate BullMQ jobs on replay — well-thought-out.
- The `if (!queue) return` early exit correctly handles Redis-unavailable case with zero overhead.
- `select: { id: true }` on webhook query — minimal DB fetch, not loading secret/URL needlessly at dispatch time (they're fetched in the worker).
- `JSON.parse(JSON.stringify(envelope))` is the correct solution for Prisma's `InputJsonValue` constraint — avoids a typed cast that could break on Prisma version updates.

---

## Task Completeness Verification

From `phase-05-event-integration.md` TODO list:

- [x] Create webhookDispatch.ts
- [x] Add dispatchWebhooks to Notification/session_start handler
- [x] Add dispatchWebhooks to Stop handler
- [x] Add dispatchWebhooks to PostToolUse handler
- [x] Add dispatchWebhooks to UserPromptSubmit handler
- [ ] Test: webhook fires on session.created — **not verified** (no automated test found)
- [ ] Test: webhook fires on session.ended — **not verified**
- [ ] Test: webhook fires on event.tool_use — **not verified**
- [ ] Test: user-scoped webhook only fires for own sessions — **not verified**
- [ ] Test: admin webhook fires for all sessions — **not verified**

All implementation tasks complete. Test tasks not done — consistent with checkpoint commit note "Phases 4-6 pending."

---

## Recommended Actions

1. **[Low] Proceed to Phase 6** — implementation is correct and safe, no blockers.
2. **[Low] Add integration test** covering userId scoping (admin vs user webhook) before production deploy — the OR query logic is the highest-value test target.
3. **[Info] Document `project_path` in webhook payload spec** — receivers see filesystem paths; surface this in Phase 6 admin UI docs.

---

## Metrics

- Type errors: **0** (tsc --noEmit clean)
- Linting issues: 1 suppressed `@typescript-eslint/no-explicit-any` (justified)
- Security issues: **0**
- Critical/High findings: **0**
- Implementation tasks complete: **5/5**
- Test tasks complete: **0/5**

---

## Unresolved Questions (from plan, still open)

1. Should `event.assistant_message` be a distinct webhook type separate from `session.ended`? Currently Stop → `session.ended` only. Consumers needing per-message webhooks would need a new event type.
2. Should `PreToolUse` events trigger webhooks? Excluded as "too noisy" — reasonable default, but tool-start notifications have legitimate use cases (e.g., approval workflows).
