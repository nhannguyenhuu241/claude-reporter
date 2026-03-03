import { NextRequest, NextResponse } from "next/server";
import { processEvent } from "@/lib/processEvent";

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

  let processed = 0;
  let errors = 0;

  for (const event of events) {
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
