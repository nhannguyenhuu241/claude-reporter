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

  let body: { departmentId?: string | null; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { departmentId?: string | null; email?: string } = {};

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
  } catch {
    return NextResponse.json({ error: "User not found or email conflict" }, { status: 404 });
  }
}
