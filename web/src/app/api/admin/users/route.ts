import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";
import { calcCost, projectName } from "@/lib/reportUtils";

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Single query: aggregate tokens in SQL, avoid loading all sessions into JS
  const [users, tokenAggs, eventAggs, projectAggs, anonymousSessions] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        email: true,
        createdAt: true,
        role: true,
        department: { select: { id: true, name: true } },
        _count: { select: { sessions: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // Token sums per user — let PostgreSQL do the aggregation
    prisma.session.groupBy({
      by: ["userId"],
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
      },
    }),

    // Total event count per user (via session join)
    prisma.$queryRaw<{ user_id: string; event_count: bigint }[]>`
      SELECT s.user_id, COUNT(e.id) AS event_count
      FROM sessions s
      LEFT JOIN events e ON e.session_id = s.id
      WHERE s.user_id IS NOT NULL
      GROUP BY s.user_id
    `,

    // Distinct project paths + last active per user
    prisma.session.groupBy({
      by: ["userId", "projectPath"],
      _max: { startedAt: true },
      where: { userId: { not: null }, projectPath: { not: null } },
    }),

    prisma.session.count({ where: { userId: null } }),
  ]);

  // Build lookup maps from aggregated results
  const tokenMap = new Map(
    tokenAggs.map((r) => [r.userId, r._sum])
  );
  const eventMap = new Map(
    eventAggs.map((r) => [r.user_id, Number(r.event_count)])
  );

  // Group project paths and last active by userId
  const projectMap = new Map<string, { paths: string[]; lastActive: Date | null }>();
  for (const r of projectAggs) {
    const uid = r.userId!;
    if (!projectMap.has(uid)) projectMap.set(uid, { paths: [], lastActive: null });
    const entry = projectMap.get(uid)!;
    entry.paths.push(r.projectPath!);
    const ts = r._max.startedAt;
    if (ts && (!entry.lastActive || ts > entry.lastActive)) entry.lastActive = ts;
  }

  const result = users.map((u) => {
    const tok = tokenMap.get(u.id);
    const inp = tok?.inputTokens ?? 0;
    const out = tok?.outputTokens ?? 0;
    const cc = tok?.cacheCreationTokens ?? 0;
    const cr = tok?.cacheReadTokens ?? 0;

    const proj = projectMap.get(u.id);
    const projects = [...new Set((proj?.paths ?? []).map(projectName))].slice(0, 6);

    return {
      id: u.id,
      email: u.email,
      createdAt: u.createdAt,
      role: u.role,
      department: u.department,
      totalSessions: u._count.sessions,
      totalEvents: eventMap.get(u.id) ?? 0,
      totalTokens: inp + out + cc + cr,
      estimatedCostUsd: Math.round(calcCost(inp, out, cc, cr) * 100) / 100,
      projects,
      lastActiveAt: proj?.lastActive ?? null,
    };
  });

  return NextResponse.json({ users: result, total: result.length, anonymousSessions });
}
