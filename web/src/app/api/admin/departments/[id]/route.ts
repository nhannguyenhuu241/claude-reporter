import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
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
    const department = await prisma.department.update({ where: { id }, data: { name } });
    return NextResponse.json({ department });
  } catch {
    return NextResponse.json({ error: "Not found or name conflict" }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Unlink users before deleting
  await prisma.user.updateMany({ where: { departmentId: id }, data: { departmentId: null } });
  await prisma.department.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
