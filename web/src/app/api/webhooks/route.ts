import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/userAuth";
import { generateWebhookSecret } from "@/lib/webhookSecret";
import { isValidWebhookUrl } from "@/lib/webhookValidation";
import { WEBHOOK_EVENT_TYPES, isValidWebhookEventType } from "@/lib/webhookEvents";

const MAX_WEBHOOKS_PER_USER = 5;

// ── GET /api/webhooks ──────────────────────────────────────────────────────────
// List the current user's webhooks (no secret returned).
export async function GET(req: NextRequest) {
  const user = getUserSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

  return NextResponse.json({ webhooks });
}

// ── POST /api/webhooks ─────────────────────────────────────────────────────────
// Create a user-scoped webhook. Max 5 per user.
// Secret returned ONLY in this response — never again.
export async function POST(req: NextRequest) {
  const user = getUserSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Enforce per-user limit
  const count = await prisma.webhook.count({ where: { userId: user.userId } });
  if (count >= MAX_WEBHOOKS_PER_USER) {
    return NextResponse.json(
      { error: `Maximum ${MAX_WEBHOOKS_PER_USER} webhooks per user` },
      { status: 400 }
    );
  }

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
  if (typeof description === "string" && description.length > 500) {
    return NextResponse.json({ error: "description must be 500 characters or fewer" }, { status: 400 });
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

  // Deduplicate: prevent same user registering same URL twice
  const existing = await prisma.webhook.findFirst({
    where: { userId: user.userId, targetUrl },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You already have a webhook registered for this URL" },
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
      userId: user.userId,
    },
  });

  // Secret visible ONLY on create
  return NextResponse.json({ ...webhook, secret }, { status: 201 });
}
