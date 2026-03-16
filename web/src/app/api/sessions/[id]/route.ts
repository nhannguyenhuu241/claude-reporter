import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/adminAuth";
import { getUserSession } from "@/lib/userAuth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const isAdmin = checkAdminAuth(req);
  const userSession = getUserSession(req);

  if (!isAdmin && !userSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const session = await prisma.session.findUnique({
    where: { id },
    include: { events: { orderBy: { timestamp: "asc" } } },
  });

  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Admin sees any session.
  // Authenticated user can see their own sessions or unowned sessions.
  // Return 404 (not 403) to avoid confirming the session exists.
  if (!isAdmin && session.userId !== null && session.userId !== userSession!.userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(session);
}
