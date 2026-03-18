import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserSession, setUserSessionCookie } from "@/lib/userAuth";

export async function GET(req: NextRequest) {
  const session = getUserSession(req);
  if (!session) return NextResponse.json({ valid: false }, { status: 401 });

  // Always fetch fresh user data from DB so role/departmentId stay in sync
  // even when admin changes them after the user last logged in.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, role: true, departmentId: true },
  });

  if (!user) return NextResponse.json({ valid: false }, { status: 401 });

  const fresh = {
    userId: user.id,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId ?? null,
  };

  const res = NextResponse.json({ valid: true, ...fresh });

  // Re-issue cookie if anything changed (role, dept assignment, etc.)
  const stale =
    fresh.role !== session.role ||
    fresh.departmentId !== session.departmentId ||
    fresh.email !== session.email;
  if (stale) setUserSessionCookie(res, fresh);

  return res;
}
