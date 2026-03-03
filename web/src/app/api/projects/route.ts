import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId") ?? null;

  const sessions = await prisma.session.findMany({
    where: {
      projectPath: { not: null },
      ...(userId ? { userId } : {}),
    },
    select: { projectPath: true },
  });

  const projectMap = new Map<string, { name: string; path: string; count: number }>();
  for (const s of sessions) {
    if (!s.projectPath) continue;
    const name = s.projectPath.split("/").filter(Boolean).pop() ?? s.projectPath;
    const key = s.projectPath;
    const existing = projectMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      projectMap.set(key, { name, path: s.projectPath, count: 1 });
    }
  }

  const projects = Array.from(projectMap.values()).sort((a, b) => b.count - a.count);
  return NextResponse.json({ projects });
}
