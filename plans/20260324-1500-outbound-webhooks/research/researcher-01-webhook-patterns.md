# Outbound Webhook Integration Patterns for SaaS Dashboards
**Research Date:** 2026-03-24 | **Sources:** Stripe, GitHub, Hookdeck, Shopify, Svix

---

## 1. Delivery Guarantees & Retry Patterns

**Industry Standard: At-Least-Once Delivery**

All major SaaS platforms (Stripe, GitHub, Shopify) guarantee *at-least-once* delivery, never exactly-once. This requires client-side deduplication.

- **Stripe**: Exponential backoff retries for 3 days in live mode; timestamp tolerance = 5 min default
- **GitHub**: Automatic retries on network/timeout failures; consumers must be idempotent
- **Recommended backoff**: Exponential (e.g., 1s → 2s → 4s → 8s...) capped at 24–72 hours
- **Fast acknowledgment**: Return HTTP 2xx before processing complex logic; queue work asynchronously

---

## 2. Request Signing: HMAC-SHA256

**Stripe Approach (Industry Reference)**

```
Stripe-Signature: t=<timestamp>,v1=<signature>

signed_content = f"{timestamp}.{raw_request_body}"
signature = HMAC-SHA256(signing_secret, signed_content)
```

**Key Points:**
- Extract `t=` (timestamp, epoch seconds) and `v1=` (hex-encoded signature)
- Use **constant-time comparison** (timing attack mitigation)
- Validate timestamp within tolerance window (default 5 min, customize if needed)
- Ignore non-`v1` signature schemes to prevent downgrade attacks
- Use official client libraries (better than manual implementation)
- Optional: IP allowlisting (Stripe publishes IP ranges)

**GitHub & others use similar symmetric HMAC-SHA256 patterns** with webhook secret stored server-side.

---

## 3. Payload Envelope Format

**Universal Webhook Envelope (Stripe/GitHub/Shopify compatible)**

```json
{
  "id": "evt_1234567890",
  "object": "event",
  "api_version": "2025-03-01",
  "created": 1711270800,
  "type": "session.created",
  "data": {
    "object": {
      "id": "sess_xyz",
      "status": "active",
      "token_usage": { "input": 1500, "output": 2000 }
    }
  },
  "request": {
    "id": "req_abc123",
    "idempotency_key": "uuid-v4"
  },
  "livemode": true
}
```

**Format Requirements:**
- Unique event `id` for deduplication (required)
- `type` field for subscriber filtering (e.g., "session.created", "token_usage_updated")
- Immutable `created` timestamp (epoch, UTC)
- `data.object` contains resource state snapshot
- `request.idempotency_key` for client-side dedup (optional but recommended)
- API version for backward compatibility

**Compatibility with Slack/Discord/Zapier:** Include human-readable `type` + flat top-level fields for easy template mapping.

---

## 4. Event Filtering & Subscription Model

**Topic-Based Subscriptions (Recommended)**

Allow users to subscribe per event type:

```
Webhook Topics:
├─ session.created
├─ session.completed
├─ token_usage_updated
├─ event.batch_processed
└─ alert.threshold_exceeded
```

**Implementation:**
- Database: `webhooks(id, url, enabled, secret, created_at, updated_at)`
- Junction table: `webhook_subscriptions(webhook_id, event_type)`
- At delivery time: check enabled flag + matching subscription before sending
- Allow users to toggle individual topics + enable/disable webhook globally
- Filter by message type: only dispatch if event type in user's subscription list

**Advanced:** Field-level filtering (e.g., "alert only when token cost > $50") via JSONPath expressions or rules engine.

---

## 5. Webhook Management UI/UX Patterns

**Essential Features**

