import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";

export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const departments = await prisma.department.findMany({
    include: {
      _count: { select: { users: true } },
      users: {
        select: {
          id: true,
          email: true,
          sessions: {
            select: {
              inputTokens: true,
              outputTokens: true,
              cacheCreationTokens: true,
              cacheReadTokens: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const result = departments.map((d) => {
    const totalTokens = d.users.reduce((sum, u) =>
      sum + u.sessions.reduce((s, sess) =>
        s + sess.inputTokens + sess.outputTokens + sess.cacheCreationTokens + sess.cacheReadTokens, 0), 0);

    const estimatedCostUsd = d.users.reduce((sum, u) =>
      sum + u.sessions.reduce((s, sess) =>
        s + (sess.inputTokens * 3 + sess.outputTokens * 15 + sess.cacheCreationTokens * 3.75 + sess.cacheReadTokens * 0.3) / 1_000_000, 0), 0);

    return {
      id: d.id,
      name: d.name,
      createdAt: d.createdAt,
      userCount: d._count.users,
      totalTokens,
      estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100,
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
