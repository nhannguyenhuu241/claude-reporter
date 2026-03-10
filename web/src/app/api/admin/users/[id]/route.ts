import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: { departmentId?: string | null; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { departmentId?: string | null; email?: string; role?: string } = {};

  if ("departmentId" in body) {
    data.departmentId = body.departmentId ?? null;
  }

  if (body.email) {
    const trimmed = body.email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    data.email = trimmed;
  }

  if (body.role) {
    if (!["member", "dept_head"].includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    data.role = body.role;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
      include: { department: { select: { id: true, name: true } } },
    });
    return NextResponse.json({ user });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Unique constraint") || msg.includes("unique")) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
}
