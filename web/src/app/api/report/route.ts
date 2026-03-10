import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function calcCost(input: number, output: number, cacheCreate: number, cacheRead: number) {
  return (input * 3 + output * 15 + cacheCreate * 3.75 + cacheRead * 0.3) / 1_000_000;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const userId = searchParams.get("userId") ?? null;

  const from = fromStr ? new Date(fromStr + "T00:00:00.000Z") : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = toStr ? new Date(toStr + "T23:59:59.999Z") : new Date();

  // Validate userId if provided
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ from: from.toISOString(), to: to.toISOString(), totalSessions: 0, totalTokens: 0, totalEvents: 0, estimatedCostUsd: 0, projects: [] });
    }
  }

  const sessions = await prisma.session.findMany({
    where: {
      startedAt: { gte: from, lte: to },
      ...(userId ? { userId } : {}),
    },
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
    const projectName = projectPath
      ? projectPath.split("/").filter(Boolean).pop() ?? "Unknown"
      : "Unknown";
    const key = projectPath || "__unknown__";

    if (!projectMap.has(key)) {
      projectMap.set(key, {
        name: projectName,
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
    totalTokens,
    totalEvents,
    estimatedCostUsd: Math.round(totalCost * 100) / 100,
    projects,
  });
}
