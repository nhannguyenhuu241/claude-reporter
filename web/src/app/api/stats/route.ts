import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcCost, resolveDeptScope } from "@/lib/reportUtils";

export async function GET(req: NextRequest) {
  const { userIds, error } = await resolveDeptScope(req);
  if (error) return NextResponse.json({ error }, { status: 401 });

  const sessionWhere =
    userIds === null
      ? {}
      : userIds.length === 0
      ? { userId: "__none__" } // no match — return zeros
      : { userId: { in: userIds } };

  const [sessionStats, tokenTotals, recentActivity] = await Promise.all([
    prisma.session.groupBy({
      by: ["status"],
      where: sessionWhere,
      _count: { id: true },
    }),
    prisma.session.aggregate({
      where: sessionWhere,
      _sum: {
        inputTokens: true,
        outputTokens: true,
        cacheCreationTokens: true,
        cacheReadTokens: true,
      },
    }),
    prisma.event.count({
      where: {
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        ...(userIds === null
          ? {}
          : userIds.length === 0
          ? { session: { userId: "__none__" } }
          : { session: { userId: { in: userIds } } }),
      },
    }),
  ]);

  const totalSessions = sessionStats.reduce((sum, s) => sum + s._count.id, 0);
  const activeSessions = sessionStats.find((s) => s.status === "active")?._count.id ?? 0;

  const tokens = tokenTotals._sum;
  const totalTokens =
    (tokens.inputTokens ?? 0) +
    (tokens.outputTokens ?? 0) +
    (tokens.cacheCreationTokens ?? 0) +
    (tokens.cacheReadTokens ?? 0);

  const estimatedCostUsd = calcCost(
    tokens.inputTokens ?? 0,
    tokens.outputTokens ?? 0,
    tokens.cacheCreationTokens ?? 0,
    tokens.cacheReadTokens ?? 0
  );

  return NextResponse.json({
    totalSessions,
    activeSessions,
    totalTokens,
    estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100,
    recentActivity24h: recentActivity,
    tokenBreakdown: {
      input: tokens.inputTokens ?? 0,
      output: tokens.outputTokens ?? 0,
      cacheCreation: tokens.cacheCreationTokens ?? 0,
      cacheRead: tokens.cacheReadTokens ?? 0,
    },
  });
}
