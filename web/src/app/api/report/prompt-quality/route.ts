import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getISOWeek, parseDateRange, resolveDeptScope } from "@/lib/reportUtils";
import { checkRateLimit } from "@/lib/rateLimiter";

// ── Heuristic classifiers ────────────────────────────────────────────────────

const VAGUE_PATTERNS = [
  /^.{1,25}$/,
  /^(fix|check|update|review|test|run|ok|done|yes|no|go|try|help)[\s!.?]*$/i,
  /^(không được|chưa được|vẫn lỗi|còn lỗi|vẫn không|fix it|check lại|thử lại|làm lại|chạy lại|xem lại|sai rồi|lỗi rồi|bị lỗi)[\s!.?]*$/i,
  /^(it (doesn't|don't|won't|isn't|still) (work|run|compile|build))[\s!.?]*$/i,
  /^(still (broken|not working|failing|wrong))[\s!.?]*$/i,
];

function isVague(prompt: string): boolean {
  const p = prompt.trim();
  return VAGUE_PATTERNS.some((re) => re.test(p));
}

function isCodeDump(prompt: string): boolean {
  const p = prompt.trim();
  // Starts with @filename with minimal context
  if (/^@\S+/.test(p) && p.split(/\s+/).length < 5) return true;
  // Contains code blocks that dominate content
  const codeBlocks = p.match(/```[\s\S]*?```/g) ?? [];
  const codeLen = codeBlocks.reduce((s, b) => s + b.length, 0);
  if (codeLen > 0 && codeLen / p.length > 0.55) return true;
  // Long prompts with high punctuation density (code-heavy)
  if (p.length > 400) {
    const codeChars = (p.match(/[{}()[\];=><|&]/g) ?? []).length;
    if (codeChars / p.length > 0.08) return true;
  }
  return false;
}

function similarity(a: string, b: string): number {
  const aW = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const bW = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  if (aW.size === 0 || bW.size === 0) return 0;
  const intersection = [...aW].filter((w) => bW.has(w)).length;
  const union = new Set([...aW, ...bW]).size;
  return union > 0 ? intersection / union : 0;
}


function calcScore(repPct: number, codePct: number, vaguePct: number): number {
  return Math.max(0, Math.round((100 - repPct * 0.4 - codePct * 0.3 - vaguePct * 0.3) * 10) / 10);
}

