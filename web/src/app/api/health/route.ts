import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const start = Date.now();
  let dbOk = false;
  let dbLatencyMs: number | null = null;
  let dbError: string | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - start;
    dbOk = true;
  } catch (err) {
    dbError = err instanceof Error ? err.message : "unknown";
  }

  const wsOk = !!(globalThis as unknown as { __io?: unknown }).__io;

  const status = dbOk ? 200 : 503;
  return NextResponse.json(
    {
      status: dbOk ? "ok" : "degraded",
      db: { ok: dbOk, latencyMs: dbLatencyMs, error: dbError },
      ws: { ok: wsOk },
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
