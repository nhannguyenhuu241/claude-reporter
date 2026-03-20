import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/adminAuth";
import { getEventQueue } from "@/lib/eventQueue";
import { prisma } from "@/lib/prisma";
import { createClient } from "redis";

// ── GET /api/admin/queue ───────────────────────────────────────────────────────
// Returns: queue counts, failed jobs, Redis health, DB latency, ingestion rate.
export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const queue = getEventQueue();

  // ── BullMQ queue stats ──────────────────────────────────────────────────────
  let queueStats = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, ok: false };
  let failedJobs: Array<{
    id: string;
    failedReason: string;
    timestamp: number;
    attemptsMade: number;
    eventCount: number;
  }> = [];

  if (queue) {
    try {
      const [waiting, active, completed, failed, delayed, failedList] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.getFailed(0, 19),
      ]);
      queueStats = { waiting, active, completed, failed, delayed, ok: true };
      failedJobs = failedList.map((j) => ({
        id: j.id ?? "",
        failedReason: j.failedReason ?? "unknown",
        timestamp: j.processedOn ?? j.timestamp ?? 0,
        attemptsMade: j.attemptsMade ?? 0,
        eventCount: Array.isArray(j.data?.events) ? j.data.events.length : 0,
      }));
    } catch (err) {
      queueStats = { ...queueStats, ok: false };
    }
  }

  // ── Redis health ────────────────────────────────────────────────────────────
  let redis = { ok: false, usedMemory: "?", maxMemory: "?", connectedClients: 0, evictionPolicy: "?" };
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    let client;
    try {
      client = createClient({ url: redisUrl });
      await client.connect();
      const [memInfo, policyInfo, clientsInfo] = await Promise.all([
        client.info("memory"),
        client.info("server"),
        client.info("clients"),
      ]);
      const usedMemory = memInfo.match(/used_memory_human:(\S+)/)?.[1] ?? "?";
      const maxMemory = memInfo.match(/maxmemory_human:(\S+)/)?.[1] ?? "?";
      const evictionPolicy = policyInfo.match(/maxmemory_policy:(\S+)/)?.[1] ?? "?";
      const connectedClients = parseInt(clientsInfo.match(/connected_clients:(\d+)/)?.[1] ?? "0");
      redis = { ok: true, usedMemory, maxMemory, connectedClients, evictionPolicy };
    } catch {
      redis.ok = false;
    } finally {
      try { await client?.disconnect(); } catch { /* ignore */ }
    }
  }

  // ── DB health ────────────────────────────────────────────────────────────────
  let db = { ok: false, latencyMs: 0 };
  try {
    const t = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    db = { ok: true, latencyMs: Date.now() - t };
  } catch { /* ignore */ }

  // ── Ingestion rate (events per minute, 30-min buckets) ──────────────────────
  type RateRow = { bucket: Date; count: bigint };
  let ingestionRate: Array<{ minute: string; count: number }> = [];
  let eventsLast5m = 0;
  let eventsLastHour = 0;
  try {
    const rows = await prisma.$queryRaw<RateRow[]>`
      SELECT
        date_trunc('minute', timestamp) AS bucket,
        COUNT(*)::bigint                AS count
      FROM events
      WHERE timestamp > NOW() - INTERVAL '30 minutes'
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
    ingestionRate = rows.map((r) => ({
      minute: r.bucket.toISOString(),
      count: Number(r.count),
    }));
    const now = Date.now();
    const rows5m = rows.filter((r) => now - r.bucket.getTime() < 5 * 60_000);
    const rows1h = rows;
    eventsLast5m = rows5m.reduce((s, r) => s + Number(r.count), 0);
    eventsLastHour = rows1h.reduce((s, r) => s + Number(r.count), 0);
  } catch { /* ignore */ }

  // ── Top users by event volume (last hour) ───────────────────────────────────
  type TopUserRow = { email: string | null; count: bigint };
  let topUsers: Array<{ email: string; count: number }> = [];
  try {
    const rows = await prisma.$queryRaw<TopUserRow[]>`
      SELECT u.email, COUNT(e.id)::bigint AS count
      FROM events e
      JOIN sessions s ON e.session_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE e.timestamp > NOW() - INTERVAL '1 hour'
      GROUP BY u.email
      ORDER BY count DESC
      LIMIT 5
    `;
    topUsers = rows.map((r) => ({
      email: r.email ?? "(anonymous)",
      count: Number(r.count),
    }));
  } catch { /* ignore */ }

  // ── Null entry_uuid ratio (dedup health) ────────────────────────────────────
  type DedupRow = { total: bigint; no_uuid: bigint };
  let dedupHealth = { total: 0, noUuid: 0, ratio: 0 };
  try {
    const rows = await prisma.$queryRaw<DedupRow[]>`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE entry_uuid IS NULL OR entry_uuid = '')::bigint AS no_uuid
      FROM events
      WHERE timestamp > NOW() - INTERVAL '1 hour'
    `;
    if (rows[0]) {
      const total = Number(rows[0].total);
      const noUuid = Number(rows[0].no_uuid);
      dedupHealth = { total, noUuid, ratio: total > 0 ? Math.round((noUuid / total) * 100) : 0 };
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    queue: queueStats,
    failedJobs,
    redis,
    db,
    ingestionRate,
    eventsLast5m,
    eventsLastHour,
    topUsers,
    dedupHealth,
    timestamp: new Date().toISOString(),
  });
}

// ── POST /api/admin/queue ──────────────────────────────────────────────────────
// Actions: retry_all | drain | pause | resume | retry (single job)
export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const queue = getEventQueue();
  if (!queue) {
    return NextResponse.json({ error: "Queue unavailable (no Redis)" }, { status: 503 });
  }

  let body: { action?: string; jobId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, jobId } = body;

  switch (action) {
    case "retry_all": {
      const failed = await queue.getFailed(0, 999);
      await Promise.all(failed.map((j) => j.retry()));
      return NextResponse.json({ ok: true, retried: failed.length });
    }
    case "drain": {
      await queue.drain();
      return NextResponse.json({ ok: true, action: "drained" });
    }
    case "pause": {
      await queue.pause();
      return NextResponse.json({ ok: true, action: "paused" });
    }
    case "resume": {
      await queue.resume();
      return NextResponse.json({ ok: true, action: "resumed" });
    }
    case "retry": {
      if (!jobId) return NextResponse.json({ error: "jobId required" }, { status: 400 });
      const job = await queue.getJob(jobId);
      if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
      await job.retry();
      return NextResponse.json({ ok: true, retried: jobId });
    }
    case "clean_failed": {
      await queue.clean(0, 1000, "failed");
      return NextResponse.json({ ok: true, action: "cleaned failed jobs" });
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
