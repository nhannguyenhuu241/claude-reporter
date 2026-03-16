import { NextRequest, NextResponse } from "next/server";
import { getUserSession } from "@/lib/userAuth";

export async function GET(req: NextRequest) {
  const session = getUserSession(req);
  if (!session) return NextResponse.json({ valid: false }, { status: 401 });
  return NextResponse.json({ valid: true, ...session });
}
