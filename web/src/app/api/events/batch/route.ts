import { NextRequest, NextResponse } from "next/server";
import { processEvent } from "@/lib/processEvent";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimiter";
import { getEventQueue } from "@/lib/eventQueue";

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
  // Charge 1 token per batch (not per event) — hook machines replay queues
  // with many events at once; per-event charging causes permanent 429s when
  // batch size > default bucket max.
  // Allow burst of 200 batches (= 20 000 events), refill 100 batches/min.
  // This lets a full 20K overflow queue drain in one pass (~200 requests instantly)
  // while still blocking abusive clients (>200 batches/min sustained).
  for (const [key] of keyEventCounts) {
    if (!checkRateLimit(key, 1, { max: 200, refillRate: 100, windowMs: 60_000 })) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }
  }

  // Validate user_uuid for all events — check distinct UUIDs once, then filter
  // per-event instead of rejecting the whole batch. A single stale/unknown UUID
  // must not block the 99 other valid events in the same batch.
  const uuids = new Set(
    events
      .map((e) => e.user_uuid)
      .filter((u): u is string => typeof u === "string" && u.length > 0)
  );
  const validSet = new Set<string>();
  if (uuids.size > 0) {
    const validUsers = await prisma.user.findMany({
      where: { id: { in: Array.from(uuids) } },
      select: { id: true },
    });
    for (const u of validUsers) validSet.add(u.id);
  }

  // ── Enqueue via BullMQ when Redis is available ────────────────────────────
  // API returns 202 immediately; worker processes asynchronously with concurrency=5.
  // Falls back to inline processing if the queue is unavailable (no Redis / cold start).
  const queue = getEventQueue();
  if (queue) {
    // Filter out invalid events before enqueuing so the worker doesn't need to re-validate.
    const validEvents = events.filter((event) => {
      const evUuid = typeof event.user_uuid === "string" && event.user_uuid ? event.user_uuid : null;
      if (evUuid && !validSet.has(evUuid)) return false;
      if (event.hook_event_name !== undefined && typeof event.hook_event_name !== "string") return false;
      return true;
    });

    if (validEvents.length > 0) {
      await queue.add("batch", {
        events: validEvents,
        validUserIds: Array.from(validSet),
      });
    }

    return NextResponse.json({ ok: true, queued: validEvents.length });
  }

  // ── Fallback: inline processing (no Redis / queue unavailable) ─────────────
  let processed = 0;
  let errors = 0;

  // Sessions ensured within this batch — avoids redundant upsert/retroactive-claim
  // queries when many events arrive for the same session in one batch.
  const ensuredSessions = new Set<string>();

  for (const event of events) {
    const evUuid = typeof event.user_uuid === "string" && event.user_uuid ? event.user_uuid : null;
    if (evUuid && !validSet.has(evUuid)) { errors++; continue; }
    if (event.hook_event_name !== undefined && typeof event.hook_event_name !== "string") { errors++; continue; }
    try {
      await processEvent(event, ensuredSessions);
      processed++;
    } catch (err) {
      console.error("[events/batch] Error processing event:", err);
      errors++;
    }
  }

  return NextResponse.json({ ok: true, processed, errors });
}
