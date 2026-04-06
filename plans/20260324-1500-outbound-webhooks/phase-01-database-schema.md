# Phase 1: Database Schema + Migrations

**Date:** 2026-03-24 | **Status:** DONE | **Est:** 0.5 day | **Completed:** 2026-03-24

---

## Context

- [Existing schema](../../web/prisma/schema.prisma) -- 4 models (Department, User, Session, Event)
- [Research: Prisma patterns](./research/researcher-260324-delivery-implementation.md#2-prisma-schema-patterns)
- [Scout: schema analysis](./scout/scout-01-codebase.md#1-prisma-schema-models)

## Overview

Add `Webhook` and `WebhookDelivery` models to the existing Prisma schema. Webhook stores endpoint config; WebhookDelivery stores delivery attempts for audit/retry.

## Key Insights

- Existing schema uses `@map()` for snake_case DB columns -- maintain convention
- User model has no `webhooks` relation yet -- add it
- `events` field as `String[]` (Postgres array) avoids a junction table; simpler than topic-based join
- WebhookDelivery references both Webhook and a `eventType` string (not FK to Event, since webhook events like `stats.daily_summary` have no Event row)
- Use `cuid()` for IDs to match Prisma convention used in research doc

## Requirements

1. Webhook model: url, secret, events filter, active flag, userId (nullable for admin-global), description
2. WebhookDelivery model: delivery attempt log with status, response, retry tracking
3. Unique constraint: one webhook per (userId, targetUrl) to prevent duplicates
4. Cascade delete: deleting a webhook removes its deliveries
5. Indexes on delivery lookup patterns (webhookId + createdAt, status)

## Architecture

### Prisma Schema Additions

```prisma
model Webhook {
  id          String   @id @default(cuid())
  targetUrl   String   @map("target_url")
  secret      String   @db.Text
  description String?
  events      String[] // ['session.created', 'session.ended', 'event.tool_use', ...]
  active      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  // null = admin-global webhook (fires for all events system-wide)
  // non-null = user-scoped webhook (fires only for that user's sessions)
  userId String? @map("user_id")
  user   User?   @relation(fields: [userId], references: [id], onDelete: Cascade)

  deliveries WebhookDelivery[]

  @@unique([userId, targetUrl])
  @@index([active])
  @@map("webhooks")
}

model WebhookDelivery {
  id           String    @id @default(cuid())
  webhookId    String    @map("webhook_id")
  webhook      Webhook   @relation(fields: [webhookId], references: [id], onDelete: Cascade)

  eventType    String    @map("event_type")    // e.g. "session.created"
  eventId      String    @map("event_id")      // unique event envelope ID (evt_xxx)
  payload      Json      @db.JsonB

  // Delivery status
  status       String    @default("pending")   // pending | success | failed | dead_letter
  statusCode   Int?      @map("status_code")
  responseBody String?   @map("response_body") @db.Text
  errorMessage String?   @map("error_message")

  // Retry tracking
  attempts     Int       @default(0)
  maxAttempts  Int       @default(5) @map("max_attempts")
  nextRetryAt  DateTime? @map("next_retry_at")
  latencyMs    Int?      @map("latency_ms")

  // Timestamps
  createdAt    DateTime  @default(now()) @map("created_at")
  succeededAt  DateTime? @map("succeeded_at")
  failedAt     DateTime? @map("failed_at")

  @@index([webhookId, createdAt])
  @@index([status])
  @@index([eventId])
  @@map("webhook_deliveries")
}
```

### User Model Update

Add webhooks relation to existing User model:

```prisma
model User {
  // ... existing fields ...
  sessions  Session[]
  webhooks  Webhook[]   // NEW
  // ...
}
```

### Supported Event Types (TypeScript enum)

```typescript
// web/src/lib/webhookEvents.ts
export const WEBHOOK_EVENT_TYPES = [
  'session.created',
  'session.ended',
  'event.tool_use',
  'event.assistant_message',
  'event.user_prompt',
  'stats.daily_summary',
  'token_budget.warning',
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number];
```

## Related Code Files

| File | Change |
|------|--------|
| `web/prisma/schema.prisma` | Add Webhook + WebhookDelivery models, update User |
| `web/src/lib/webhookEvents.ts` | NEW -- event type constants |

## Implementation Steps

1. Open `web/prisma/schema.prisma`
2. Add `Webhook` model after `Event` model
3. Add `WebhookDelivery` model after `Webhook`
4. Add `webhooks Webhook[]` to `User` model
5. Create `web/src/lib/webhookEvents.ts` with event type constants
6. Run `npm run db:push` (dev) or `npm run db:migrate` (prod) to apply schema
7. Verify with `npx prisma studio` that tables are created
8. Generate Prisma client: `npx prisma generate`

## Todo

- [ ] Add Webhook model to schema.prisma
- [ ] Add WebhookDelivery model to schema.prisma
- [ ] Add webhooks relation to User model
- [ ] Create webhookEvents.ts constants file
- [ ] Run db:push to apply schema
- [ ] Verify tables in Prisma Studio
- [ ] Generate Prisma client

## Success Criteria

- `npx prisma validate` passes with no errors
- `webhooks` and `webhook_deliveries` tables exist in PostgreSQL
- Prisma client exposes `prisma.webhook` and `prisma.webhookDelivery`
- User model includes `webhooks` relation

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Migration conflicts with existing data | Low | Using `db:push` for dev; `db:migrate` for prod with review |
| Array column not portable to SQLite | N/A | Project committed to PostgreSQL |

## Security Considerations

- `secret` field stored as `@db.Text` -- must be encrypted at rest (DB-level encryption) or application-level encryption in Phase 2
- Secret never returned in API list responses (select-exclude pattern)
- Cascade delete ensures no orphaned delivery logs

## Next Steps

Phase 2: Build the delivery engine that reads Webhook records and dispatches HTTP requests via BullMQ.
