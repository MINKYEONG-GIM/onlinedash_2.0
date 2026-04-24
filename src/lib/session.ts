import type { SessionOptions } from "iron-session";

export type SessionData = {
  loggedIn?: boolean;
};

function sessionPassword(): string {
  const p = process.env.SESSION_SECRET?.trim() ?? "";
  if (p.length >= 32) return p;
  if (process.env.NODE_ENV !== "production") {
    return "dev-secret-must-be-32-characters-min!";
  }
  throw new Error(
    "SESSION_SECRET must be set to a string of at least 32 characters (Vercel Environment Variables)."
  );
}

export function getSessionOptions(): SessionOptions {
  return {
    password: sessionPassword(),
    cookieName: "onlinedash_session",
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 14,
    },
  };
}
