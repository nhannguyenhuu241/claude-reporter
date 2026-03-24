/**
 * Webhook payload envelope builder.
 *
 * Produces a universal JSON envelope compatible with Zapier, n8n, Make.com:
 * { id, object, created, type, data: { object: <event_data> } }
 *
 * The `id` field (evt_<uuid>) serves as an idempotency key for consumers.
 */
import { randomUUID } from "crypto";
import type { WebhookEventType } from "./webhookEvents";

export interface WebhookEnvelope {
  id: string; // evt_<uuid> — unique per delivery attempt
  object: "event";
  created: number; // Unix timestamp (seconds)
  type: WebhookEventType;
  data: {
    object: Record<string, unknown>;
  };
}

export function buildEnvelope(
  eventType: WebhookEventType,
  data: Record<string, unknown>
): WebhookEnvelope {
  return {
    id: `evt_${randomUUID().replace(/-/g, "")}`,
    object: "event",
    created: Math.floor(Date.now() / 1000),
    type: eventType,
    data: { object: data },
  };
}
