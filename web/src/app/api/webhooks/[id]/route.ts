import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserFromRequest } from "@/lib/userAuth";
import { isValidWebhookUrl } from "@/lib/webhookValidation";
import { isValidWebhookEventType } from "@/lib/webhookEvents";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Fetch the webhook and verify it belongs to the requesting user.
 * Returns 401 if unauthenticated, 404 if not found or not owned.
 * (Intentionally 404 — not 403 — to avoid leaking webhook existence to wrong users.)
 */
async function getOwnWebhook(req: NextRequest, id: string) {
  const user = await getUserFromRequest(req);
  if (!user) return { error: 401 as const, webhook: null, user: null };

  const webhook = await prisma.webhook.findUnique({ where: { id } });
  if (!webhook || webhook.userId !== user.userId) {
    return { error: 404 as const, webhook: null, user: null };
  }

  return { error: null, webhook, user };
}

// ── GET /api/webhooks/[id] ─────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { error, webhook } = await getOwnWebhook(req, id);

  if (error === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (error === 404 || !webhook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { secret: _secret, ...safeWebhook } = webhook; // strip secret
  return NextResponse.json({ webhook: safeWebhook });
}

// ── PUT /api/webhooks/[id] ─────────────────────────────────────────────────────
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { error, webhook } = await getOwnWebhook(req, id);

  if (error === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (error === 404 || !webhook) return NextResponse.json({ error: "Not found" }, { status: 404 });

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
      return NextResponse.json(
        { error: `Invalid event types: ${invalid.join(", ")}` },
        { status: 400 }
      );
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
    if (typeof body.description === "string" && body.description.length > 500) {
      return NextResponse.json({ error: "description must be 500 characters or fewer" }, { status: 400 });
    }
    data.description = typeof body.description === "string" ? body.description : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const updated = await prisma.webhook.update({ where: { id }, data });
  const { secret: _secret, ...safeWebhook } = updated;
  return NextResponse.json({ webhook: safeWebhook });
}

// ── DELETE /api/webhooks/[id] ──────────────────────────────────────────────────
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const { error } = await getOwnWebhook(req, id);

  if (error === 401) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (error === 404) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Cascade deliveries handled by Prisma schema onDelete: Cascade
  await prisma.webhook.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
