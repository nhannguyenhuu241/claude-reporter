import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession } from "@/lib/userAuth";
import { signPayload } from "@/lib/webhookSigning";
import { buildEnvelope } from "@/lib/webhookPayload";
import { isValidWebhookUrl } from "@/lib/webhookValidation";
import { checkRateLimit } from "@/lib/rateLimiter";

type Ctx = { params: Promise<{ id: string }> };

// ── POST /api/webhooks/[id]/test ───────────────────────────────────────────────
// Sends a synchronous test.ping delivery to the configured endpoint.
// Returns the HTTP response immediately for debugging.
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = getUserSession(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Rate limit: 5 test calls per user per minute (each call triggers outbound HTTP)
  if (!checkRateLimit(`webhook-test:${user.userId}`, 1, { max: 5, refillRate: 5, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many test requests. Try again in a minute." }, { status: 429 });
  }

  const webhook = await prisma.webhook.findUnique({ where: { id } });
  if (!webhook || webhook.userId !== user.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Re-validate URL before sending (SSRF guard)
  if (!isValidWebhookUrl(webhook.targetUrl)) {
    return NextResponse.json({ error: "Blocked: unsafe target URL" }, { status: 400 });
  }

  const envelope = buildEnvelope("test.ping", {
    message: "This is a test webhook delivery from Claude Reporter.",
    webhook_id: webhook.id,
    timestamp: new Date().toISOString(),
  });

  const payloadStr = JSON.stringify(envelope);
  const { signature } = signPayload(webhook.secret, payloadStr);

  const start = Date.now();
  try {
    const res = await fetch(webhook.targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Event": "test.ping",
        "X-Webhook-Delivery": envelope.id,
        "User-Agent": "ClaudeReporter-Webhook/1.0",
      },
      body: payloadStr,
      signal: AbortSignal.timeout(10_000), // 10s timeout for test
    });

    const body = await res.text().catch(() => "");
    return NextResponse.json({
      success: res.ok,
      statusCode: res.status,
      responseBody: body.slice(0, 2000),
      latencyMs: Date.now() - start,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    });
  }
}
