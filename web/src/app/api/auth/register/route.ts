import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  let body: { email?: string; departmentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });

  const createData: { email: string; departmentId?: string } = { email };
  if (body.departmentId) createData.departmentId = body.departmentId;

  const updateData = body.departmentId ? { departmentId: body.departmentId } : {};

  const user = await prisma.user.upsert({
    where: { email },
    create: createData,
    update: updateData,
    include: { department: { select: { id: true, name: true } } },
  });

  return NextResponse.json({
    uuid: user.id,
    email: user.email,
    isNew: !existing,
    department: user.department,
  });
}