| Feature | Rationale |
|---------|-----------|
| **List view** | Show all webhooks with endpoint, status (enabled/disabled), last delivery time, failure count |
| **Create webhook** | Form: URL (HTTPS enforced), event type checkboxes, secret auto-generation |
| **Test delivery** | Send sample event to endpoint without waiting for real event; show response code + body |
| **View delivery logs** | Show last 100+ attempts: timestamp, event type, HTTP status, latency, response preview |
| **Retry failed events** | Manual retry button for recent failures (< 24h old) |
| **Enable/disable toggle** | Pause webhook without deletion; disabled webhooks ignored at dispatch time |
| **Secret rotation** | Generate new secret; provide grace period (e.g., 24h) to accept both old + new |
| **Edit endpoint** | Update URL, subscription topics, description |
| **Delete webhook** | Soft-delete or archive; audit trail preserved |

**Logs Display:**
- Timestamp, event ID, event type, HTTP status, response time, error message
- Filter by status (success/failure/pending), date range, event type
- Search by event ID or endpoint URL

---

## 6. Deduplication & Idempotency (Critical)

**Event ID Tracking (Primary Strategy)**

```sql
CREATE TABLE webhook_events_processed (
  webhook_id UUID,
  event_id VARCHAR(255),
  processed_at TIMESTAMP,
  PRIMARY KEY (webhook_id, event_id)
);

-- On receipt:
INSERT INTO webhook_events_processed (webhook_id, event_id, processed_at)
VALUES (...) ON CONFLICT DO NOTHING;
```

**Idempotency Keys (Conditional Writes)**

- Use `created_at` timestamp to skip outdated retries
- Example: UPDATE session SET token_usage = ? WHERE created_at < ?
- Prevents accidental rollback from late-arriving older events

**Infrastructure-Level Dedup (Svix / Hookdeck):**
- Exact payload match: drop identical retry storms
- Field-based: deduplicate using specific fields (request ID, idempotency key)

---

## 7. Security Hardening Checklist

- ✓ Enforce HTTPS endpoints only
- ✓ Verify HMAC signature + timestamp before processing
- ✓ Use constant-time comparison for signature validation
- ✓ Rate-limit inbound webhook handlers (e.g., 100 req/sec per endpoint)
- ✓ Implement IP allowlisting if publicly listing IP ranges
- ✓ Log all webhook attempts (success + failure) for audit
- ✓ Rotate secrets periodically; support concurrent old + new secret validation
- ✓ Return fast 2xx response; queue work asynchronously

---

## Key Citations

- [Stripe Webhooks Docs](https://docs.stripe.com/webhooks) — HMAC-SHA256 signing, retry strategy
- [How to Implement Webhook Idempotency](https://hookdeck.com/webhooks/guides/implement-webhook-idempotency) — Dedup strategies
- [At-Least-Once vs. Exactly-Once Webhook Delivery Guarantees](https://hookdeck.com/webhooks/guides/webhook-delivery-guarantees) — Delivery models
- [Testing Webhooks Best Practices](https://hookdeck.com/webhooks/guides/testing) — Testing patterns
- [GitHub Webhooks Overview](https://docs.github.com/en/developers/webhooks-and-events/webhooks/about-webhooks) — Event scoping
- [Shopify Webhook Best Practices](https://shopify.dev/docs/apps/build/webhooks/best-practices) — UI/UX + delivery logs
- [Webhook Management UI Guide](https://support.sparkpost.com/momentum/4/web-ui-webhooks) — Management interface patterns

---

## Quick Implementation Roadmap

1. **Phase 1:** Event envelope format + HMAC-SHA256 signing (1–2 days)
2. **Phase 2:** At-least-once delivery + exponential backoff (1 day)
3. **Phase 3:** Event ID dedup + webhook persistence (1 day)
4. **Phase 4:** Topic-based subscription filtering (1 day)
5. **Phase 5:** Management UI + delivery logs (2–3 days)
6. **Phase 6:** Test delivery + secret rotation (1 day)

**Total estimate:** 7–9 days for production-grade webhook system.