function scoreStatus(score: number): string {
  if (score >= 80) return "TỐT";
  if (score >= 60) return "TRUNG BÌNH";
  return "CẦN CẢI THIỆN";
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(`report:pq:${ip}`, 5)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
  const { from, to } = parseDateRange(searchParams.get("from"), searchParams.get("to"));
  const { userIds, error } = await resolveDeptScope(req);
  if (error) return NextResponse.json({ error }, { status: 401 });

  const sessionFilter =
    userIds === null
      ? undefined
      : userIds.length === 0
      ? { userId: "__none__" }
      : { userId: { in: userIds } };

  // Fetch user_prompt events in range.
  // Cap at 20 000 to prevent OOM + O(n²) similarity explosion on large date ranges.
  const events = await prisma.event.findMany({
    where: {
      eventType: "user_prompt",
      timestamp: { gte: from, lte: to },
      userPrompt: { not: null },
      session: sessionFilter,
    },
    select: {
      id: true,
      userPrompt: true,
      timestamp: true,
      sessionId: true,
      session: {
        select: {
          userId: true,
          projectPath: true,
          user: { select: { email: true } },
        },
      },
    },
    orderBy: { timestamp: "asc" },
    take: 20_000,
  });

  // Group by user
  interface PromptRecord {
    text: string;
    sessionId: string;
    timestamp: Date;
    week: string;
  }
  interface MemberData {
    userId: string;
    email: string;
    prompts: PromptRecord[];
  }

  const memberMap = new Map<string, MemberData>();

  for (const ev of events) {
    const uid = ev.session?.userId ?? "anonymous";
    const email = ev.session?.user?.email ?? "Unknown";
    const text = ev.userPrompt!.trim();
    if (!text) continue;
    if (!memberMap.has(uid)) memberMap.set(uid, { userId: uid, email, prompts: [] });
    memberMap.get(uid)!.prompts.push({
      text,
      sessionId: ev.sessionId,
      timestamp: new Date(ev.timestamp),
      week: getISOWeek(new Date(ev.timestamp)),
    });
  }

  // Analyze each member
  const members = Array.from(memberMap.values()).map((m) => {
    const bySession = new Map<string, string[]>();
    for (const p of m.prompts) {
      if (!bySession.has(p.sessionId)) bySession.set(p.sessionId, []);
      bySession.get(p.sessionId)!.push(p.text);
    }

    const vagueExamples: string[] = [];
    const codeDumpExamples: string[] = [];
    const repeatedExamples: string[] = [];
    const vagueSet = new Set<number>();
    const codeDumpSet = new Set<number>();
    const repeatSet = new Set<number>();

    // Per-session repetition detection.
    // Keep only the last 50 prompts per session as the comparison window — this bounds
    // the inner loop at 50 comparisons per prompt (O(n×50) instead of O(n²)).
    const SIMILARITY_WINDOW = 50;
    const sessionSeen = new Map<string, string[]>();
    for (let i = 0; i < m.prompts.length; i++) {
      const p = m.prompts[i];
      if (!sessionSeen.has(p.sessionId)) sessionSeen.set(p.sessionId, []);
      const prev = sessionSeen.get(p.sessionId)!;
      let isRepeat = false;
      for (const prevText of prev) {
        if (similarity(p.text, prevText) >= 0.7) { isRepeat = true; break; }
      }
      if (isRepeat) {
        repeatSet.add(i);
        if (repeatedExamples.length < 5) repeatedExamples.push(p.text.slice(0, 120));
      }
      prev.push(p.text);
      // Evict oldest entry to keep the window bounded
      if (prev.length > SIMILARITY_WINDOW) prev.shift();

      if (isCodeDump(p.text)) {
        codeDumpSet.add(i);
        if (codeDumpExamples.length < 3) codeDumpExamples.push(p.text.slice(0, 120));
      }
      if (isVague(p.text)) {
        vagueSet.add(i);
        if (vagueExamples.length < 5) vagueExamples.push(p.text.slice(0, 120));
      }
    }

    const total = m.prompts.length;
    const repPct = total > 0 ? Math.round((repeatSet.size / total) * 100) : 0;
    const codePct = total > 0 ? Math.round((codeDumpSet.size / total) * 100) : 0;
    const vaguePct = total > 0 ? Math.round((vagueSet.size / total) * 100) : 0;
    const score = calcScore(repPct, codePct, vaguePct);
    const problematic = new Set([...repeatSet, ...codeDumpSet, ...vagueSet]).size;

    // Weekly breakdown
    const weekMap = new Map<string, { total: number; rep: number; code: number; vague: number }>();
    for (let i = 0; i < m.prompts.length; i++) {
      const w = m.prompts[i].week;
      if (!weekMap.has(w)) weekMap.set(w, { total: 0, rep: 0, code: 0, vague: 0 });
      const wk = weekMap.get(w)!;
      wk.total++;
      if (repeatSet.has(i)) wk.rep++;
      if (codeDumpSet.has(i)) wk.code++;
      if (vagueSet.has(i)) wk.vague++;
    }
    const weeklyScores = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, wk]) => ({
        week,
        prompts: wk.total,
        repetitionPct: wk.total > 0 ? Math.round((wk.rep / wk.total) * 100) : 0,
        codeDumpPct: wk.total > 0 ? Math.round((wk.code / wk.total) * 100) : 0,
        vaguePct: wk.total > 0 ? Math.round((wk.vague / wk.total) * 100) : 0,
        score: calcScore(
          wk.total > 0 ? Math.round((wk.rep / wk.total) * 100) : 0,
          wk.total > 0 ? Math.round((wk.code / wk.total) * 100) : 0,
          wk.total > 0 ? Math.round((wk.vague / wk.total) * 100) : 0,
        ),
      }));

    return {
      userId: m.userId,
      email: m.email,
      totalPrompts: total,
      problematicCount: problematic,
      repetitionPct: repPct,
      codeDumpPct: codePct,
      vaguePct: vaguePct,
      efficiencyScore: score,
      status: scoreStatus(score),
      weeklyScores,
      problems: { repeated: repeatedExamples, codeDumps: codeDumpExamples, vague: vagueExamples },
    };
  }).sort((a, b) => b.efficiencyScore - a.efficiencyScore);

  // Team-level weekly trend (aggregate all members)
  const allWeekMap = new Map<string, { total: number; rep: number; code: number; vague: number }>();
  for (const m of members) {
    for (const w of m.weeklyScores) {
      if (!allWeekMap.has(w.week)) allWeekMap.set(w.week, { total: 0, rep: 0, code: 0, vague: 0 });
      const wk = allWeekMap.get(w.week)!;
      wk.total += w.prompts;
      wk.rep += Math.round((w.repetitionPct / 100) * w.prompts);
      wk.code += Math.round((w.codeDumpPct / 100) * w.prompts);
      wk.vague += Math.round((w.vaguePct / 100) * w.prompts);
    }
  }

  const weeklyTrend = Array.from(allWeekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, wk], idx, arr) => {
      const repPct = wk.total > 0 ? Math.round((wk.rep / wk.total) * 100) : 0;
      const codePct = wk.total > 0 ? Math.round((wk.code / wk.total) * 100) : 0;
      const vaguePct = wk.total > 0 ? Math.round((wk.vague / wk.total) * 100) : 0;
      const score = calcScore(repPct, codePct, vaguePct);
      const prevScore = idx > 0 ? calcScore(
        arr[idx - 1][1].total > 0 ? Math.round((arr[idx - 1][1].rep / arr[idx - 1][1].total) * 100) : 0,
        arr[idx - 1][1].total > 0 ? Math.round((arr[idx - 1][1].code / arr[idx - 1][1].total) * 100) : 0,
        arr[idx - 1][1].total > 0 ? Math.round((arr[idx - 1][1].vague / arr[idx - 1][1].total) * 100) : 0,
      ) : null;
      const diff = prevScore !== null ? Math.round((score - prevScore) * 10) / 10 : null;
      return {
        week,
        prompts: wk.total,
        repetitionPct: repPct,
        codeDumpPct: codePct,
        vaguePct: vaguePct,
        score,
        trend: diff === null ? "→ Khởi đầu" : diff > 0 ? `↑ +${diff}` : diff < 0 ? `↓ ${diff}` : "→ Giữ nguyên",
      };
    });

  const totalPrompts = members.reduce((s, m) => s + m.totalPrompts, 0);
  const totalProblematic = members.reduce((s, m) => s + m.problematicCount, 0);
  const avgScore = members.length > 0
    ? Math.round((members.reduce((s, m) => s + m.efficiencyScore * m.totalPrompts, 0) / Math.max(totalPrompts, 1)) * 10) / 10
    : 0;

  // Team-level issue rates
  const teamRepTotal = members.reduce((s, m) => s + Math.round((m.repetitionPct / 100) * m.totalPrompts), 0);
  const teamCodeTotal = members.reduce((s, m) => s + Math.round((m.codeDumpPct / 100) * m.totalPrompts), 0);
  const teamVagueTotal = members.reduce((s, m) => s + Math.round((m.vaguePct / 100) * m.totalPrompts), 0);

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    totalPrompts,
    totalMembers: members.length,
    avgEfficiencyScore: avgScore,
    problematicCount: totalProblematic,
    problematicPct: totalPrompts > 0 ? Math.round((totalProblematic / totalPrompts) * 100 * 10) / 10 : 0,
    topPerformer: members[0] ?? null,
    issueRates: {
      repetition: totalPrompts > 0 ? Math.round((teamRepTotal / totalPrompts) * 100 * 10) / 10 : 0,
      codeDump: totalPrompts > 0 ? Math.round((teamCodeTotal / totalPrompts) * 100 * 10) / 10 : 0,
      vague: totalPrompts > 0 ? Math.round((teamVagueTotal / totalPrompts) * 100 * 10) / 10 : 0,
      total: totalPrompts > 0 ? Math.round((totalProblematic / totalPrompts) * 100 * 10) / 10 : 0,
    },
    weeklyTrend,
    members,
  });
}
