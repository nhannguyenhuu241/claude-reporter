import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";
import { getUserSession } from "@/lib/userAuth";
import { getDeptMemberIds, invalidateDeptCache } from "@/lib/reportUtils";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const isAdmin = checkAdminAuth(req);
  const userSession = getUserSession(req);

  if (!isAdmin && !userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch session metadata (no events yet)
  const session = await prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      machineId: true,
      projectPath: true,
      model: true,
      status: true,
      startedAt: true,
      endedAt: true,
      userId: true,
      inputTokens: true,
      outputTokens: true,
      cacheCreationTokens: true,
      cacheReadTokens: true,
      _count: { select: { events: true } },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Access control:
  // - Admin: sees everything
  // - Own session or unowned: allowed
  // - Dept head: can see sessions of members in their department
  // - Otherwise: 404 (not 403 — avoids confirming session exists)
  if (!isAdmin && session.userId !== null && session.userId !== userSession!.userId) {
    const us = userSession!;
    let allowed = false;

    // Cookie may be stale if admin changed role/dept after user last logged in.
    // Always do a fresh DB lookup so role and departmentId are current.
    const freshUser = await prisma.user.findUnique({
      where: { id: us.userId },
      select: { role: true, departmentId: true },
    });
    const role = freshUser?.role ?? us.role;
    const departmentId = freshUser?.departmentId ?? us.departmentId;

    if ((role === "dept_head" || role === "member") && departmentId) {
      // Invalidate cache first in case membership was updated recently
      invalidateDeptCache(departmentId);
      const deptIds = await getDeptMemberIds(departmentId);
      allowed = deptIds.includes(session.userId);
    }
    if (!allowed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  // Pagination params
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  const events = await prisma.event.findMany({
    where: { sessionId: id },
    orderBy: { timestamp: "asc" },
    skip,
    take: limit,
  });

  const totalEvents = session._count.events;
  const totalPages = Math.ceil(totalEvents / limit);

  return NextResponse.json({
    ...session,
    events,
    pagination: { page, limit, totalEvents, totalPages, hasMore: page < totalPages },
  });
}
