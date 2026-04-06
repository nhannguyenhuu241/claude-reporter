# Reliable Webhook Delivery: BullMQ + Next.js 15 + Prisma PostgreSQL

## 1. BullMQ Job Patterns for HTTP Delivery

**Retry & Backoff:**
- Exponential backoff via `defaultJobOptions`: `backoff: { type: 'exponential', delay: 1000 }`
- Each retry: `2^(attempts-1) * delay` ms (1s → 2s → 4s → 8s...)
- Optional jitter to avoid thundering herd
- Max retries configurable per job or globally

**Dead-Letter Queue (DLQ):**
```js
const deliveryQueue = new Queue('webhook-delivery', { connection: redis });
const dlQueue = new Queue('webhook-dlq');

// Worker listens for final failures
deliveryQueue.on('failed', async (job, error) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await dlQueue.add('failed-delivery', job.data, { backoff: null });
  }
});
```

**Idempotency:** Use unique job ID based on `webhookId + deliveryId` to prevent duplicate processing.

---

## 2. Prisma Schema Patterns

```prisma
model Webhook {
  id           String   @id @default(cuid())
  targetUrl    String
  secret       String   @db.Text
  events       String[] // ['session.created', 'event.delivered']
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deliveries   WebhookDelivery[]
  userId       String
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, targetUrl])
}

model WebhookDelivery {
  id           String   @id @default(cuid())
  webhookId    String
  webhook      Webhook  @relation(fields: [webhookId], references: [id], onDelete: Cascade)
  eventType    String   // 'session.created'
  payload      Json     @db.JsonB
  timestamp    DateTime @db.Timestamptz
  statusCode   Int?
  responseBody String?  @db.Text
  attempts     Int      @default(0)
  nextRetry    DateTime?
  failedAt     DateTime?
  succeededAt  DateTime?
  createdAt    DateTime @default(now())

  @@index([webhookId, succeededAt])
  @@index([failedAt]) // Find failed deliveries
}
```

**Audit trail:** Add `userId`, `ipAddress` to Webhook for config changes; track delivery history per-event.

---

## 3. Next.js 15 App Router API Routes

**CRUD Webhooks:**
```ts
// app/api/webhooks/route.ts
export async function POST(request: Request) {
  const { userId } = await auth(); // Verify user
  const { targetUrl, events } = await request.json();

  // Validate
  if (!isValidUrl(targetUrl)) throw new BadRequest('Invalid URL');

  const webhook = await prisma.webhook.create({
    data: { userId, targetUrl, events, secret: generateSecret() },
  });

  return Response.json(webhook, { status: 201 });
}

export async function GET(request: Request) {
  const { userId } = await auth();
  const webhooks = await prisma.webhook.findMany({
    where: { userId },
    select: { id: true, targetUrl: true, active: true },
  });
  return Response.json(webhooks);
}
```

**Pattern:** Always await `params` in dynamic routes (Next.js 15 breaking change).

---

## 4. Security: HMAC + Replay Prevention

**Signing (sender):**
```ts
import crypto from 'crypto';

const timestamp = Math.floor(Date.now() / 1000).toString();
const signature = crypto
  .createHmac('sha256', secret)
  .update(`${timestamp}.${JSON.stringify(payload)}`)
  .digest('hex');

// Headers: X-Webhook-Timestamp, X-Webhook-Signature
```

**Verification (receiver):**
```ts
export async function POST(request: Request) {
  const signature = request.headers.get('x-webhook-signature');
  const timestamp = request.headers.get('x-webhook-timestamp');
  const body = await request.text();

  // Replay check: accept only ±300s tolerance
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) {
    return Response.json({ error: 'Timestamp too old' }, { status: 401 });
  }

  // HMAC verification
  const expected = crypto
    .createHmac('sha256', webhook.secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  if (!crypto.timingSafeEqual(signature, expected)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Process...
}
```

**Nonce deduplication (optional):** Store nonce headers in Redis; reject if seen before.

---

## 5. Svix vs BullMQ: Tradeoffs

| Aspect | Svix (SaaS) | BullMQ (Self-Hosted) |
|--------|------------|----------------------|
| **Infra** | Managed; Rust server + PG + Redis | Requires Redis + PG; full control |
| **Reliability** | 99.9% SLA; built-in backoff/retry | Depends on your Redis/infra setup |
| **Cost** | $99–$999/mo + per-webhook | Infra + dev time; no per-API cost |
| **Debugging** | Web dashboard, event replay | Custom monitoring; logs only |
| **TTL** | 30-day event history | Redis expiry (configurable) |
| **Horizontal Scale** | Multi-region out-of-box | Redis cluster + queue replicas (complex) |
| **Setup Time** | 15 min (API + dashboard) | 1–2 weeks (integration + monitoring) |

**Decision:** Use Svix if you need enterprise SLA & white-glove support. Use BullMQ for low-volume internal webhooks, tight control, or cost sensitivity.

---

## Implementation Checklist

- [ ] Set up Redis connection pool (node-redis)
- [ ] Create BullMQ queue with exponential backoff + DLQ
- [ ] Implement Prisma Webhook + WebhookDelivery models with audit fields
- [ ] Build CRUD routes (POST /webhooks, GET /webhooks, DELETE /webhooks/:id)
- [ ] Add HMAC signing + timestamp validation
- [ ] Implement nonce deduplication via Redis
- [ ] Create worker to consume delivery queue
- [ ] Add monitoring: failed delivery alerts, queue depth metrics
- [ ] Write integration tests (fake HTTP server + fixture payloads)

---

## References

- [BullMQ Retry Patterns](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [BullMQ Custom Backoff](https://docs.bullmq.io/bull/patterns/custom-backoff-strategy)
- [BullMQ Dead Letter Queues](https://oneuptime.com/blog/post/2026-01-21-bullmq-dead-letter-queue/view)
- [Prisma Audit Trail with PostgreSQL](https://medium.com/@arjunlall/prisma-audit-trail-guide-for-postgres-5b09aaa9f75a)
- [Next.js 15 Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route)
- [HMAC Webhook Security](https://prismatic.io/blog/how-secure-webhook-endpoints-hmac/)
- [Replay Attack Prevention](https://webhooks.fyi/security/replay-prevention)
- [Webhook Nonce Deduplication](https://dohost.us/index.php/2026/02/15/preventing-replay-attacks-implementing-timestamps-and-nonces-in-webhook-handlers/)
- [Svix Open Source Webhooks](https://github.com/svix/svix-webhooks)
- [Webhook vs Message Queue](https://www.svix.com/resources/faq/webhook-vs-message-queue/)
