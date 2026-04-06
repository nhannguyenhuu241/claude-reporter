# Phase 2: Webhook Delivery Engine

**Date:** 2026-03-24 | **Status:** DONE | **Est:** 2 days | **Completed:** 2026-03-24

---

## Context

- [Existing BullMQ queue](../../web/src/lib/eventQueue.ts) -- `claude-event-batch` queue pattern
- [Existing worker](../../web/src/lib/eventWorker.ts) -- concurrency=5, exponential backoff
- [Research: HMAC signing](./research/researcher-01-webhook-patterns.md#2-request-signing-hmac-sha256)
- [Research: BullMQ delivery](./research/researcher-260324-delivery-implementation.md#1-bullmq-job-patterns)

## Overview

Create a separate BullMQ queue (`webhook-delivery`) with a dedicated worker that sends HTTP POST requests to webhook endpoints. Includes HMAC-SHA256 signing, exponential backoff retry, and delivery status tracking in PostgreSQL.

## Key Insights

- Reuse existing Redis connection -- no new infra needed
- Separate queue from event processing to avoid blocking inbound pipeline
- Worker concurrency=3 (lower than event worker; webhook HTTP calls are I/O-bound with 30s timeout)
- Job data is minimal (deliveryId + webhookId) -- worker fetches full payload from DB to avoid Redis memory bloat
- HMAC signing follows Stripe convention: `X-Webhook-Signature: t=<ts>,v1=<sig>`

## Requirements

1. BullMQ queue named `webhook-delivery` with exponential backoff (1s base, max 5 attempts)
2. Worker that fetches delivery record, sends HTTP POST, updates status
3. HMAC-SHA256 signing utility (Stripe-style header format)
4. Payload envelope: `{ id, event, created, data: { object } }`
5. Dead-letter handling: mark as `dead_letter` after max attempts
6. Timeout: 30s per HTTP request
7. Graceful shutdown integration with existing server.ts

## Architecture

### Queue Setup

```typescript
// web/src/lib/webhookQueue.ts
import { Queue } from "bullmq";

export const WEBHOOK_QUEUE_NAME = "webhook-delivery";

export interface WebhookJobData {
  deliveryId: string;   // WebhookDelivery.id -- worker fetches full record from DB
  webhookId: string;    // For logging/metrics
  attempt: number;      // Current attempt number (informational)
}

let _queue: Queue<WebhookJobData> | null = null;

export function getWebhookQueue(): Queue<WebhookJobData> | null {
  if (_queue) return _queue;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    _queue = new Queue<WebhookJobData>(WEBHOOK_QUEUE_NAME, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 1_000 }, // 1s, 2s, 4s, 8s, 16s
        removeOnComplete: { count: 500, age: 24 * 3600 },
        removeOnFail: { count: 500, age: 7 * 24 * 3600 },
      },
    });
    return _queue;
  } catch (err) {
    console.warn("[webhook-queue] Failed to init:", err);
    return null;
  }
}
```

### HMAC Signing Utility

```typescript
// web/src/lib/webhookSigning.ts
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Generate Stripe-style webhook signature header.
 * Format: t=<unix_ts>,v1=<hex_hmac>
 * Signed content: "<timestamp>.<json_body>"
 */
export function signPayload(secret: string, payload: string): {
  signature: string;
  timestamp: number;
} {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedContent = `${timestamp}.${payload}`;
  const sig = createHmac("sha256", secret)
    .update(signedContent)
    .digest("hex");
  return {
    signature: `t=${timestamp},v1=${sig}`,
    timestamp,
  };
}

/**
 * Verify webhook signature (for documentation/SDK use).
 * Tolerance: 300s (5 minutes) for replay protection.
 */
export function verifySignature(
  secret: string,
  payload: string,
  signatureHeader: string,
  toleranceSec = 300
): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k, v.join("=")];
    })
  );

  const ts = parseInt(parts.t, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) {
    return false; // Replay or expired
  }

  const expected = createHmac("sha256", secret)
    .update(`${ts}.${payload}`)
    .digest("hex");

  try {
    return timingSafeEqual(Buffer.from(parts.v1, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
```

### Payload Envelope Builder

```typescript
// web/src/lib/webhookPayload.ts
import { randomUUID } from "crypto";
import type { WebhookEventType } from "./webhookEvents";

export interface WebhookEnvelope {
  id: string;              // evt_<uuid>
  object: "event";
  created: number;         // Unix timestamp
  type: WebhookEventType;
  data: {
    object: Record<string, unknown>;
  };
}

export function buildEnvelope(
  eventType: WebhookEventType,
  data: Record<string, unknown>
): WebhookEnvelope {
  return {
    id: `evt_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    created: Math.floor(Date.now() / 1000),
    type: eventType,
    data: { object: data },
  };
}
```

### Worker Implementation

```typescript
// web/src/lib/webhookWorker.ts
import { Worker, Job } from "bullmq";
import { prisma } from "./prisma";
import { signPayload } from "./webhookSigning";
import { WEBHOOK_QUEUE_NAME, type WebhookJobData } from "./webhookQueue";

