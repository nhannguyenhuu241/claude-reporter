# Phase 4: User API Routes

**Date:** 2026-03-24 | **Status:** Complete | **Est:** 1 day | **Completed:** 2026-03-26

---

## Context

- [User auth system](../../web/src/lib/userAuth.ts) -- `getUserSession()` cookie-based
- [Admin API patterns from Phase 3](./phase-03-admin-api.md)
- User model already has `webhooks Webhook[]` relation from Phase 1

## Overview

Authenticated users manage their own webhooks. User webhooks fire only for events tied to their sessions (userId match). Max 5 webhooks per user. Subset of admin functionality -- no access to other users' webhooks or global admin webhooks.

## Key Insights

- Uses `getUserSession(req)` from existing user auth (not admin auth)
- User webhooks always have `userId` set -- scoped to their sessions only
- Simpler than admin API: no access to global webhooks, no delivery retry (keep it lean)
- Secret shown once on create, same pattern as admin API

## Requirements

1. `GET /api/webhooks` -- list current user's webhooks
2. `POST /api/webhooks` -- create webhook (max 5 per user)
3. `GET /api/webhooks/[id]` -- webhook detail (own only)
4. `PUT /api/webhooks/[id]` -- update (own only)
5. `DELETE /api/webhooks/[id]` -- delete (own only)
6. `POST /api/webhooks/[id]/test` -- test delivery
7. `GET /api/webhooks/[id]/deliveries` -- delivery logs (own only)

## Architecture

### Route File Structure

```
web/src/app/api/webhooks/
  route.ts                       # GET (list), POST (create)
  [id]/
    route.ts                     # GET, PUT, DELETE
    test/
      route.ts                   # POST (test)
    deliveries/
      route.ts                   # GET (logs)
```

### Auth Guard Pattern

```typescript
// Reused in every handler
function requireUser(req: NextRequest) {
  const session = getUserSession(req);
  if (!session) return null;
  return session;
}
```

### Create Webhook (POST /api/webhooks)

```typescript
export async function POST(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Enforce per-user limit
  const count = await prisma.webhook.count({ where: { userId: user.userId } });
  if (count >= 5) {
    return Response.json({ error: "Maximum 5 webhooks per user" }, { status: 400 });
  }

  const body = await req.json();
  if (!isValidWebhookUrl(body.targetUrl)) {
    return Response.json({ error: "Invalid URL" }, { status: 400 });
  }

  const invalid = (body.events ?? []).filter(
    (e: string) => !WEBHOOK_EVENT_TYPES.includes(e as WebhookEventType)
  );
  if (invalid.length > 0) {
    return Response.json({ error: `Invalid events: ${invalid.join(", ")}` }, { status: 400 });
  }

  const secret = generateWebhookSecret();
  const webhook = await prisma.webhook.create({
    data: {
      targetUrl: body.targetUrl,
      secret,
      events: body.events ?? [],
      description: body.description ?? null,
      userId: user.userId,
    },
  });

  return Response.json({ ...webhook, secret }, { status: 201 });
}
```

### Ownership Guard (for [id] routes)

```typescript
// Shared helper for all /api/webhooks/[id]/* routes
async function getOwnWebhook(req: NextRequest, id: string) {
  const user = getUserSession(req);
  if (!user) return { error: 401 as const, webhook: null, user: null };

  const webhook = await prisma.webhook.findUnique({ where: { id } });
  if (!webhook || webhook.userId !== user.userId) {
    return { error: 404 as const, webhook: null, user: null };
  }

  return { error: null, webhook, user };
}
```

### List (GET /api/webhooks)

```typescript
export async function GET(req: NextRequest) {
  const user = requireUser(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const webhooks = await prisma.webhook.findMany({
    where: { userId: user.userId },
    select: {
      id: true,
      targetUrl: true,
      description: true,
      events: true,
      active: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { deliveries: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ webhooks });
}
```

## Related Code Files

| File | Change |
|------|--------|
| `web/src/app/api/webhooks/route.ts` | NEW -- user list + create |
| `web/src/app/api/webhooks/[id]/route.ts` | NEW -- user detail + update + delete |
| `web/src/app/api/webhooks/[id]/test/route.ts` | NEW -- user test delivery |
| `web/src/app/api/webhooks/[id]/deliveries/route.ts` | NEW -- user delivery logs |

## Implementation Steps

1. Create `web/src/app/api/webhooks/route.ts` with GET + POST
2. Create `web/src/app/api/webhooks/[id]/route.ts` with GET + PUT + DELETE (ownership-guarded)
3. Create `web/src/app/api/webhooks/[id]/test/route.ts` -- test delivery (reuse signPayload)
4. Create `web/src/app/api/webhooks/[id]/deliveries/route.ts` -- paginated logs
5. Test auth flow: ensure non-authed requests get 401, wrong-user gets 404

## Todo

- [x] Implement GET /api/webhooks (list own)
- [x] Implement POST /api/webhooks (create, max 5)
- [x] Implement GET /api/webhooks/[id] (own only)
- [x] Implement PUT /api/webhooks/[id] (own only)
- [x] Implement DELETE /api/webhooks/[id] (own only)
- [x] Implement POST /api/webhooks/[id]/test
- [x] Implement GET /api/webhooks/[id]/deliveries
- [x] Test ownership guard (user A cannot see user B's webhooks) — integration test passed

## Success Criteria

- User can CRUD up to 5 webhooks via API
- Ownership strictly enforced: 404 on attempts to access other users' webhooks
- Secret returned only once on creation
- Delivery logs scoped to own webhooks

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| User creates many webhooks to abuse system | Low | Hard limit of 5 per user |
| User targets internal services via webhook URL | Medium | Same SSRF validation as admin API |

## Security Considerations

- All routes use `getUserSession(req)` -- no access without valid user cookie
- Ownership check on every [id] route -- prevents horizontal privilege escalation
- Per-user webhook limit prevents resource abuse
- SSRF protection shared with admin validation (Phase 3)
- Secret shown once; user must store it

## Next Steps

Phase 5: Wire webhook dispatch into the event processing pipeline.
