import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
  const userId = searchParams.get("userId") ?? null;
  const skip = (page - 1) * limit;

  // Validate userId if provided
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return NextResponse.json({ sessions: [], total: 0, page, limit });
    }
  }

  const where = userId ? { userId } : {};

  const [sessions, total] = await Promise.all([
    prisma.session.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip,
      take: limit,
      include: {
        _count: { select: { events: true } },
        user: { select: { email: true } },
      },
    }),
    prisma.session.count({ where }),
  ]);

  return NextResponse.json({ sessions, total, page, limit });
}
