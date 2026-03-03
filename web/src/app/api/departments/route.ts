import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public endpoint — no auth required — used by login page
export async function GET() {
  const departments = await prisma.department.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ departments });
}
