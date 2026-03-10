import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";

function calcCost(i: number, o: number, cc: number, cr: number) {
  return (i * 3 + o * 15 + cc * 3.75 + cr * 0.3) / 1_000_000;
}

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { sessions: true } },
      sessions: {
        select: {
          id: true,
          inputTokens: true,
          outputTokens: true,
          cacheCreationTokens: true,
          cacheReadTokens: true,
          projectPath: true,
          startedAt: true,
          status: true,
          _count: { select: { events: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = users.map((u) => {
    const tokens = u.sessions.reduce(
      (acc, s) => ({
        input: acc.input + s.inputTokens,
        output: acc.output + s.outputTokens,
        cacheCreation: acc.cacheCreation + s.cacheCreationTokens,
        cacheRead: acc.cacheRead + s.cacheReadTokens,
      }),
      { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }
    );

    const totalTokens = tokens.input + tokens.output + tokens.cacheCreation + tokens.cacheRead;
    const totalEvents = u.sessions.reduce((s, sess) => s + sess._count.events, 0);
    const cost = calcCost(tokens.input, tokens.output, tokens.cacheCreation, tokens.cacheRead);

    const projects = [
      ...new Set(
        u.sessions
          .map((s) => s.projectPath?.split("/").filter(Boolean).pop())
          .filter(Boolean)
      ),
    ].slice(0, 6);

    const activeSessions = u.sessions.filter((s) => s.status === "active").length;
    const lastSession = u.sessions.length
      ? u.sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]
      : null;

    return {
      id: u.id,
      email: u.email,
      createdAt: u.createdAt,
      role: u.role,
      department: u.department,
      totalSessions: u._count.sessions,
      activeSessions,
      totalEvents,
      totalTokens,
      estimatedCostUsd: Math.round(cost * 100) / 100,
      projects,
      lastActiveAt: lastSession?.startedAt ?? null,
    };
  });

  const anonymousSessions = await prisma.session.count({ where: { userId: null } });

  return NextResponse.json({ users: result, total: result.length, anonymousSessions });
}
