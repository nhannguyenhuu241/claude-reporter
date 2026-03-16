import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { projectName, resolveDeptScope } from "@/lib/reportUtils";

export async function GET(req: NextRequest) {
  const { userIds, error } = await resolveDeptScope(req);
  if (error) return NextResponse.json({ error }, { status: 401 });

  const where: Record<string, unknown> = { projectPath: { not: null } };
  if (userIds !== null) {
    where.userId = userIds.length === 0 ? "__none__" : { in: userIds };
  }

  const agg = await prisma.session.groupBy({
    by: ["projectPath"],
    where,
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
  });

  const projects = agg
    .filter((r) => r.projectPath)
    .map((r) => ({
      name: projectName(r.projectPath),
      path: r.projectPath!,
      count: r._count.id,
    }));

  return NextResponse.json({ projects });
}
