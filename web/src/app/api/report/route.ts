import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calcCost, projectName, parseDateRange, resolveDeptScope } from "@/lib/reportUtils";
import { checkRateLimit } from "@/lib/rateLimiter";

interface ProjectRow {
  project_path: string | null;
  sessions: number;
  events: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  last_activity: Date;
  users: string[];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(`report:proj:${ip}`, 10)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { from, to } = parseDateRange(searchParams.get("from"), searchParams.get("to"));
  const { userIds, error } = await resolveDeptScope(req);
  if (error) return NextResponse.json({ error }, { status: 401 });

  // Build user filter as a Prisma SQL fragment
  let userClause: Prisma.Sql;
  if (userIds === null) {
    userClause = Prisma.sql`1=1`;
  } else if (userIds.length === 0) {
    userClause = Prisma.sql`1=0`;
  } else {
    userClause = Prisma.sql`s.user_id = ANY(${userIds})`;
  }

  // Single SQL GROUP BY query — replaces loading up to 10 000 session rows into JS
  const rows = await prisma.$queryRaw<ProjectRow[]>`
    SELECT
      s.project_path,
      COUNT(DISTINCT s.id)::int                            AS sessions,
      COALESCE(SUM(ev.cnt)::int, 0)                        AS events,
      COALESCE(SUM(s.input_tokens)::float8, 0)             AS input_tokens,
      COALESCE(SUM(s.output_tokens)::float8, 0)            AS output_tokens,
      COALESCE(SUM(s.cache_creation_tokens)::float8, 0)    AS cache_creation_tokens,
      COALESCE(SUM(s.cache_read_tokens)::float8, 0)        AS cache_read_tokens,
      MAX(s.started_at)                                    AS last_activity,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT u.email), NULL)      AS users
    FROM sessions s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN (
      SELECT session_id, COUNT(*)::int AS cnt
      FROM events
      WHERE "timestamp" >= ${from} AND "timestamp" <= ${to}
      GROUP BY session_id
    ) ev ON ev.session_id = s.id
    WHERE s.started_at >= ${from}
      AND s.started_at <= ${to}
      AND ${userClause}
    GROUP BY s.project_path
    ORDER BY (
      COALESCE(SUM(s.input_tokens), 0) +
      COALESCE(SUM(s.output_tokens), 0) +
      COALESCE(SUM(s.cache_creation_tokens), 0) +
      COALESCE(SUM(s.cache_read_tokens), 0)
    ) DESC
  `;

  const projects = rows.map((r) => {
    const inp = Number(r.input_tokens);
    const out = Number(r.output_tokens);
    const cc = Number(r.cache_creation_tokens);
    const cr = Number(r.cache_read_tokens);
    const totalTokens = inp + out + cc + cr;
    return {
      name: projectName(r.project_path),
      path: r.project_path ?? "",
      sessions: r.sessions,
      events: r.events,
      inputTokens: inp,
      outputTokens: out,
      cacheCreationTokens: cc,
      cacheReadTokens: cr,
      totalTokens,
      estimatedCostUsd: Math.round(calcCost(inp, out, cc, cr) * 10000) / 10000,
      users: Array.isArray(r.users) ? r.users : [],
      lastActivity: new Date(r.last_activity).toISOString(),
    };
  });

  const totalTokens = projects.reduce((s, p) => s + p.totalTokens, 0);
  const totalCost = projects.reduce((s, p) => s + p.estimatedCostUsd, 0);
  const totalEvents = projects.reduce((s, p) => s + p.events, 0);
  const totalSessions = projects.reduce((s, p) => s + p.sessions, 0);

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    totalSessions,
    totalTokens,
    totalEvents,
    estimatedCostUsd: Math.round(totalCost * 100) / 100,
    projects,
  });
}
