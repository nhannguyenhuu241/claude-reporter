/**
 * Webhook dispatch — glue between processEvent() and the outbound delivery queue.
 *
 * dispatchWebhooks() is called fire-and-forget (void, no await) at the end of
 * each processEvent() case block. It MUST NOT throw — any error is caught and
 * logged so the main event pipeline is never affected.
 *
 * Scoping rules:
 *   - Admin webhooks (userId IS NULL): fire for ALL sessions/events
 *   - User webhooks (userId = X): fire only when the session belongs to user X
 */
import { prisma } from "./prisma";
import { buildEnvelope } from "./webhookPayload";
import { getWebhookQueue } from "./webhookQueue";
import type { WebhookEventType } from "./webhookEvents";

/**
 * Query active webhooks subscribed to `webhookEventType`, create a
 * WebhookDelivery row per match, and enqueue a BullMQ delivery job.
 *
 * @param webhookEventType - Outbound event type (e.g. "session.created")
 * @param sessionId        - Session the event belongs to
 * @param eventData        - Event-specific payload fields (intentionally lean — no secrets)
 * @param sessionUserId    - userId of the session owner (null = anonymous/unlinked)
 */
export async function dispatchWebhooks(
  webhookEventType: WebhookEventType,
  sessionId: string,
  eventData: Record<string, unknown>,
  sessionUserId: string | null
): Promise<void> {
  try {
    const queue = getWebhookQueue();
    if (!queue) return; // No Redis configured — webhook delivery disabled

    // Single query: active webhooks that (a) subscribe to this event type, and
    // (b) are either admin-global (userId IS NULL) or owned by the session owner.
    const webhooks = await prisma.webhook.findMany({
      where: {
        active: true,
        events: { has: webhookEventType },
        OR: [
          { userId: null },
          ...(sessionUserId ? [{ userId: sessionUserId }] : []),
        ],
      },
      select: { id: true },
    });

    if (webhooks.length === 0) return;

    const envelope = buildEnvelope(webhookEventType, {
      session_id: sessionId,
      ...eventData,
    });
    // Prisma Json field requires InputJsonValue — roundtrip through JSON to strip typed refs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payloadJson = JSON.parse(JSON.stringify(envelope)) as any;

    // Create delivery records + enqueue jobs in parallel (per-webhook try/catch
    // ensures one failure doesn't block others)
    await Promise.all(
      webhooks.map(async (webhook) => {
        try {
          const delivery = await prisma.webhookDelivery.create({
            data: {
              webhookId: webhook.id,
              eventType: webhookEventType,
              eventId: envelope.id,
              payload: payloadJson,
              status: "pending",
            },
          });

          await queue.add(
            `deliver-${delivery.id}`,
            { deliveryId: delivery.id, webhookId: webhook.id },
            { jobId: delivery.id } // Unique jobId prevents duplicate enqueue on replay
          );
        } catch (err) {
          // Log per-webhook failures but continue processing other webhooks
          console.error(`[webhook] Failed to enqueue webhook=${webhook.id}:`, err);
        }
      })
    );
  } catch (err) {
    // Top-level catch: never let dispatch errors reach processEvent()
    console.error("[webhook] dispatchWebhooks error:", err);
  }
}
