import { NextRequest, NextResponse } from "next/server";
import { processEvent } from "@/lib/processEvent";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100"), 200);
  const afterId = searchParams.get("after") ? parseInt(searchParams.get("after")!) : undefined;
  const userId = searchParams.get("userId") ?? undefined;

  const where: Record<string, unknown> = {};
  if (afterId) where.id = { gt: afterId };
  if (userId) {
    where.session = { userId };
  }

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
