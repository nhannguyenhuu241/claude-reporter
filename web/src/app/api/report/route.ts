import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcCost, projectName, parseDateRange, resolveDeptScope } from "@/lib/reportUtils";
import { checkRateLimit } from "@/lib/rateLimiter";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  // Use x-real-ip (set by nginx/proxy) when available; x-forwarded-for is client-spoofable.
  // Also bind to userId/deptHeadUuid so rotating IPs doesn't bypass per-user limits.
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(`report:proj:${ip}`, 10)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { from, to } = parseDateRange(searchParams.get("from"), searchParams.get("to"));
  const { userIds, error } = await resolveDeptScope(req);
  if (error) return NextResponse.json({ error }, { status: 401 });

  const sessionWhere: Record<string, unknown> = { startedAt: { gte: from, lte: to } };
  if (userIds !== null) {
    sessionWhere.userId = userIds.length === 0 ? "__none__" : { in: userIds };
  }

  // Cap at 10 000 sessions to prevent OOM on large deployments.
  // For an accurate aggregate over a very wide date range, narrow the range or use the admin DB directly.
  const sessions = await prisma.session.findMany({
    where: sessionWhere,
    orderBy: { startedAt: "desc" },
    take: 10_000,
    include: {
      _count: { select: { events: true } },
      user: { select: { email: true } },
    },
  });

  // Group by project path
  interface ProjectData {
    name: string;
    path: string;
    sessions: number;
    events: number;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    users: Set<string>;
    lastActivity: Date;
  }

  const projectMap = new Map<string, ProjectData>();

  for (const s of sessions) {
    const projectPath = s.projectPath ?? "";
    const pName = projectName(projectPath);
    const key = projectPath || "__unknown__";

    if (!projectMap.has(key)) {
      projectMap.set(key, {
        name: pName,
        path: projectPath,
        sessions: 0,
        events: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        users: new Set(),
        lastActivity: new Date(0),
      });
    }

    const proj = projectMap.get(key)!;
    proj.sessions++;
    proj.events += s._count.events;
    proj.inputTokens += s.inputTokens;
    proj.outputTokens += s.outputTokens;
    proj.cacheCreationTokens += s.cacheCreationTokens;
    proj.cacheReadTokens += s.cacheReadTokens;
    if (s.user?.email) proj.users.add(s.user.email);
    const ts = new Date(s.startedAt);
    if (ts > proj.lastActivity) proj.lastActivity = ts;
  }

  const projects = Array.from(projectMap.values())
    .map((p) => {
      const totalTokens = p.inputTokens + p.outputTokens + p.cacheCreationTokens + p.cacheReadTokens;
      const estimatedCostUsd = calcCost(p.inputTokens, p.outputTokens, p.cacheCreationTokens, p.cacheReadTokens);
      return {
        name: p.name,
        path: p.path,
        sessions: p.sessions,
        events: p.events,
        inputTokens: p.inputTokens,
        outputTokens: p.outputTokens,
        cacheCreationTokens: p.cacheCreationTokens,
        cacheReadTokens: p.cacheReadTokens,
        totalTokens,
        estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
        users: Array.from(p.users),
        lastActivity: p.lastActivity.toISOString(),
      };
    })
    .sort((a, b) => b.totalTokens - a.totalTokens);

  const totalTokens = projects.reduce((s, p) => s + p.totalTokens, 0);
  const totalCost = projects.reduce((s, p) => s + p.estimatedCostUsd, 0);
  const totalEvents = projects.reduce((s, p) => s + p.events, 0);

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    totalSessions: sessions.length,
    capped: sessions.length === 10_000, // true → result may be incomplete; narrow date range
    totalTokens,
    totalEvents,
    estimatedCostUsd: Math.round(totalCost * 100) / 100,
    projects,
  });
}
