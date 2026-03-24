/**
 * BullMQ worker for outbound webhook delivery.
 *
 * Each job fetches the WebhookDelivery record from DB (payload stored there, not Redis),
 * signs the payload with HMAC-SHA256, and POSTs to the configured endpoint.
 *
 * Retry behaviour: 5 attempts with exponential backoff (1s, 2s, 4s, 8s, 16s).
 * After all retries exhausted, delivery is marked as "dead_letter".
 *
 * Concurrency: 3 (webhook HTTP calls are I/O-bound with 30s timeout each).
 */
import { Worker, type Job } from "bullmq";
import { prisma } from "./prisma";
import { signPayload } from "./webhookSigning";
import { WEBHOOK_QUEUE_NAME, WEBHOOK_MAX_ATTEMPTS, type WebhookJobData } from "./webhookQueue";

const TIMEOUT_MS = parseInt(process.env.WEBHOOK_TIMEOUT_MS ?? "30000", 10);

// Block SSRF: only allow public HTTP(S) — reject private/loopback/link-local CIDRs.
// Primary validation happens at registration (Phase 3); this is a defence-in-depth guard.
const PRIVATE_IP_RE =
  /^(localhost|127\.|0\.0\.0\.0|::1|169\.254\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/i;

function isSafeTargetUrl(raw: string): boolean {
  try {
    const { protocol, hostname } = new URL(raw);
    if (protocol !== "http:" && protocol !== "https:") return false;
    if (PRIVATE_IP_RE.test(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function startWebhookWorker(redisUrl: string): Worker<WebhookJobData> {
  const worker = new Worker<WebhookJobData>(
    WEBHOOK_QUEUE_NAME,
    async (job: Job<WebhookJobData>) => {
      const { deliveryId } = job.data;

      const delivery = await prisma.webhookDelivery.findUnique({
        where: { id: deliveryId },
        include: {
          webhook: { select: { targetUrl: true, secret: true, active: true } },
        },
      });

      // Skip silently if webhook was disabled or delivery deleted between enqueue and execution
      if (!delivery || !delivery.webhook.active) return;

      // Defence-in-depth: re-validate URL before every fetch (SSRF guard)
      if (!isSafeTargetUrl(delivery.webhook.targetUrl)) {
        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: { status: "dead_letter", failedAt: new Date(), errorMessage: "Blocked: unsafe target URL" },
        });
        return; // Don't retry — URL is invalid
      }

      const payloadStr = JSON.stringify(delivery.payload);
      const { secret, targetUrl } = delivery.webhook;
      const { signature } = signPayload(secret, payloadStr);

      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Signature": signature,
            "X-Webhook-Event": delivery.eventType,
            "X-Webhook-Delivery": delivery.id,
            "User-Agent": "ClaudeReporter-Webhook/1.0",
          },
          body: payloadStr,
          signal: controller.signal,
        });

        clearTimeout(timer);
        const latency = Date.now() - start;
        const responseBody = await res.text().catch(() => "");

        if (res.ok) {
          await prisma.webhookDelivery.update({
            where: { id: deliveryId },
            data: {
              status: "success",
              statusCode: res.status,
              responseBody: responseBody.slice(0, 2000),
              latencyMs: latency,
              attempts: job.attemptsMade + 1,
              succeededAt: new Date(),
            },
          });
        } else {
          // Non-2xx — record partial info and throw to trigger BullMQ retry
          await prisma.webhookDelivery.update({
            where: { id: deliveryId },
            data: {
              status: "failed",
              statusCode: res.status,
              responseBody: responseBody.slice(0, 2000),
              latencyMs: latency,
              attempts: job.attemptsMade + 1,
            },
          });
          throw new Error(`HTTP ${res.status}: ${responseBody.slice(0, 200)}`);
        }
      } catch (err) {
        clearTimeout(timer);
        const latency = Date.now() - start;
        // Redact secret from error messages before persisting to DB
        const rawMsg = err instanceof Error ? err.message : String(err);
        const msg = rawMsg.replace(secret, "[REDACTED]").slice(0, 500);

        await prisma.webhookDelivery.update({
          where: { id: deliveryId },
          data: {
            status: "failed",
            attempts: job.attemptsMade + 1,
            latencyMs: latency,
            errorMessage: msg,
          },
        });
        throw err; // Re-throw for BullMQ retry
      }
    },
    {
      connection: { url: redisUrl },
      concurrency: 3,
      lockDuration: 45_000,
      stalledInterval: 15_000,
    }
  );

  // Dead-letter: fires on every failure; guard ensures we only act on the final attempt
  worker.on("failed", async (job, err) => {
    if (!job || job.attemptsMade < WEBHOOK_MAX_ATTEMPTS) return;
    try {
      await prisma.webhookDelivery.update({
        where: { id: job.data.deliveryId },
        data: {
          status: "dead_letter",
          failedAt: new Date(),
          errorMessage: (err?.message ?? "Max retries exceeded").slice(0, 500),
        },
      });
    } catch { /* best effort */ }
    console.error(
      `[webhook] webhook=${job.data.webhookId} delivery=${job.data.deliveryId} dead-lettered after ${job.attemptsMade} attempts`
    );
  });

  console.log("[webhook] Webhook delivery worker started (concurrency=3)");
  return worker;
}
