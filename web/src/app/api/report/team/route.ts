import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";

function calcCost(input: number, output: number, cacheCreate: number, cacheRead: number) {
  return (input * 3 + output * 15 + cacheCreate * 3.75 + cacheRead * 0.3) / 1_000_000;
}

function getISOWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

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
  const filterUserId = searchParams.get("userId") ?? null;
  const deptHeadUuid = searchParams.get("deptHeadUuid") ?? null;
  const isAdmin = checkAdminAuth(req);

  const from = fromStr
    ? new Date(fromStr + "T00:00:00.000Z")
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = toStr ? new Date(toStr + "T23:59:59.999Z") : new Date();

  // Dept head: verify UUID and get their department
  let deptFilter: { departmentId: string } | null = null;
  if (!isAdmin && deptHeadUuid) {
    const deptHead = await prisma.user.findUnique({
      where: { id: deptHeadUuid },
      select: { role: true, departmentId: true },
    });
    if (!deptHead || deptHead.role !== "dept_head" || !deptHead.departmentId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    deptFilter = { departmentId: deptHead.departmentId };
  }

  // Build session filter
  let userFilter: Record<string, unknown> = {};
  if (isAdmin) {
    userFilter = filterUserId ? { userId: filterUserId } : {};
  } else if (deptFilter) {
    // Filter sessions whose user belongs to this department
    const deptUsers = await prisma.user.findMany({
      where: deptFilter,
      select: { id: true },
    });
    const deptUserIds = deptUsers.map((u) => u.id);
    userFilter = { userId: { in: deptUserIds } };
  } else if (filterUserId) {
    userFilter = { userId: filterUserId };
  }

  const sessions = await prisma.session.findMany({
    where: { startedAt: { gte: from, lte: to }, ...userFilter as object },
    include: { user: { select: { id: true, email: true } } },
  });

  const sessionIds = sessions.map((s) => s.id);
  if (sessionIds.length === 0) {
    return NextResponse.json({
      from: from.toISOString(), to: to.toISOString(),
      totalPrompts: 0, totalSessions: 0, totalTokens: 0,
      totalMembers: 0, estimatedCostUsd: 0, members: [],
    });
  }

  const promptEvents = await prisma.event.findMany({
    where: { sessionId: { in: sessionIds }, eventType: "user_prompt" },
    select: { sessionId: true, userPrompt: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });

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
