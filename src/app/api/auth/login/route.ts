import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getSessionOptions, type SessionData } from "@/lib/session";

export async function POST(req: Request) {
  const expected = process.env.DASHBOARD_PASSWORD?.trim() ?? "";
  if (!expected) {
    return NextResponse.json(
      { error: "비밀번호 인증이 비활성화되어 있습니다." },
      { status: 400 }
    );
  }
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const pw = (body.password ?? "").trim();
  const a = Buffer.from(pw, "utf8");
  const b = Buffer.from(expected, "utf8");
  const ok =
    a.length === b.length && timingSafeEqual(a, b);
  if (!ok) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  const session = await getIronSession<SessionData>(
    cookies(),
    getSessionOptions()
  );
  session.loggedIn = true;
  await session.save();
  return NextResponse.json({ ok: true });
}
