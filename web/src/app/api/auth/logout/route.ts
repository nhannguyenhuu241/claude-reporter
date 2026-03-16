import { NextResponse } from "next/server";
import { clearUserSessionCookie } from "@/lib/userAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearUserSessionCookie(res);
  return res;
}
