/**
 * HMAC-SHA256 webhook signing — Stripe-style format.
 *
 * Signature header: X-Webhook-Signature: t=<unix_ts>,v1=<hex_hmac>
 * Signed content:   "<timestamp>.<json_body>"
 *
 * Verification tolerance: 300s (5 min) to guard against replay attacks.
 */
import { createHmac, timingSafeEqual } from "crypto";

const REPLAY_TOLERANCE_SEC = 300;

/**
 * Sign a JSON payload string. Returns the full header value and timestamp used.
 */
export function signPayload(
  secret: string,
  payload: string
): { signature: string; timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return { signature: `t=${timestamp},v1=${sig}`, timestamp };
}

/**
 * Verify a webhook signature from X-Webhook-Signature header.
 * Returns false if signature is invalid, expired, or malformed.
 * Uses timingSafeEqual to prevent timing side-channel attacks.
 */
export function verifySignature(
  secret: string,
  payload: string,
  signatureHeader: string,
  toleranceSec = REPLAY_TOLERANCE_SEC
): boolean {
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => {
      const [k, ...v] = p.split("=");
      return [k, v.join("=")];
    })
  );

  const ts = parseInt(parts.t, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > toleranceSec) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${ts}.${payload}`)
    .digest("hex");

  // Length pre-check: timingSafeEqual throws if buffers differ in length
  const received = Buffer.from(parts.v1 ?? "", "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (received.length !== expectedBuf.length) return false;

  try {
    return timingSafeEqual(received, expectedBuf);
  } catch {
    return false;
  }
}
