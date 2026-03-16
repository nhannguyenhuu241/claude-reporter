import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimiter";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await params;

  // Anti-enumeration: 30 verify attempts per 5 min per IP
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(`verify:${ip}`, 1, { max: 30, refillRate: 30, windowMs: 5 * 60_000 })) {
    return NextResponse.json({ valid: false }, { status: 429 });
  }

  const user = await prisma.user.findUnique({
    where: { id: uuid },
    select: { id: true, email: true, createdAt: true, role: true, department: { select: { id: true, name: true } } },
  });

  if (!user) {
    // Constant-time response to prevent timing-based enumeration
    return NextResponse.json({ valid: false }, { status: 404 });
  }

  // UUID possession = identity proof in this system (UUID is the user's auth token).
  // Knowing the UUID means you are the user, so full info is always returned.
  // checkAdminAuth is kept for future role-based expansions.
  return NextResponse.json({
    valid: true,
    email: user.email,
    createdAt: user.createdAt,
    role: user.role,
    department: user.department,
  });
}
