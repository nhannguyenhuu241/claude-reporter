import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimiter";
import { setUserSessionCookie } from "@/lib/userAuth";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  // 10 login attempts per 5 min per IP
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(`login:${ip}`, 1, { max: 10, refillRate: 10, windowMs: 5 * 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { department: { select: { id: true, name: true } } },
  });

  // Constant-time compare even on not-found to prevent timing attacks
  const dummyHash = "$2a$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const hash = user?.passwordHash ?? dummyHash;
  const valid = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const res = NextResponse.json({
    uuid: user.id,
    email: user.email,
    role: user.role,
    department: user.department,
  });

  setUserSessionCookie(res, {
    userId: user.id,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId ?? null,
  });

  return res;
}
