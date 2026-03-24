/**
 * BullMQ queue for outbound webhook delivery.
 *
 * Mirrors eventQueue.ts pattern: lazy singleton, returns null when Redis unavailable.
 * API routes call getWebhookQueue() to enqueue jobs after creating a WebhookDelivery row.
 * The Worker (consumer) is started once in server.ts alongside the event worker.
 *
 * Job data is minimal (deliveryId only) — full payload is fetched from DB by the worker
 * to avoid storing large JSONB blobs in Redis memory.
 */
import { Queue } from "bullmq";

export const WEBHOOK_QUEUE_NAME = "webhook-delivery";
export const WEBHOOK_MAX_ATTEMPTS = 5; // 1s, 2s, 4s, 8s, 16s backoff

export interface WebhookJobData {
  deliveryId: string; // WebhookDelivery.id — worker fetches full record from DB
  webhookId: string; // For logging/metrics without an extra DB round-trip
}

let _queue: Queue<WebhookJobData> | null = null;

export function getWebhookQueue(): Queue<WebhookJobData> | null {
  if (_queue) return _queue;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    _queue = new Queue<WebhookJobData>(WEBHOOK_QUEUE_NAME, {
      connection: { url: redisUrl },
      defaultJobOptions: {
        attempts: WEBHOOK_MAX_ATTEMPTS,
        backoff: { type: "exponential", delay: 1_000 }, // 1s → 2s → 4s → 8s → 16s
        removeOnComplete: { count: 500, age: 24 * 3600 },
        removeOnFail: { count: 500, age: 7 * 24 * 3600 },
      },
    });
    return _queue;
  } catch (err) {
    console.warn("[webhook-queue] Failed to init:", err);
    return null;
  }
}
