import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return NextResponse.json({ error: "Admin chưa được cấu hình" }, { status: 500 });
  }

  if (email !== adminEmail || password !== adminPassword) {
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng" }, { status: 401 });
  }

  const token = Buffer.from(`${email}:${password}`).toString("base64");
  return NextResponse.json({ token });
}
