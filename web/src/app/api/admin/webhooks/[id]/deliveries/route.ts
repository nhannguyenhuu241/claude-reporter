import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";

type Ctx = { params: Promise<{ id: string }> };

// ── GET /api/admin/webhooks/[id]/deliveries ────────────────────────────────────
// Paginated delivery logs for a webhook. Optional ?status= filter.
export async function GET(req: NextRequest, { params }: Ctx) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const webhook = await prisma.webhook.findUnique({ where: { id }, select: { id: true } });
  if (!webhook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const status = url.searchParams.get("status") ?? undefined;

  const VALID_STATUSES = ["pending", "success", "failed", "dead_letter"];
  if (status && !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const where = { webhookId: id, ...(status && { status }) };

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
        nextRetryAt: true,
      },
    }),
    prisma.webhookDelivery.count({ where }),
  ]);

  return NextResponse.json({ deliveries, total, page, limit, pages: Math.ceil(total / limit) });
}
