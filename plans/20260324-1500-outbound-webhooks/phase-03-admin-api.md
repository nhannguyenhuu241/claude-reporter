# Phase 3: Admin API Routes

**Date:** 2026-03-24 | **Status:** Complete | **Est:** 1.5 days

---

## Context

- [Existing admin auth](../../web/src/lib/adminAuth.ts) -- `checkAdminAuth()` cookie-based
- [Existing admin routes](../../web/src/app/api/admin/) -- users, departments, projects, queue
- [Scout: admin API patterns](./scout/scout-01-codebase.md#5-admin-api-routes)

## Overview

CRUD API for admin-managed webhooks. Admins can create global webhooks (userId=null) that fire for all system events, view delivery logs, test endpoints, and retry failed deliveries.

## Key Insights

- Follow existing admin route pattern: `checkAdminAuth(req)` guard at top of each handler
- Admin webhooks have `userId: null` -- they fire for ALL sessions/events system-wide
- Secret is auto-generated on create, never returned in list responses (only on create)
- Test delivery sends a synthetic `test.ping` event to verify endpoint connectivity

## Requirements

1. `GET /api/admin/webhooks` -- list all webhooks (admin + user)
2. `POST /api/admin/webhooks` -- create admin-global webhook
3. `GET /api/admin/webhooks/[id]` -- single webhook detail
4. `PUT /api/admin/webhooks/[id]` -- update webhook (url, events, active, description)
5. `DELETE /api/admin/webhooks/[id]` -- delete webhook + cascade deliveries
6. `POST /api/admin/webhooks/[id]/test` -- send test ping event
7. `GET /api/admin/webhooks/[id]/deliveries` -- paginated delivery logs
8. `POST /api/admin/webhooks/[id]/deliveries/[deliveryId]/retry` -- manual retry single delivery

## Architecture

### Route File Structure

```
web/src/app/api/admin/webhooks/
  route.ts                           # GET (list), POST (create)
  [id]/
    route.ts                         # GET (detail), PUT (update), DELETE
    test/
      route.ts                       # POST (test delivery)
    deliveries/
      route.ts                       # GET (paginated logs)
      [deliveryId]/
        retry/
          route.ts                   # POST (manual retry)
```

### List Webhooks (GET /api/admin/webhooks)

```typescript
// Returns all webhooks with delivery stats
export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return unauthorized();

  const webhooks = await prisma.webhook.findMany({
    include: {
      user: { select: { id: true, email: true } },
      _count: { select: { deliveries: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Augment with last delivery status
  const result = await Promise.all(
    webhooks.map(async (w) => {
      const lastDelivery = await prisma.webhookDelivery.findFirst({
        where: { webhookId: w.id },
        orderBy: { createdAt: "desc" },
        select: { status: true, statusCode: true, createdAt: true },
      });
      return {
        id: w.id,
        targetUrl: w.targetUrl,
        description: w.description,
        events: w.events,
        active: w.active,
        createdAt: w.createdAt,
        user: w.user,                    // null = admin-global
        deliveryCount: w._count.deliveries,
        lastDelivery,
      };
    })
  );

  return Response.json({ webhooks: result });
}
```

### Create Webhook (POST /api/admin/webhooks)

```typescript
interface CreateBody {
  targetUrl: string;
  events: string[];
  description?: string;
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return unauthorized();
  const body: CreateBody = await req.json();

  // Validate URL
  if (!isValidWebhookUrl(body.targetUrl)) {
    return Response.json({ error: "Invalid URL. HTTPS required." }, { status: 400 });
  }

  // Validate event types
  const invalid = body.events.filter((e) => !WEBHOOK_EVENT_TYPES.includes(e));
  if (invalid.length > 0) {
    return Response.json({ error: `Invalid event types: ${invalid.join(", ")}` }, { status: 400 });
  }

  const secret = generateWebhookSecret();
  const webhook = await prisma.webhook.create({
    data: {
      targetUrl: body.targetUrl,
      secret,
      events: body.events,
      description: body.description ?? null,
      userId: null, // admin-global
    },
  });

  // Return secret ONLY on create -- never again
  return Response.json({
    ...webhook,
    secret, // Visible only this one time
  }, { status: 201 });
}
```

### Test Delivery (POST /api/admin/webhooks/[id]/test)

```typescript
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAdminAuth(req)) return unauthorized();
  const { id } = await params;

  const webhook = await prisma.webhook.findUnique({ where: { id } });
  if (!webhook) return Response.json({ error: "Not found" }, { status: 404 });

  const envelope = buildEnvelope("test.ping" as WebhookEventType, {
    message: "This is a test webhook delivery from Claude Reporter.",
    webhook_id: webhook.id,
    timestamp: new Date().toISOString(),
  });

  // Deliver synchronously (not via queue) for immediate feedback
  const payloadStr = JSON.stringify(envelope);
  const { signature } = signPayload(webhook.secret, payloadStr);

  const start = Date.now();
  try {
    const res = await fetch(webhook.targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": "test.ping",
        "User-Agent": "ClaudeReporter-Webhook/1.0",
      },
      body: payloadStr,
      signal: AbortSignal.timeout(10_000), // 10s for test
    });

    const body = await res.text().catch(() => "");
    return Response.json({
      success: res.ok,
      statusCode: res.status,
      responseBody: body.slice(0, 2000),
      latencyMs: Date.now() - start,
    });
  } catch (err) {
    return Response.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    });
  }
}
```

### Delivery Logs (GET /api/admin/webhooks/[id]/deliveries)

```typescript
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAdminAuth(req)) return unauthorized();
  const { id } = await params;
  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 100);
  const status = url.searchParams.get("status"); // optional filter

  const where = {
    webhookId: id,
    ...(status && { status }),
  };

  const [deliveries, total] = await Promise.all([
    prisma.webhookDelivery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        eventType: true,
        eventId: true,
        status: true,
        statusCode: true,
        attempts: true,
        latencyMs: true,
        errorMessage: true,
        createdAt: true,
        succeededAt: true,
        failedAt: true,
      },
    }),
    prisma.webhookDelivery.count({ where }),
  ]);

  return Response.json({ deliveries, total, page, limit });
}
```

### URL Validation Helper

```typescript
// web/src/lib/webhookValidation.ts
export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // HTTPS required in production, allow HTTP in dev
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      return false;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    // Block internal/loopback addresses
    const host = parsed.hostname.toLowerCase();
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host)) {
      return process.env.NODE_ENV !== "production";
    }
    return true;
  } catch {
    return false;
  }
}
```

## Related Code Files

| File | Change |
|------|--------|
| `web/src/app/api/admin/webhooks/route.ts` | NEW -- list + create |
| `web/src/app/api/admin/webhooks/[id]/route.ts` | NEW -- detail + update + delete |
| `web/src/app/api/admin/webhooks/[id]/test/route.ts` | NEW -- test delivery |
| `web/src/app/api/admin/webhooks/[id]/deliveries/route.ts` | NEW -- delivery logs |
| `web/src/app/api/admin/webhooks/[id]/deliveries/[deliveryId]/retry/route.ts` | NEW -- retry |
| `web/src/lib/webhookValidation.ts` | NEW -- URL validation |

## Implementation Steps

1. Create `web/src/lib/webhookValidation.ts` -- URL validator
2. Create `web/src/app/api/admin/webhooks/route.ts` -- GET (list) + POST (create)
3. Create `web/src/app/api/admin/webhooks/[id]/route.ts` -- GET + PUT + DELETE
4. Create `web/src/app/api/admin/webhooks/[id]/test/route.ts` -- synchronous test
5. Create `web/src/app/api/admin/webhooks/[id]/deliveries/route.ts` -- paginated logs
6. Create retry route for manual re-queuing of failed deliveries
7. Test all routes via curl/Postman against admin auth

## Todo

- [x] Create webhookValidation.ts
- [x] Implement GET /api/admin/webhooks (list all)
- [x] Implement POST /api/admin/webhooks (create)
- [x] Implement GET /api/admin/webhooks/[id] (detail)
- [x] Implement PUT /api/admin/webhooks/[id] (update)
- [x] Implement DELETE /api/admin/webhooks/[id] (delete)
- [x] Implement POST /api/admin/webhooks/[id]/test (test ping)
- [x] Implement GET /api/admin/webhooks/[id]/deliveries (logs)
- [x] Implement POST retry endpoint
- [x] Test with curl against live admin session
<!-- Review: code-reviewer-260324-admin-api-phase3.md — 2 open items: PUT duplicate-URL check, retry attempts comment -->

## Success Criteria

- Admin can CRUD webhooks via API
- Secret returned only on create, never on subsequent GETs
- Test delivery returns real HTTP status from endpoint
- Delivery logs are paginated and filterable by status
- All routes reject unauthenticated requests with 401

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| SSRF via webhook URL | Medium | URL validation blocks internal/loopback in production |
| N+1 query on list with lastDelivery | Low | Acceptable for admin-only route; <100 webhooks expected |

## Security Considerations

- All routes guarded by `checkAdminAuth(req)`
- SSRF protection: block localhost, 127.0.0.1, internal IPs in production
- Secret never returned after creation (only on POST 201 response)
- Response body from test truncated to 2000 chars
- Rate limiting inherited from existing admin middleware

## Next Steps

Phase 4: User-facing API for self-service webhook management.
