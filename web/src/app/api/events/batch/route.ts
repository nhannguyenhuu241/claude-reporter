import { NextRequest, NextResponse } from "next/server";
import { processEvent } from "@/lib/processEvent";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimiter";

const MAX_BATCH_SIZE = 100;

export async function POST(req: NextRequest) {
  let body: { events?: Record<string, unknown>[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const events = body.events;
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, errors: 0 });
  }

  if (events.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` }, { status: 400 });
  }

  // Rate limit per distinct user_uuid (or session_id as fallback).
  // Each key is charged proportionally to the number of events it contributes.
  const keyEventCounts = new Map<string, number>();
  for (const e of events) {
    const key =
      (typeof e.user_uuid === "string" && e.user_uuid ? e.user_uuid : null) ||
      (typeof e.session_id === "string" && e.session_id ? e.session_id : null) ||
      "anonymous";
    keyEventCounts.set(key, (keyEventCounts.get(key) ?? 0) + 1);
  }
  for (const [key, cost] of keyEventCounts) {
    if (!checkRateLimit(key, cost)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }
  }

  // BUG-02: Validate user_uuid for all events (check distinct UUIDs once)
  const uuids = new Set(
    events
      .map((e) => e.user_uuid)
      .filter((u): u is string => typeof u === "string" && u.length > 0)
  );
  if (uuids.size > 0) {
    const validUsers = await prisma.user.findMany({
      where: { id: { in: Array.from(uuids) } },
      select: { id: true },
    });
    const validSet = new Set(validUsers.map((u) => u.id));
    for (const uuid of uuids) {
      if (!validSet.has(uuid)) {
        return NextResponse.json({ error: "Invalid user_uuid in batch" }, { status: 403 });
      }
    }
  }

  let processed = 0;
  let errors = 0;

  // Process each event sequentially (not in one big DB transaction because
  // processEvent has socket emissions and nested transactions that can't nest).
  // Each event is individually atomic via its own internal transaction.
  // Invalid events are skipped and counted as errors without aborting the batch.
  for (const event of events) {
    if (event.hook_event_name !== undefined && typeof event.hook_event_name !== "string") {
      errors++;
      continue;
    }
    try {
      await processEvent(event);
      processed++;
    } catch (err) {
      console.error("[events/batch] Error processing event:", err);
      errors++;
    }
  }

  return NextResponse.json({ ok: true, processed, errors });
}