const TIMEOUT_MS = 30_000;

export function startWebhookWorker(redisUrl: string): Worker<WebhookJobData> {
  const worker = new Worker<WebhookJobData>(
    WEBHOOK_QUEUE_NAME,
    async (job: Job<WebhookJobData>) => {
      const { deliveryId } = job.data;

      // Fetch delivery + webhook from DB
      const delivery = await prisma.webhookDelivery.findUnique({
        where: { id: deliveryId },
        include: { webhook: { select: { targetUrl: true, secret: true, active: true } } },
      });

      if (!delivery || !delivery.webhook.active) {
        // Webhook disabled or delivery deleted -- skip silently
        return;
      }

      const payloadStr = JSON.stringify(delivery.payload);
      const { signature } = signPayload(delivery.webhook.secret, payloadStr);

      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(delivery.webhook.targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
            "X-Webhook-Event": delivery.eventType,
            "X-Webhook-Delivery": delivery.id,
            "User-Agent": "ClaudeReporter-Webhook/1.0",
          },
          body: payloadStr,
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const latency = Date.now() - start;
        const responseBody = await res.text().catch(() => "");

        if (res.ok) {
          await prisma.webhookDelivery.update({
            where: { id: deliveryId },
            data: {
              status: "success",
              statusCode: res.status,
              responseBody: responseBody.slice(0, 2000),
              latencyMs: latency,
              attempts: job.attemptsMade + 1,
              succeededAt: new Date(),
            },
          });
        } else {
          // Non-2xx -- throw to trigger BullMQ retry
          await prisma.webhookDelivery.update({
            where: { id: deliveryId },
            data: {
              statusCode: res.status,
              responseBody: responseBody.slice(0, 2000),
              latencyMs: latency,
              attempts: job.attemptsMade + 1,
            },
          });
          throw new Error(`HTTP ${res.status}: ${responseBody.slice(0, 200)}`);
        }
      } catch (err) {
        clearTimeout(timeout);
        const latency = Date.now() - start;
        const msg = err instanceof Error ? err.message : String(err);

        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            attempts: job.attemptsMade + 1,
            latencyMs: latency,
            errorMessage: msg.slice(0, 500),
          },
        });
        throw err; // Re-throw for BullMQ retry
      }
    },
    {
      connection: { url: redisUrl },
      concurrency: 3,
      lockDuration: 45_000,
      stalledInterval: 15_000,
    }
  );

  // Dead-letter handling: mark delivery as dead_letter after all retries exhausted
  worker.on("failed", async (job, err) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 5)) {
      try {
        await prisma.webhookDelivery.update({
          where: { id: job.data.deliveryId },
          data: {
            status: "dead_letter",
            failedAt: new Date(),
            errorMessage: err?.message?.slice(0, 500) ?? "Max retries exceeded",
          },
        });
      } catch { /* best effort */ }
      console.error(`[webhook] delivery=${job.data.deliveryId} dead-lettered after ${job.attemptsMade} attempts`);
    }
  });

  console.log("[webhook] Webhook delivery worker started (concurrency=3)");
  return worker;
}
```

### Secret Generation Utility

```typescript
// web/src/lib/webhookSecret.ts
import { randomBytes } from "crypto";

