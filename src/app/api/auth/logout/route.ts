import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSessionOptions, type SessionData } from "@/lib/session";

export async function POST() {
  const session = await getIronSession<SessionData>(
    cookies(),
    getSessionOptions()
  );
  session.destroy();
  return NextResponse.json({ ok: true });
}
