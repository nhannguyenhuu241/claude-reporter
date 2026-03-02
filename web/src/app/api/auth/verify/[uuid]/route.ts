import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params;

  const user = await prisma.user.findUnique({
    where: { id: uuid },
    select: { id: true, email: true, createdAt: true },
  });

  if (!user) {
    return NextResponse.json({ valid: false }, { status: 404 });
  }

  return NextResponse.json({ valid: true, email: user.email, createdAt: user.createdAt });
}
