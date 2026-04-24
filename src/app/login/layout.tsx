import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!process.env.DASHBOARD_PASSWORD?.trim()) {
    redirect("/");
  }
  return children;
}
