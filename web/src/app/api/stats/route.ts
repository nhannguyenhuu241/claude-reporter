import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? null;

  // Validate userId if provided
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return NextResponse.json({
        totalSessions: 0, activeSessions: 0, totalTokens: 0,
        estimatedCostUsd: 0, recentActivity24h: 0,
        tokenBreakdown: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
      });
    }
  }

  const sessionWhere = userId ? { userId } : {};

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
    // Last 24h event count
    prisma.event.count({
      where: {
        timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        ...(userId ? { session: { userId } } : {}),
      },
    }),
  ]);

  const totalSessions = sessionStats.reduce((sum, s) => sum + s._count.id, 0);
  const activeSessions =
    sessionStats.find((s) => s.status === "active")?._count.id ?? 0;

  const tokens = tokenTotals._sum;
  const totalTokens =
    (tokens.inputTokens ?? 0) +
    (tokens.outputTokens ?? 0) +
    (tokens.cacheCreationTokens ?? 0) +
    (tokens.cacheReadTokens ?? 0);

  // Rough cost estimate using Claude Sonnet 4.6 pricing (USD per 1M tokens)
  // Input: $3, Output: $15, Cache write: $3.75, Cache read: $0.30
  const estimatedCostUsd =
    ((tokens.inputTokens ?? 0) * 3 +
      (tokens.outputTokens ?? 0) * 15 +
      (tokens.cacheCreationTokens ?? 0) * 3.75 +
      (tokens.cacheReadTokens ?? 0) * 0.3) /
    1_000_000;

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
