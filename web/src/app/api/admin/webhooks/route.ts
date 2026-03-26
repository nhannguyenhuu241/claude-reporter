import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";
import { generateWebhookSecret } from "@/lib/webhookSecret";
import { isValidWebhookUrl } from "@/lib/webhookValidation";
import { WEBHOOK_EVENT_TYPES, isValidWebhookEventType } from "@/lib/webhookEvents";

// ── GET /api/admin/webhooks ────────────────────────────────────────────────────
// List all webhooks (admin-global and user-scoped) with delivery stats.
export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const webhooks = await prisma.webhook.findMany({
    include: {
      user: { select: { id: true, email: true } },
      _count: { select: { deliveries: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch last delivery status per webhook (N+1 acceptable — admin-only, <100 webhooks expected)
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
        updatedAt: w.updatedAt,
        user: w.user, // null = admin-global
        deliveryCount: w._count.deliveries,
        lastDelivery,
        // secret intentionally omitted
      };
    })
  );

  return NextResponse.json({ webhooks: result });
}

// ── POST /api/admin/webhooks ───────────────────────────────────────────────────
// Create an admin-global webhook (userId = null, fires for all sessions).
// Secret is returned ONLY in this response — never again.
export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { targetUrl?: unknown; events?: unknown; description?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { targetUrl, events, description } = body;

  if (typeof targetUrl !== "string" || !targetUrl) {
    return NextResponse.json({ error: "targetUrl is required" }, { status: 400 });
  }
  if (!isValidWebhookUrl(targetUrl)) {
    return NextResponse.json(
      { error: "Invalid URL. Must be HTTPS and not target internal addresses." },
      { status: 400 }
    );
  }
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json(
      { error: `events must be a non-empty array. Valid types: ${WEBHOOK_EVENT_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  const invalidEvents = (events as unknown[]).filter(
    (e) => typeof e !== "string" || !isValidWebhookEventType(e)
  );
  if (invalidEvents.length > 0) {
    return NextResponse.json(
      { error: `Invalid event types: ${invalidEvents.join(", ")}` },
      { status: 400 }
    );
  }

  // Enforce uniqueness for admin-global (userId=null) webhooks — PostgreSQL NULL != NULL
  const existing = await prisma.webhook.findFirst({
    where: { userId: null, targetUrl },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An admin-global webhook with this URL already exists" },
      { status: 409 }
    );
  }

  const secret = generateWebhookSecret();
  const webhook = await prisma.webhook.create({
    data: {
      targetUrl,
      secret,
      events: events as string[],
      description: typeof description === "string" ? description : null,
      userId: null, // admin-global
    },
  });

  // Secret visible ONLY on create
  return NextResponse.json({ ...webhook, secret }, { status: 201 });
}
