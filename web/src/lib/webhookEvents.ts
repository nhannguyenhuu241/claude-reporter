/**
 * Supported outbound webhook event types.
 * Stored as String[] on the Webhook model (Postgres array).
 */

export const WEBHOOK_EVENT_TYPES = [
  "session.created",
  "session.ended",
  "event.tool_use",
  "event.assistant_message",
  "event.user_prompt",
  "stats.daily_summary",
  "token_budget.warning",
  "test.ping", // Synthetic event used only by the test-delivery endpoint
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Validate that a string is a known webhook event type */
export function isValidWebhookEventType(value: string): value is WebhookEventType {
  return (WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}
