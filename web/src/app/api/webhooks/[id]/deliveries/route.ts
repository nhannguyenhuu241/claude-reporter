import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/userAuth";

type Ctx = { params: Promise<{ id: string }> };

// ── GET /api/webhooks/[id]/deliveries ──────────────────────────────────────────
// Paginated delivery log for the current user's webhook.
// Query params: page (default 1), limit (default 50, max 100), status (filter)
export async function GET(req: NextRequest, { params }: Ctx) {
  const user = getUserSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Ownership check
  const webhook = await prisma.webhook.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!webhook || webhook.userId !== user.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const VALID_STATUSES = ["pending", "success", "failed", "dead_letter"] as const;
  type DeliveryStatus = typeof VALID_STATUSES[number];

  const url = new URL(req.url);
  const pageRaw = parseInt(url.searchParams.get("page") ?? "1", 10);
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const page = isNaN(pageRaw) ? 1 : Math.max(1, pageRaw);
  const limit = isNaN(limitRaw) ? 50 : Math.min(100, Math.max(1, limitRaw));
  const statusParam = url.searchParams.get("status");
  const status: DeliveryStatus | undefined =
    statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as DeliveryStatus)
      : undefined;

  if (statusParam && !status) {
    return NextResponse.json(
      { error: `Invalid status. Valid values: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const where = {
    webhookId: id,
    ...(status ? { status } : {}),
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

  return NextResponse.json({ deliveries, total, page, limit });
}
