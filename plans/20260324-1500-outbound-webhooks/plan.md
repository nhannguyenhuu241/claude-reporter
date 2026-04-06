# Outbound Webhook / Integration API - Implementation Plan

**Date:** 2026-03-24 | **Status:** COMPLETE ✓ — all 6 phases done (2026-03-26) | **Est. effort:** 8-10 days

---

## Overview

Add outbound webhook system to claude-reporter web dashboard. Users/admins configure HTTP endpoints to receive real-time events (session lifecycle, tool usage, token budgets). Compatible with Slack, Discord, Zapier, n8n.

## Architecture

```
processEvent() ─────────────────────────────────────┐
  (existing event pipeline)                         │
                                                    ▼
                                          dispatchWebhooks()
                                                    │
                                    ┌───────────────┤
                                    ▼               ▼
                              BullMQ Queue    Prisma WebhookDelivery
                            "webhook-delivery"    (audit log)
                                    │
                                    ▼
                            webhookWorker.ts
                              (HTTP POST + HMAC sign)
                                    │
                            ┌───────┴────────┐
                            ▼                ▼
                        Success          Retry (exp backoff, max 5)
                            │                │
                            ▼                ▼
                     Update delivery    Dead letter after max
```

## Phases

| Phase | File | Summary | Status |
|-------|------|---------|--------|
| 1 | [phase-01-database-schema.md](./phase-01-database-schema.md) | Prisma `Webhook` + `WebhookDelivery` models | DONE ✓ (2026-03-24) |
| 2 | [phase-02-delivery-engine.md](./phase-02-delivery-engine.md) | BullMQ queue, worker, HMAC signing | DONE ✓ (2026-03-24) |
| 3 | [phase-03-admin-api.md](./phase-03-admin-api.md) | `/api/admin/webhooks` CRUD + test + logs | DONE ✓ (2026-03-26) |
| 4 | [phase-04-user-api.md](./phase-04-user-api.md) | `/api/webhooks` self-service for authed users | DONE ✓ (2026-03-26) |
| 5 | [phase-05-event-integration.md](./phase-05-event-integration.md) | Hook into `processEvent.ts` dispatch | DONE ✓ (2026-03-26) |
| 6 | [phase-06-admin-ui.md](./phase-06-admin-ui.md) | "Webhooks" tab in admin dashboard | DONE ✓ (2026-03-26) |

## Key Decisions

- **BullMQ over Svix** -- reuses existing Redis infra, no SaaS cost, full control
- **Stripe-style HMAC** -- `X-Webhook-Signature: t=<ts>,v1=<sig>` for industry compat
- **At-least-once delivery** -- consumers must be idempotent (standard practice)
- **User + Admin webhooks** -- admins manage global webhooks, users manage their own
- **Event subscriptions** -- stored as `String[]` on Webhook model (no junction table; KISS)

## Dependencies

- Redis (already required for BullMQ event queue)
- PostgreSQL (existing)
- No new npm packages needed (BullMQ + crypto already available)

## Research

- [Webhook Patterns](./research/researcher-01-webhook-patterns.md)
- [Delivery Implementation](./research/researcher-260324-delivery-implementation.md)
- [Codebase Scout](./scout/scout-01-codebase.md)
