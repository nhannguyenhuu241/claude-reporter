import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { scope?: string } = {};
  try { body = await req.json(); } catch { /* empty body is ok */ }

  const scope = body.scope ?? "all"; // "all" | "sessions" | "users"

  if (scope === "sessions" || scope === "all") {
    await prisma.event.deleteMany();
    await prisma.session.deleteMany();
  }
  if (scope === "all") {
    await prisma.user.deleteMany();
  }

  return NextResponse.json({ ok: true, scope, clearedAt: new Date().toISOString() });
}
