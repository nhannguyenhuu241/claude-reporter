import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";

const CONFIRM_PHRASE = "CONFIRM_RESET";

export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { scope?: string; confirm?: string } = {};
  try { body = await req.json(); } catch { /* empty body is ok */ }

  // Require explicit confirmation phrase to prevent accidental data loss
  if (body.confirm !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Must include confirm: "${CONFIRM_PHRASE}" to proceed` },
      { status: 400 }
    );
  }

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
