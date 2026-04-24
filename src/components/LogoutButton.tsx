"use client";

export function LogoutButton({ enabled }: { enabled: boolean }) {
  if (!enabled) return null;
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button type="button" className="link-button" onClick={() => void logout()}>
      로그아웃
    </button>
  );
}
