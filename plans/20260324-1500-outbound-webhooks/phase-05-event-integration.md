# Phase 5: Integration with Event Pipeline

**Date:** 2026-03-24 | **Status:** Complete | **Est:** 1.5 days | **Reviewed:** 2026-03-26

---

## Context

- [processEvent.ts](../../web/src/lib/processEvent.ts) -- core event handler (288 lines)
- [Webhook queue from Phase 2](./phase-02-delivery-engine.md)
- [Payload builder from Phase 2](./phase-02-delivery-engine.md#payload-envelope-builder)

## Overview

Hook the webhook dispatch logic into `processEvent.ts` so that when events are created (session start, tool use, assistant message, etc.), matching webhooks are queried and delivery jobs are enqueued. This is the glue between the inbound event pipeline and the outbound webhook system.

## Key Insights

- `processEvent()` already handles all event types -- single integration point
- Webhook dispatch must be non-blocking: enqueue job and return, never await HTTP delivery
- Must match webhooks by: (a) event type filter, (b) userId scope (user webhooks fire only for their sessions, admin webhooks fire for all)
- Session lifecycle events (`session.created`, `session.ended`) derived from hook events (`Notification/session_start` and `Stop`)
- Avoid N+1: batch-query matching webhooks once per processEvent call

## Requirements

1. Dispatch function called at end of each event type handler in processEvent()
2. Query active webhooks matching the event type
3. Scope: admin webhooks (userId=null) + user webhooks where userId matches session owner
4. Create WebhookDelivery record + enqueue BullMQ job per matching webhook
5. Non-blocking: fire-and-forget, log errors but never fail the main event processing
6. Event type mapping from internal hook events to webhook event types

## Architecture

### Event Type Mapping

```typescript
// web/src/lib/webhookDispatch.ts

import { prisma } from "./prisma";
import { buildEnvelope, type WebhookEnvelope } from "./webhookPayload";
import { getWebhookQueue } from "./webhookQueue";
import type { WebhookEventType } from "./webhookEvents";

/** Map internal hook events + context to webhook event types */
function mapToWebhookEvent(
  hookEvent: string,
  context: { notifType?: string }
): WebhookEventType | null {
  switch (hookEvent) {
    case "Notification":
      if (context.notifType === "session_start" || context.notifType === "resume_session")
        return "session.created";
      return null;
    case "Stop":
      return "session.ended";
    case "PostToolUse":
      return "event.tool_use";
    case "UserPromptSubmit":
      return "event.user_prompt";
    // PreToolUse intentionally excluded -- too noisy for webhooks
    default:
      return null;
  }
}
```

### Dispatch Function

```typescript
/**
 * Query matching webhooks and enqueue delivery jobs.
 * Called at end of processEvent() -- MUST NOT throw.
 */
export async function dispatchWebhooks(
  webhookEventType: WebhookEventType,
  sessionId: string,
  eventData: Record<string, unknown>,
  sessionUserId: string | null
): Promise<void> {
  try {
    const queue = getWebhookQueue();
    if (!queue) return; // No Redis = no webhook delivery

    // Find active webhooks matching this event type.
    // Admin webhooks (userId IS NULL) fire for all events.
    // User webhooks fire only if session belongs to that user.
    const webhooks = await prisma.webhook.findMany({
      where: {
        active: true,
        events: { has: webhookEventType },
        OR: [
          { userId: null },                            // admin-global
          ...(sessionUserId ? [{ userId: sessionUserId }] : []),
        ],
      },
      select: { id: true },
    });

    if (webhooks.length === 0) return;

    const envelope = buildEnvelope(webhookEventType, eventData);
    const payloadJson = envelope as unknown as Record<string, unknown>;

    // Create delivery records + enqueue jobs in parallel
    await Promise.all(
      webhooks.map(async (webhook) => {
        try {
          const delivery = await prisma.webhookDelivery.create({
            data: {
              webhookId: webhook.id,
              eventType: webhookEventType,
              eventId: envelope.id,
              payload: payloadJson,
              status: "pending",
            },
          });

          await queue.add(
            `deliver-${delivery.id}`,
            {
              deliveryId: delivery.id,
              webhookId: webhook.id,
              attempt: 1,
            },
            { jobId: delivery.id } // Unique job ID prevents duplicate enqueue
          );
        } catch (err) {
          console.error(`[webhook] Failed to enqueue for webhook=${webhook.id}:`, err);
        }
      })
    );
  } catch (err) {
    // Never let webhook dispatch break the main event pipeline
    console.error("[webhook] dispatchWebhooks error:", err);
  }
}
```

### Integration into processEvent.ts

Add webhook dispatch calls at end of each case block. Minimal changes to existing code.

```typescript
// At top of processEvent.ts -- add import
import { dispatchWebhooks } from "./webhookDispatch";
import { mapToWebhookEvent } from "./webhookDispatch";

// Inside case "Notification" (session_start):
if (event) {
  emitEvent("session_started", { sessionId });
  emitEvent("event", { sessionId, event }, `session:${sessionId}`);
  // NEW: dispatch webhooks
  dispatchWebhooks("session.created", sessionId, {
    session_id: sessionId,
    machine_id: machineId,
    project_path: body.cwd ?? null,
    model: body.model ?? null,
    started_at: new Date().toISOString(),
  }, validUserId);
}

// Inside case "Stop":
if (event) {
  emitEvent("event", { sessionId, event, ownerUserId: userUuid });
  emitEvent("event", { sessionId, event, ownerUserId: userUuid }, `session:${sessionId}`);
  if (usage) emitEvent("session_updated", { sessionId });
  // NEW: dispatch webhooks
  dispatchWebhooks("session.ended", sessionId, {
    session_id: sessionId,
    message: message.slice(0, 500),
    usage: usage ?? null,
    usage_total: usageTotal ?? null,
  }, userUuid);
}

// Inside case "PostToolUse":
if (event) {
  emitEvent("event", { sessionId, event }, `session:${sessionId}`);
  emitEvent("session_updated", { sessionId });
  // NEW: dispatch webhooks
  dispatchWebhooks("event.tool_use", sessionId, {
    session_id: sessionId,
    tool_name: body.tool_name ?? null,
    duration_ms: body.tool_duration_ms ?? null,
  }, userUuid);
}

// Inside case "UserPromptSubmit":
if (event) {
  emitEvent("event", { sessionId, event, ownerUserId: userUuid });
  emitEvent("event", { sessionId, event, ownerUserId: userUuid }, `session:${sessionId}`);
  // NEW: dispatch webhooks
  dispatchWebhooks("event.user_prompt", sessionId, {
    session_id: sessionId,
    prompt_preview: prompt.slice(0, 200),
  }, userUuid);
}
```

### Resolving Session Owner for Webhook Scoping

The `userUuid` variable is already available in processEvent() scope. For `Notification` events, need to resolve via ensureSession's validUserId. The simplest approach: pass userUuid through existing variable (already done -- each case has access to `userUuid` from the function parameter parsing at the top).

### Token Budget Warning (Scheduled -- Optional Future Enhancement)

```typescript
// This would be a separate scheduled job, not part of processEvent.
// Placeholder for token_budget.warning -- runs as a cron via BullMQ repeatable job.
// Checks session token totals against configurable thresholds.
// Not included in initial implementation -- YAGNI until users request it.
```

### Daily Summary (Scheduled -- Optional Future Enhancement)

```typescript
// stats.daily_summary would be a daily cron job.
// Aggregates token usage, session counts per user/project.
// Not included in initial implementation -- YAGNI.
```

## Related Code Files

| File | Change |
|------|--------|
| `web/src/lib/webhookDispatch.ts` | NEW -- dispatch logic + event type mapping |
| `web/src/lib/processEvent.ts` | MODIFY -- add dispatchWebhooks calls in 4 case blocks |

## Implementation Steps

1. Create `web/src/lib/webhookDispatch.ts` with `dispatchWebhooks()` and `mapToWebhookEvent()`
2. Add import to `processEvent.ts`
3. Add `dispatchWebhooks()` call in `Notification` case (session.created)
4. Add `dispatchWebhooks()` call in `Stop` case (session.ended)
5. Add `dispatchWebhooks()` call in `PostToolUse` case (event.tool_use)
6. Add `dispatchWebhooks()` call in `UserPromptSubmit` case (event.user_prompt)
7. Test end-to-end: create webhook via admin API, trigger event, verify delivery

## Todo

- [x] Create webhookDispatch.ts
- [x] Add dispatchWebhooks to Notification/session_start handler
- [x] Add dispatchWebhooks to Stop handler
- [x] Add dispatchWebhooks to PostToolUse handler
- [x] Add dispatchWebhooks to UserPromptSubmit handler
- [x] Test: webhook fires on session.created
- [x] Test: webhook fires on session.ended
- [x] Test: webhook fires on event.tool_use
- [x] Test: user-scoped webhook only fires for own sessions
- [x] Test: admin webhook fires for all sessions

## Success Criteria

- Webhook delivery jobs are enqueued within processEvent() without blocking event processing
- Admin webhooks (userId=null) fire for all matching events regardless of session owner
- User webhooks fire only for events from their own sessions
- dispatchWebhooks never throws -- errors logged but event pipeline unaffected
- No measurable latency increase on processEvent() hot path (<5ms overhead)

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Webhook query adds latency to processEvent | Medium | Query is simple indexed lookup; non-blocking enqueue |
| Too many webhooks cause queue flooding | Low | Practical limit: <50 webhooks total, <10 events/sec |
| dispatchWebhooks error crashes processEvent | Prevented | Top-level try/catch, never re-throws |

## Security Considerations

- Event payloads deliberately truncated (prompt_preview: 200 chars, message: 500 chars) to limit data exposure
- Tool input/output NOT included in webhook payload (too large, potential secrets)
- Session owner ID resolved from existing auth flow, not from webhook config

## Unresolved Questions

1. Should `event.assistant_message` be a separate webhook event type from `session.ended`? Currently Stop maps to session.ended only. Could add assistant_message as distinct type if consumers need per-message webhooks.
2. Should `PreToolUse` events trigger webhooks? Excluded for now (too noisy), but some consumers may want "tool started" notifications.

## Next Steps

Phase 6: Build the admin UI tab for webhook management.
