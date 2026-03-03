import { NextRequest, NextResponse } from "next/server";
import { processEvent } from "@/lib/processEvent";

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

  try {
    await processEvent(body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[events] Error processing hook:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
