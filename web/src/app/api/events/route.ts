import { NextRequest, NextResponse } from "next/server";
import { processEvent } from "@/lib/processEvent";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimiter";
import { checkAdminAuth } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  const isAdmin = checkAdminAuth(req);
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? undefined;

  // Non-admin must supply a valid userId (their own UUID = their auth token)
  if (!isAdmin) {
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 200);
  const afterRaw = searchParams.get("after");
  // Use Number() instead of parseInt to reject strings like "123abc" that parseInt silently truncates
  const afterId = afterRaw ? (Number.isInteger(Number(afterRaw)) ? Number(afterRaw) : undefined) : undefined;

  const where: Record<string, unknown> = {};
  if (afterId && !isNaN(afterId)) where.id = { gt: afterId };

  // Admin can filter by userId optionally; non-admin is always scoped to their own userId
  if (userId) where.session = { userId };

  const events = await prisma.event.findMany({
    where,
    orderBy: { id: "desc" },
    take: limit,
    select: {
      id: true,
      sessionId: true,
      eventType: true,
      timestamp: true,
      toolName: true,
      userPrompt: true,
      assistantMessage: true,
      session: {
        select: {
          projectPath: true,
          userId: true,
          user: { select: { email: true } },
        },
      },
    },
  });

  return NextResponse.json({ events });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!(body.session_id as string)) {
    return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
  }

  // Rate limit by user_uuid (or fallback to session_id) — 60 events/min per key
  const rateLimitKey = (body.user_uuid as string) || (body.session_id as string);
  if (!checkRateLimit(rateLimitKey)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // BUG-17: Validate hook_event_name is a string
  if (body.hook_event_name !== undefined && typeof body.hook_event_name !== "string") {
    return NextResponse.json({ error: "Invalid hook_event_name" }, { status: 400 });
  }

  // BUG-02: Validate user_uuid exists in DB if provided
  const userUuid = body.user_uuid;
  if (userUuid !== undefined && userUuid !== null) {
    if (typeof userUuid !== "string") {
      return NextResponse.json({ error: "Invalid user_uuid" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { id: userUuid }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ error: "Invalid user_uuid" }, { status: 403 });
    }
  }

  try {
    await processEvent(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[events] Error processing hook:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
