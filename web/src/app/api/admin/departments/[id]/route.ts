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
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") return NextResponse.json({ error: "Department not found" }, { status: 404 });
    if (code === "P2002") return NextResponse.json({ error: "Name already in use" }, { status: 409 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Wrap both steps in a transaction so no new user can be linked to this
    // department between the updateMany and delete calls.
    await prisma.$transaction([
      prisma.user.updateMany({ where: { departmentId: id }, data: { departmentId: null } }),
      prisma.department.delete({ where: { id } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "P2025") return NextResponse.json({ error: "Department not found" }, { status: 404 });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
