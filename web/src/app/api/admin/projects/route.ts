import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await prisma.session.findMany({
    select: {
      projectPath: true,
      inputTokens: true,
      outputTokens: true,
      cacheCreationTokens: true,
      cacheReadTokens: true,
      startedAt: true,
      userId: true,
      user: { select: { email: true } },
      _count: { select: { events: true } },
    },
  });

  interface ProjData {
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

  const projectMap = new Map<string, ProjData>();

  for (const s of sessions) {
    const path = s.projectPath ?? "";
    const name = path ? path.split("/").filter(Boolean).pop() ?? "Unknown" : "Unknown";
    const key = path || "__unknown__";

    if (!projectMap.has(key)) {
      projectMap.set(key, {
        name,
        path,
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

    const p = projectMap.get(key)!;
    p.sessions++;
    p.events += s._count.events;
    p.inputTokens += s.inputTokens;
    p.outputTokens += s.outputTokens;
    p.cacheCreationTokens += s.cacheCreationTokens;
    p.cacheReadTokens += s.cacheReadTokens;
    if (s.user?.email) p.users.add(s.user.email);
    const ts = new Date(s.startedAt);
    if (ts > p.lastActivity) p.lastActivity = ts;
  }

  const projects = Array.from(projectMap.values())
    .map((p) => {
      const totalTokens = p.inputTokens + p.outputTokens + p.cacheCreationTokens + p.cacheReadTokens;
      const cost = (p.inputTokens * 3 + p.outputTokens * 15 + p.cacheCreationTokens * 3.75 + p.cacheReadTokens * 0.3) / 1_000_000;
      return {
        name: p.name,
        path: p.path,
        sessions: p.sessions,
        events: p.events,
        totalTokens,
        estimatedCostUsd: Math.round(cost * 100) / 100,
        users: Array.from(p.users),
        lastActivity: p.lastActivity.toISOString(),
      };
    })
    .sort((a, b) => b.totalTokens - a.totalTokens);

  return NextResponse.json({ projects, total: projects.length });
}
