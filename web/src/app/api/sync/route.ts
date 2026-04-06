/**
 * GET /api/sync — One-shot data sync endpoint for third-party integrations.
 *
 * Returns sessions + stats + role/org context in a single request.
 * Supports incremental sync via cursor pagination and ?since= timestamp filter.
 *
 * Auth (pick one):
 *   - X-User-Email + X-User-UUID headers      (API-key style)
 *   - X-User-Email + X-User-Password headers  (password style)
 *   - user_session cookie                      (browser session)
 *   - Admin cookie                             (sees all users; optionally filter by ?user_id=)
 *
 * Context returned per role:
 *   - member      → context.user (own profile + department)
 *   - dept_head   → context.user + context.department (members + their token stats)
 *   - admin       → context.departments (all depts) + context.users (all users + stats)
 *
 * Query params:
 *   since=<ISO date>          Only return sessions started on or after this date
 *   cursor=<token>            Pagination cursor returned from a previous response
 *   limit=<n>                 Sessions per page (default 50, max 200)
 *   include_events=true       Include individual events for each session (default false)
 *   user_id=<uuid>            Admin only: filter sessions to a specific user
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calcCost, projectName } from "@/lib/reportUtils";
import { getUserFromRequest } from "@/lib/userAuth";
import { checkAdminAuth } from "@/lib/adminAuth";
import { checkRateLimit } from "@/lib/rateLimiter";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_EVENTS_PER_SESSION = 500;

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "anon";

  // ── Auth ───────────────────────────────────────────────────────────────────
  const isAdmin = checkAdminAuth(req);
  let userSession: Awaited<ReturnType<typeof getUserFromRequest>> = null;

  if (!isAdmin) {
    userSession = await getUserFromRequest(req);
    if (!userSession) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          hint: "Provide X-User-Email + X-User-UUID headers, X-User-Email + X-User-Password, or a valid session cookie.",
        },
        { status: 401 }
      );
    }
  }

  const userId = userSession?.userId ?? null;

  // ── Rate limit ────────────────────────────────────────────────────────────
  const rlKey = `sync:${userId ?? "admin"}:${ip}`;
  if (!checkRateLimit(rlKey, 1, { max: 120, refillRate: 120, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  // ── Query params ──────────────────────────────────────────────────────────
  const { searchParams } = new URL(req.url);
  const limit = Math.min(
    parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const includeEvents = searchParams.get("include_events") === "true";
  const cursorParam = searchParams.get("cursor");
  const sinceParam = searchParams.get("since");
  const filterUserId = isAdmin ? (searchParams.get("user_id") ?? null) : null;

  // ── Session scope WHERE ───────────────────────────────────────────────────
  const baseWhere: Record<string, unknown> = {};

  if (userId) {
    // regular member or dept_head: own sessions only
    baseWhere.userId = userId;
  } else if (filterUserId) {
    // admin narrowing to one user
    const target = await prisma.user.findUnique({ where: { id: filterUserId }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
    baseWhere.userId = filterUserId;
  }

  if (sinceParam) {
    const d = new Date(sinceParam);
    if (!isNaN(d.getTime())) baseWhere.startedAt = { gte: d };
  }

  // Cursor pagination
  const pageWhere: Record<string, unknown> = { ...baseWhere };
  if (cursorParam) {
    const pipeIdx = cursorParam.indexOf("|");
    const isoStr = pipeIdx !== -1 ? cursorParam.slice(0, pipeIdx) : cursorParam;
    const lastId = pipeIdx !== -1 ? cursorParam.slice(pipeIdx + 1) : "";
    const cursorDate = new Date(isoStr);
    if (!isNaN(cursorDate.getTime())) {
      pageWhere.OR = [
        { startedAt: { lt: cursorDate } },
        { startedAt: cursorDate, id: { lt: lastId } },
      ];
    }
  }

  // ── Fetch sessions page ───────────────────────────────────────────────────
  const rawSessions = await prisma.session.findMany({
    where: pageWhere,
    orderBy: { startedAt: "desc" },
    take: limit + 1,
    include: {
      _count: { select: { events: true } },
      user: { select: { email: true, role: true, department: { select: { id: true, name: true } } } },
      ...(includeEvents
        ? {
            events: {
              orderBy: { timestamp: "asc" },
              take: MAX_EVENTS_PER_SESSION,
              select: {
                id: true,
                eventType: true,
                timestamp: true,
                entryUuid: true,
                userPrompt: true,
                toolName: true,
                toolInput: true,
                toolOutput: true,
                toolDurationMs: true,
                assistantMessage: true,
                inputTokens: true,
                outputTokens: true,
                cacheCreationTokens: true,
                cacheReadTokens: true,
              },
            },
          }
        : {}),
    },
  });

  const hasMore = rawSessions.length > limit;
  const items = hasMore ? rawSessions.slice(0, limit) : rawSessions;
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem ? `${lastItem.startedAt.toISOString()}|${lastItem.id}` : null;

  // ── Aggregate stats ───────────────────────────────────────────────────────
  const aggResult = await prisma.session.aggregate({
    where: baseWhere,
    _sum: { inputTokens: true, outputTokens: true, cacheCreationTokens: true, cacheReadTokens: true },
    _count: { id: true },
  });

  const inp = aggResult._sum.inputTokens ?? 0;
  const out = aggResult._sum.outputTokens ?? 0;
  const cc  = aggResult._sum.cacheCreationTokens ?? 0;
  const cr  = aggResult._sum.cacheReadTokens ?? 0;

  // ── Shape sessions ────────────────────────────────────────────────────────
  const sessions = items.map((s) => {
    const totalTokens = s.inputTokens + s.outputTokens + s.cacheCreationTokens + s.cacheReadTokens;
    const base: Record<string, unknown> = {
      id: s.id,
      project_name: projectName(s.projectPath),
      project_path: s.projectPath,
      model: s.model,
      status: s.status,
      machine_id: s.machineId,
      started_at: s.startedAt.toISOString(),
      ended_at: s.endedAt?.toISOString() ?? null,
      user_email: s.user?.email ?? null,
      user_role: s.user?.role ?? null,
      user_department: s.user?.department ? { id: s.user.department.id, name: s.user.department.name } : null,
      input_tokens: s.inputTokens,
      output_tokens: s.outputTokens,
      cache_creation_tokens: s.cacheCreationTokens,
      cache_read_tokens: s.cacheReadTokens,
      total_tokens: totalTokens,
      estimated_cost_usd: Math.round(calcCost(s.inputTokens, s.outputTokens, s.cacheCreationTokens, s.cacheReadTokens) * 10_000) / 10_000,
      event_count: s._count.events,
    };
    if (includeEvents && "events" in s) {
      base.events = (s as typeof s & { events: unknown[] }).events;
    }
    return base;
  });

  // ── Build role context ────────────────────────────────────────────────────
  let context: Record<string, unknown> = {};

  if (isAdmin) {
    // Admin: all departments + all users with token stats
    const [departments, users] = await Promise.all([
      prisma.department.findMany({
        orderBy: { name: "asc" },
        include: { _count: { select: { users: true } } },
      }),
      prisma.user.findMany({
        orderBy: { email: "asc" },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          department: { select: { id: true, name: true } },
          sessions: {
            select: { inputTokens: true, outputTokens: true, cacheCreationTokens: true, cacheReadTokens: true },
          },
        },
      }),
    ]);

    context = {
      role: "admin",
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        member_count: d._count.users,
      })),
      users: users.map((u) => {
        const uInp = u.sessions.reduce((s, x) => s + x.inputTokens, 0);
        const uOut = u.sessions.reduce((s, x) => s + x.outputTokens, 0);
        const uCc  = u.sessions.reduce((s, x) => s + x.cacheCreationTokens, 0);
        const uCr  = u.sessions.reduce((s, x) => s + x.cacheReadTokens, 0);
        return {
          id: u.id,
          email: u.email,
          role: u.role,
          created_at: u.createdAt.toISOString(),
          department: u.department ? { id: u.department.id, name: u.department.name } : null,
          total_sessions: u.sessions.length,
          total_tokens: uInp + uOut + uCc + uCr,
          estimated_cost_usd: Math.round(calcCost(uInp, uOut, uCc, uCr) * 100) / 100,
        };
      }),
    };
  } else if (userSession) {
    // Fetch full user profile with department
    const userRecord = await prisma.user.findUnique({
      where: { id: userSession.userId },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        department: { select: { id: true, name: true } },
      },
    });

    const userCtx: Record<string, unknown> = {
      role: userRecord?.role ?? userSession.role,
      user: {
        id: userRecord?.id,
        email: userRecord?.email,
        role: userRecord?.role,
        created_at: userRecord?.createdAt.toISOString(),
        department: userRecord?.department ?? null,
      },
    };

    // dept_head: also include department members with their token stats
    if (userSession.role === "dept_head" && userSession.departmentId) {
      const members = await prisma.user.findMany({
        where: { departmentId: userSession.departmentId },
        orderBy: { email: "asc" },
        select: {
          id: true,
          email: true,
          role: true,
          sessions: {
            select: { inputTokens: true, outputTokens: true, cacheCreationTokens: true, cacheReadTokens: true },
          },
        },
      });

      const dept = await prisma.department.findUnique({
        where: { id: userSession.departmentId },
        select: { id: true, name: true },
      });

      userCtx.department = {
        id: dept?.id,
        name: dept?.name,
        members: members.map((m) => {
          const mInp = m.sessions.reduce((s, x) => s + x.inputTokens, 0);
          const mOut = m.sessions.reduce((s, x) => s + x.outputTokens, 0);
          const mCc  = m.sessions.reduce((s, x) => s + x.cacheCreationTokens, 0);
          const mCr  = m.sessions.reduce((s, x) => s + x.cacheReadTokens, 0);
          return {
            id: m.id,
            email: m.email,
            role: m.role,
            total_sessions: m.sessions.length,
            total_tokens: mInp + mOut + mCc + mCr,
            estimated_cost_usd: Math.round(calcCost(mInp, mOut, mCc, mCr) * 100) / 100,
          };
        }),
      };
    }

    context = userCtx;
  }

  // ── Response ──────────────────────────────────────────────────────────────
  return NextResponse.json({
    ok: true,
    synced_at: new Date().toISOString(),
    has_more: hasMore,
    cursor: nextCursor,
    context,
    stats: {
      total_sessions: aggResult._count.id,
      total_tokens: inp + out + cc + cr,
      estimated_cost_usd: Math.round(calcCost(inp, out, cc, cr) * 100) / 100,
      token_breakdown: { input: inp, output: out, cache_creation: cc, cache_read: cr },
    },
    sessions,
  });
}
