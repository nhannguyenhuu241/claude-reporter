import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";
import { getWebhookQueue } from "@/lib/webhookQueue";

type Ctx = { params: Promise<{ id: string; deliveryId: string }> };

// ── POST /api/admin/webhooks/[id]/deliveries/[deliveryId]/retry ────────────────
// Manually re-enqueue a failed or dead_letter delivery.
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, deliveryId } = await params;

  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: { id: true, webhookId: true, status: true },
  });

  if (!delivery) return NextResponse.json({ error: "Delivery not found" }, { status: 404 });
  if (delivery.webhookId !== id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const RETRYABLE = ["failed", "dead_letter"];
  if (!RETRYABLE.includes(delivery.status)) {
    return NextResponse.json(
      { error: `Delivery is not retryable (status: ${delivery.status})` },
      { status: 409 }
    );
  }

  // Reset delivery status to pending. `attempts` is intentionally preserved for audit history.
  // BullMQ worker dead-letters based on its own attemptsMade counter (reset per-job),
  // not on the DB `attempts` field, so retried jobs get the full 5-attempt budget.
  await prisma.webhookDelivery.update({
    where: { id: deliveryId },
    data: { status: "pending", failedAt: null, nextRetryAt: null, errorMessage: null },
  });

  const queue = getWebhookQueue();
  if (!queue) {
    return NextResponse.json(
      { error: "Queue unavailable (no Redis). Cannot retry." },
      { status: 503 }
    );
  }

  await queue.add("retry", { deliveryId: delivery.id, webhookId: delivery.webhookId });

  return NextResponse.json({ ok: true, deliveryId });
}
