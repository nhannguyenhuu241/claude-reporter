import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";
import { getUserSession } from "@/lib/userAuth";
import { calcCost, getISOWeek, parseDateRange } from "@/lib/reportUtils";

/** Prompts tự động từ IDE/system — không phải prompt thực của user */
function isNoisePrompt(prompt: string): boolean {
  if (!prompt || prompt.trim() === "") return true;
  if (prompt.startsWith("The user selected the lines")) return true;
  if (prompt.startsWith("The user opened the file")) return true;
  if (prompt.includes("<local-command-caveat>")) return true;
  if (prompt.includes("[Request interrupted")) return true;
  if (prompt.startsWith("🤖 The user")) return true;
  if (prompt.startsWith("{'type': 'document'")) return true;
  if (prompt.startsWith('{"type": "document"')) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  const isAdmin = checkAdminAuth(req);
  const userSession = getUserSession(req);

  const { from, to } = parseDateRange(fromStr, toStr);

  // Build session filter based on cookie auth
  let userFilter: Record<string, unknown> = {};
  if (isAdmin) {
    // Admin: optional ?userId= to drill into one member
    const filterUserId = searchParams.get("userId") ?? null;
    userFilter = filterUserId ? { userId: filterUserId } : {};
  } else if (userSession?.role === "dept_head" && userSession.departmentId) {
    // Dept head: scope to their department (cached 10 min)
    const { getDeptMemberIds } = await import("@/lib/reportUtils");
    const ids = await getDeptMemberIds(userSession.departmentId);
    userFilter = { userId: { in: ids } };
  } else if (!userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else {
    // Regular member cannot see team report
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Load only required columns — no full includes, no take cap for small teams.
  // Token aggregates come from a separate groupBy query to avoid loading all rows into JS.
  const sessions = await prisma.session.findMany({
    where: { startedAt: { gte: from, lte: to }, ...userFilter as object },
    orderBy: { startedAt: "desc" },
    take: 5_000,
    select: {
      id: true,
      userId: true,
      projectPath: true,
      startedAt: true,
      inputTokens: true,
      outputTokens: true,
      cacheCreationTokens: true,
      cacheReadTokens: true,
      user: { select: { id: true, email: true } },
    },
  });

  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length === 0) {
    return NextResponse.json({
      from: from.toISOString(), to: to.toISOString(),
      totalPrompts: 0, totalSessions: 0, totalTokens: 0,
      totalMembers: 0, estimatedCostUsd: 0, members: [],
    });
  }

  // Choose query strategy based on session count:
  // - Small sets (≤500): use IN clause — precise and fast with an index.
  // - Large sets: use time-range scan + in-memory filter to avoid a Postgres
  //   performance cliff on huge IN parameters.
  const sessionSet = new Set(sessionIds);
  const SAFETY_CAP = 20_000;
  const rawPrompts = sessionIds.length <= 500
    ? await prisma.event.findMany({
        where: { eventType: "user_prompt", sessionId: { in: sessionIds }, timestamp: { gte: from, lte: to } },
        select: { sessionId: true, userPrompt: true, timestamp: true },
        orderBy: { timestamp: "asc" },
        take: SAFETY_CAP,
      })
    : (await prisma.event.findMany({
        where: { eventType: "user_prompt", timestamp: { gte: from, lte: to } },
        select: { sessionId: true, userPrompt: true, timestamp: true },
        orderBy: { timestamp: "asc" },
        take: SAFETY_CAP,
      })).filter((e) => sessionSet.has(e.sessionId));

  if (rawPrompts.length === SAFETY_CAP) {
    console.warn(`[report/team] prompt safety cap (${SAFETY_CAP}) reached — data may be incomplete. Narrow the date range.`);
  }
  const promptEvents = rawPrompts;

  const sessionMap = new Map(sessions.map((s) => [s.id, s]));

  interface WeekData { prompts: string[]; noiseCount: number }
  interface ProjectData {
    path: string; name: string; sessionIds: Set<string>;
    totalPrompts: number; meaningfulPrompts: number;
    weeks: Map<string, WeekData>;
  }
  interface MemberData {
    userId: string; email: string; sessionIds: Set<string>;
    totalPrompts: number; meaningfulPrompts: number;
    inputTokens: number; outputTokens: number;
    cacheCreationTokens: number; cacheReadTokens: number;
    activeDays: Set<string>;
    projects: Map<string, ProjectData>;
  }

  const memberMap = new Map<string, MemberData>();

  // Init members from sessions (to capture token counts even if no prompts)
  for (const s of sessions) {
    const userId = s.userId ?? "__anon__";
    const email = s.user?.email ?? "anonymous";
    if (!memberMap.has(userId)) {
      memberMap.set(userId, {
        userId, email, sessionIds: new Set(),
        totalPrompts: 0, meaningfulPrompts: 0,
        inputTokens: 0, outputTokens: 0,
        cacheCreationTokens: 0, cacheReadTokens: 0,
        activeDays: new Set(), projects: new Map(),
      });
    }
    const m = memberMap.get(userId)!;
    m.sessionIds.add(s.id);
    m.inputTokens += s.inputTokens;
    m.outputTokens += s.outputTokens;
    m.cacheCreationTokens += s.cacheCreationTokens;
    m.cacheReadTokens += s.cacheReadTokens;
    m.activeDays.add(s.startedAt.toISOString().slice(0, 10));

    const projectPath = s.projectPath ?? "";
    const projectKey = projectPath || "__unknown__";
    const projectName = projectPath
      ? projectPath.split("/").filter(Boolean).slice(-3).join(" / ") || "Unknown"
      : "Unknown";

    if (!m.projects.has(projectKey)) {
      m.projects.set(projectKey, {
        path: projectPath, name: projectName,
        sessionIds: new Set(),
        totalPrompts: 0, meaningfulPrompts: 0, weeks: new Map(),
      });
    }
    m.projects.get(projectKey)!.sessionIds.add(s.id);
  }

  // Process prompt events
  for (const evt of promptEvents) {
    const session = sessionMap.get(evt.sessionId);
    if (!session) continue;
    const userId = session.userId ?? "__anon__";
    const m = memberMap.get(userId);
    if (!m) continue;

    const prompt = evt.userPrompt ?? "";
    const noise = isNoisePrompt(prompt);
    const week = getISOWeek(new Date(evt.timestamp));
    const day = new Date(evt.timestamp).toISOString().slice(0, 10);

    m.totalPrompts++;
    if (!noise) m.meaningfulPrompts++;
    m.activeDays.add(day);

    const projectKey = (session.projectPath ?? "") || "__unknown__";
    const project = m.projects.get(projectKey);
    if (project) {
      project.totalPrompts++;
      if (!noise) project.meaningfulPrompts++;

      if (!project.weeks.has(week)) project.weeks.set(week, { prompts: [], noiseCount: 0 });
      const wd = project.weeks.get(week)!;
      if (noise) {
        wd.noiseCount++;
      } else {
        wd.prompts.push(prompt.length > 300 ? prompt.slice(0, 300) + "…" : prompt);
      }
    }
  }

  const members = Array.from(memberMap.values())
    .map((m) => {
      const totalTokens = m.inputTokens + m.outputTokens + m.cacheCreationTokens + m.cacheReadTokens;
      const promptEfficiency = m.totalPrompts > 0
        ? Math.round((m.meaningfulPrompts / m.totalPrompts) * 1000) / 10
        : 0;
      const tokensPerPrompt = m.meaningfulPrompts > 0
        ? Math.round(totalTokens / m.meaningfulPrompts)
        : 0;
      const sessionDepth = m.sessionIds.size > 0
        ? Math.round((m.totalPrompts / m.sessionIds.size) * 10) / 10
        : 0;
      const cacheHitRate = m.inputTokens + m.cacheReadTokens > 0
        ? Math.round((m.cacheReadTokens / (m.inputTokens + m.cacheReadTokens)) * 1000) / 10
        : 0;

      const projects = Array.from(m.projects.values())
        .map((p) => ({
          path: p.path,
          name: p.name,
          sessions: p.sessionIds.size,
          totalPrompts: p.totalPrompts,
          meaningfulPrompts: p.meaningfulPrompts,
          weeks: Array.from(p.weeks.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([week, wd]) => ({
              week,
              prompts: wd.prompts,
              noiseCount: wd.noiseCount,
              count: wd.prompts.length,
            })),
        }))
        .filter((p) => p.totalPrompts > 0)
        .sort((a, b) => b.totalPrompts - a.totalPrompts);

      return {
        userId: m.userId,
        email: m.email,
        sessions: m.sessionIds.size,
        totalPrompts: m.totalPrompts,
        meaningfulPrompts: m.meaningfulPrompts,
        promptEfficiency,
        tokensPerPrompt,
        sessionDepth,
        cacheHitRate,
        activeDays: m.activeDays.size,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cacheCreationTokens: m.cacheCreationTokens,
        cacheReadTokens: m.cacheReadTokens,
        totalTokens,
        estimatedCostUsd: Math.round(
          calcCost(m.inputTokens, m.outputTokens, m.cacheCreationTokens, m.cacheReadTokens) * 10000
        ) / 10000,
        projects,
      };
    })
    .sort((a, b) => b.totalPrompts - a.totalPrompts);

  const totalPrompts = members.reduce((s, m) => s + m.totalPrompts, 0);
  const totalTokens = members.reduce((s, m) => s + m.totalTokens, 0);
  const totalCost = members.reduce((s, m) => s + m.estimatedCostUsd, 0);

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    totalPrompts,
    totalSessions: sessions.length,
    totalTokens,
    totalMembers: members.filter((m) => m.userId !== "__anon__").length,
    estimatedCostUsd: Math.round(totalCost * 100) / 100,
    members,
  });
}
