import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";
import { calcCost } from "@/lib/reportUtils";

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Aggregate token sums per department in SQL — no nested JS loops
  const [departments, tokenAggs] = await Promise.all([
    prisma.department.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
      orderBy: { createdAt: "asc" },
    }),

    prisma.$queryRaw<{
      dept_id: string;
      input: bigint;
      output: bigint;
      cache_create: bigint;
      cache_read: bigint;
    }[]>`
      SELECT u.department_id AS dept_id,
             COALESCE(SUM(s.input_tokens), 0)           AS input,
             COALESCE(SUM(s.output_tokens), 0)          AS output,
             COALESCE(SUM(s.cache_creation_tokens), 0)  AS cache_create,
             COALESCE(SUM(s.cache_read_tokens), 0)      AS cache_read
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id
      WHERE u.department_id IS NOT NULL
      GROUP BY u.department_id
    `,
  ]);

  const tokMap = new Map(tokenAggs.map((r) => [r.dept_id, r]));

  const result = departments.map((d) => {
    const tok = tokMap.get(d.id);
    const inp = Number(tok?.input ?? 0);
    const out = Number(tok?.output ?? 0);
    const cc = Number(tok?.cache_create ?? 0);
    const cr = Number(tok?.cache_read ?? 0);
    return {
      id: d.id,
      name: d.name,
      createdAt: d.createdAt,
      userCount: d._count.users,
      totalTokens: inp + out + cc + cr,
      estimatedCostUsd: Math.round(calcCost(inp, out, cc, cr) * 100) / 100,
    };
  });

  return NextResponse.json({ departments: result });
}

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Department name is required" }, { status: 400 });
  }

  try {
    const department = await prisma.department.create({ data: { name } });
    return NextResponse.json({ department }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Department name already exists" }, { status: 409 });
  }
}
