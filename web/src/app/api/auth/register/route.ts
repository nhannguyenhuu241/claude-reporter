import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimiter";
import { setUserSessionCookie } from "@/lib/userAuth";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  // 5 registrations per 10 min per IP
  const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for") ?? "anon";
  if (!checkRateLimit(`register:${ip}`, 1, { max: 5, refillRate: 5, windowMs: 10 * 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { email?: string; password?: string; departmentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const password = body.password;
  if (!password || password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "Email already registered. Please login instead." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const createData: { email: string; passwordHash: string; departmentId?: string } = { email, passwordHash };
  if (body.departmentId) createData.departmentId = body.departmentId;

  const user = await prisma.user.create({
    data: createData,
    include: { department: { select: { id: true, name: true } } },
  });

  const res = NextResponse.json({
    uuid: user.id,
    email: user.email,
    isNew: true,
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
