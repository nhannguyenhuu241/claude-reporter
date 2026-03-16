import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/userAuth";
import { checkAdminAuth } from "@/lib/adminAuth";

// Pages that require authentication
const PROTECTED = ["/sessions", "/report", "/dept", "/profile"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!needsAuth) return NextResponse.next();

  // /dept and /report/team require dept_head or admin
  const needsDeptHead = pathname === "/dept" || pathname.startsWith("/dept/");

  const isAdmin = checkAdminAuth(req);
  if (isAdmin) return NextResponse.next();

  const session = getUserSession(req);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (needsDeptHead && session.role !== "dept_head") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/sessions/:path*", "/report/:path*", "/dept/:path*", "/profile/:path*"],
};
