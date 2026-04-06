/**
 * User session cookie auth.
 * Signs/verifies a compact HMAC-based JWT stored in an httpOnly cookie.
 * Token contains userId, email, role, departmentId so most requests
 * need no DB round-trip to resolve identity.
 *
 * Also supports API-key style auth via X-User-Email + X-User-UUID headers,
 * allowing programmatic access without a browser cookie session.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";

export const USER_COOKIE = "user_session";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface UserSession {
  userId: string;
  email: string;
  role: string;
  departmentId: string | null;
}

function secret(): string {
  const s = process.env.USER_SESSION_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      console.error("[auth] FATAL: USER_SESSION_SECRET is not set — tokens are trivially forgeable. Set this env var immediately.");
    }
    return "dev-secret-change-me";
  }
  return s;
}

export function signUserToken(session: UserSession): string {
  const payload = Buffer.from(
    JSON.stringify({ ...session, exp: Date.now() + TTL_MS })
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyUserToken(token: string): UserSession | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig, "base64url"), Buffer.from(expected, "base64url")))
      return null;
  } catch { return null; }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.exp || Date.now() > data.exp) return null;
    return {
      userId: data.userId,
      email: data.email,
      role: data.role,
      departmentId: data.departmentId ?? null,
    };
  } catch { return null; }
}

export function getUserSession(req: NextRequest): UserSession | null {
  const cookie = req.cookies.get(USER_COOKIE)?.value;
  if (!cookie) return null;
  return verifyUserToken(cookie);
}

export function setUserSessionCookie(res: NextResponse, session: UserSession): void {
  const token = signUserToken(session);
  res.cookies.set(USER_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: Math.floor(TTL_MS / 1000),
    path: "/",
  });
}

export function clearUserSessionCookie(res: NextResponse): void {
  res.cookies.set(USER_COOKIE, "", { httpOnly: true, maxAge: 0, path: "/" });
}

/**
 * API-key style auth via request headers:
 *   X-User-Email: user@example.com
 *   X-User-UUID:  <user.id>
 *
 * UUID possession is treated as identity proof (same as /api/auth/verify).
 * Email is required as a second factor to prevent pure UUID enumeration attacks.
 *
 * Returns null if headers are missing, UUID not found, or email does not match.
 * Rate limiting should be applied by callers for sensitive operations.
 */
export async function getUserFromApiCredentials(req: NextRequest): Promise<UserSession | null> {
  const uuid  = req.headers.get("x-user-uuid")?.trim();
  const email = req.headers.get("x-user-email")?.trim().toLowerCase();
  if (!uuid || !email) return null;

  const user = await prisma.user.findUnique({
    where: { id: uuid },
    select: { id: true, email: true, role: true, departmentId: true },
  });
  if (!user) return null;

  // Constant-time email compare to prevent timing-based enumeration
  const bufA = Buffer.from(user.email.toLowerCase());
  const bufB = Buffer.from(email);
  if (bufA.length !== bufB.length) return null;
  try {
    if (!timingSafeEqual(bufA, bufB)) return null;
  } catch { return null; }

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId ?? null,
  };
}

/**
 * Password-based auth via request headers:
 *   X-User-Email:    user@example.com
 *   X-User-Password: <plaintext password>
 *
 * Verifies with bcrypt — same logic as /api/auth/login but stateless (no cookie set).
 * Only succeeds when the user has a passwordHash set.
 *
 * Returns null if headers are missing, user not found, or password is wrong.
 * Rate limiting must be applied by callers.
 */
export async function getUserFromPasswordCredentials(req: NextRequest): Promise<UserSession | null> {
  const email    = req.headers.get("x-user-email")?.trim().toLowerCase();
  const password = req.headers.get("x-user-password");
  if (!email || !password) return null;

  const { compare } = await import("bcryptjs");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true, role: true, departmentId: true },
  });

  // Always run compare to prevent timing-based user enumeration
  const dummyHash = "$2a$10$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const valid = await compare(password, user?.passwordHash ?? dummyHash);
  if (!user || !valid) return null;

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId ?? null,
  };
}

/**
 * Combined auth: tries cookie session first, then X-User-Email + X-User-UUID headers,
 * then X-User-Email + X-User-Password headers.
 * Use this in API routes that should support both browser and programmatic access.
 */
export async function getUserFromRequest(req: NextRequest): Promise<UserSession | null> {
  const fromCookie = getUserSession(req);
  if (fromCookie) return fromCookie;

  const fromUuid = await getUserFromApiCredentials(req);
  if (fromUuid) return fromUuid;

  return getUserFromPasswordCredentials(req);
}
