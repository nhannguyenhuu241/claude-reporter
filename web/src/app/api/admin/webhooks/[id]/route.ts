import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";
import { isValidWebhookUrl } from "@/lib/webhookValidation";
import { isValidWebhookEventType } from "@/lib/webhookEvents";

type Ctx = { params: Promise<{ id: string }> };

// ── GET /api/admin/webhooks/[id] ───────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const webhook = await prisma.webhook.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true } },
      _count: { select: { deliveries: true } },
    },
  });
  if (!webhook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { secret: _secret, ...safeWebhook } = webhook; // strip secret
  return NextResponse.json({ webhook: safeWebhook });
}

// ── PUT /api/admin/webhooks/[id] ───────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const webhook = await prisma.webhook.findUnique({ where: { id } });
  if (!webhook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { targetUrl?: unknown; events?: unknown; active?: unknown; description?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};

  if (body.targetUrl !== undefined) {
    if (typeof body.targetUrl !== "string" || !isValidWebhookUrl(body.targetUrl)) {
      return NextResponse.json(
        { error: "Invalid URL. Must be HTTPS and not target internal addresses." },
        { status: 400 }
      );
    }
    // Enforce uniqueness for admin-global webhooks on URL change (matches POST guard)
    if (webhook.userId === null && body.targetUrl !== webhook.targetUrl) {
      const conflict = await prisma.webhook.findFirst({
        where: { userId: null, targetUrl: body.targetUrl, NOT: { id } },
      });
      if (conflict) {
        return NextResponse.json(
          { error: "An admin-global webhook with this URL already exists" },
          { status: 409 }
        );
      }
    }
    data.targetUrl = body.targetUrl;
  }

  if (body.events !== undefined) {
    if (!Array.isArray(body.events) || body.events.length === 0) {
      return NextResponse.json({ error: "events must be a non-empty array" }, { status: 400 });
    }
    const invalid = (body.events as unknown[]).filter(
      (e) => typeof e !== "string" || !isValidWebhookEventType(e)
    );
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Invalid event types: ${invalid.join(", ")}` }, { status: 400 });
    }
    data.events = body.events as string[];
  }

  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "active must be a boolean" }, { status: 400 });
    }
    data.active = body.active;
  }

  if (body.description !== undefined) {
    data.description = typeof body.description === "string" ? body.description : null;
  }

  const updated = await prisma.webhook.update({ where: { id }, data });
  const { secret: _secret, ...safeWebhook } = updated;
  return NextResponse.json({ webhook: safeWebhook });
}

// ── DELETE /api/admin/webhooks/[id] ───────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const webhook = await prisma.webhook.findUnique({ where: { id } });
  if (!webhook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.webhook.delete({ where: { id } }); // cascade deletes deliveries
  return NextResponse.json({ ok: true });
}
