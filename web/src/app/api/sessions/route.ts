import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveDeptScope } from "@/lib/reportUtils";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 100);
  // Cursor is encoded as "<ISO-date>|<id>" to handle multiple sessions with identical timestamps.
  const cursorParam = searchParams.get("cursor") ?? null;

  const { userIds, error } = await resolveDeptScope(req);
  if (error) return NextResponse.json({ error }, { status: 401 });

  // Build where clause
  const where: Record<string, unknown> =
    userIds === null
      ? {} // admin: no filter
      : userIds.length === 0
      ? { userId: "__none__" } // no match
      : { userId: { in: userIds } };

  if (cursorParam) {
    const [isoStr, lastId] = cursorParam.split("|");
    const cursorDate = isoStr ? new Date(isoStr) : null;
    if (cursorDate && !isNaN(cursorDate.getTime())) {
      // Fetch rows strictly before cursorDate, OR at the same timestamp but with id < lastId.
      // This ensures stable pagination even when multiple sessions share the same startedAt.
      where.OR = [
        { startedAt: { lt: cursorDate } },
        { startedAt: cursorDate, id: { lt: lastId ?? "" } },
      ];
    }
  }

  const sessions = await prisma.session.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: limit + 1,
    include: {
      _count: { select: { events: true } },
      user: { select: { email: true } },
    },
  });

  const hasMore = sessions.length > limit;
  const items = hasMore ? sessions.slice(0, limit) : sessions;
  // Encode cursor as "<ISO>|<id>" — stable even when multiple sessions share the same timestamp.
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? `${last.startedAt.toISOString()}|${last.id}` : null;

  return NextResponse.json({ sessions: items, nextCursor });
}
