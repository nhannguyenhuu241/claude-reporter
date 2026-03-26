import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";
import { signPayload } from "@/lib/webhookSigning";
import { buildEnvelope } from "@/lib/webhookPayload";
import { isValidWebhookUrl } from "@/lib/webhookValidation";

type Ctx = { params: Promise<{ id: string }> };

// ── POST /api/admin/webhooks/[id]/test ─────────────────────────────────────────
// Sends a synthetic test.ping to the webhook endpoint synchronously.
// Returns real HTTP status for immediate feedback in the admin UI.
export async function POST(req: NextRequest, { params }: Ctx) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const webhook = await prisma.webhook.findUnique({ where: { id } });
  if (!webhook) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isValidWebhookUrl(webhook.targetUrl)) {
    return NextResponse.json({ error: "Webhook URL is invalid or blocked" }, { status: 400 });
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
      signal: AbortSignal.timeout(10_000),
    });

    const responseBody = await res.text().catch(() => "");
    return NextResponse.json({
      success: res.ok,
      statusCode: res.status,
      responseBody: responseBody.slice(0, 2000),
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
