/**
 * Webhook signing secret generator.
 * Produces a 32-byte (256-bit) cryptographically random secret.
 * Prefixed with "whsec_" for easy identification in logs and config.
 */
import { randomBytes } from "crypto";

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("hex")}`;
}