/** Generate a 32-byte hex secret (64 chars) for webhook HMAC signing */
export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("hex")}`;
}
```

## Related Code Files

| File | Change |
|------|--------|
| `web/src/lib/webhookQueue.ts` | NEW -- BullMQ queue definition |
| `web/src/lib/webhookWorker.ts` | NEW -- delivery worker |
| `web/src/lib/webhookSigning.ts` | NEW -- HMAC signing/verification |
| `web/src/lib/webhookPayload.ts` | NEW -- envelope builder |
| `web/src/lib/webhookSecret.ts` | NEW -- secret generation |
| `web/server.ts` | MODIFY -- start webhookWorker alongside eventWorker |

## Implementation Steps

1. Create `web/src/lib/webhookQueue.ts` -- queue singleton (mirrors eventQueue.ts pattern)
2. Create `web/src/lib/webhookSigning.ts` -- HMAC sign + verify functions
3. Create `web/src/lib/webhookPayload.ts` -- envelope builder
4. Create `web/src/lib/webhookSecret.ts` -- secret generator
5. Create `web/src/lib/webhookWorker.ts` -- BullMQ worker with HTTP delivery
6. Update `web/server.ts`:
   - Import `startWebhookWorker`
   - Start webhook worker alongside event worker (inside Redis block)
   - Add `webhookWorker?.close()` to graceful shutdown
7. Add env vars to `.env.example`:
   ```
   # Webhook delivery (optional, requires REDIS_URL)
   # WEBHOOK_TIMEOUT_MS=30000
   # WEBHOOK_MAX_RETRIES=5
   ```

## Todo

- [ ] Create webhookQueue.ts
- [ ] Create webhookSigning.ts with sign + verify
- [ ] Create webhookPayload.ts with envelope builder
- [ ] Create webhookSecret.ts
- [ ] Create webhookWorker.ts
- [ ] Update server.ts to start webhook worker
- [ ] Update server.ts graceful shutdown to close webhook worker
- [ ] Add env vars to .env.example
- [ ] Write unit tests for signing utility
- [ ] Write unit tests for payload builder

## Success Criteria

- Webhook worker starts alongside event worker when REDIS_URL is set
- HMAC signature matches Stripe format: `t=<ts>,v1=<hex>`
- Worker retries failed deliveries with exponential backoff (1s, 2s, 4s, 8s, 16s)
- After 5 failed attempts, delivery status set to `dead_letter`
- HTTP timeout at 30s prevents worker stalls
- Graceful shutdown drains webhook worker

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Webhook endpoint slow/unresponsive | Medium | 30s timeout + AbortController |
| Redis memory growth from large payloads | Low | Job stores only deliveryId; payload in PostgreSQL |
| Worker crash during delivery | Low | BullMQ stall detection re-queues; DB delivery record tracks state |

## Security Considerations

- Secrets prefixed `whsec_` for easy identification in logs (no accidental exposure)
- `timingSafeEqual` in verification prevents timing attacks
- Webhook URLs must be HTTPS in production (validated in API layer, Phase 3)
- Response body truncated to 2000 chars to prevent DB bloat from malicious endpoints
- `User-Agent: ClaudeReporter-Webhook/1.0` for endpoint-side identification

## Next Steps

Phase 3: Admin API routes for CRUD operations on webhooks.
