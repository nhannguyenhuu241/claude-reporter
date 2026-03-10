import { NextRequest, NextResponse } from "next/server";
import { processEvent } from "@/lib/processEvent";
import { prisma } from "@/lib/prisma";

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

  // BUG-13: Limit batch size
  if (events.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: `Batch size exceeds maximum of ${MAX_BATCH_SIZE}` }, { status: 400 });
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

  for (const event of events) {
    // BUG-17: Validate hook_event_name type per event
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
