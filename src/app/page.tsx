import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ALL_BRANDS_VALUE, SEASON_OPTIONS } from "@/lib/constants";
import { getDashboardData } from "@/lib/dashboard";
import { getSessionOptions, type SessionData } from "@/lib/session";
import { DashboardLayout } from "@/components/DashboardLayout";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseList(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function parseSeasons(sp: string | string[] | undefined): string[] {
  const raw = parseList(sp).filter(Boolean);
  if (!raw.length) return [...SEASON_OPTIONS];
  return raw;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const needAuth = !!process.env.DASHBOARD_PASSWORD?.trim();
  if (needAuth) {
    const session = await getIronSession<SessionData>(
      cookies(),
      getSessionOptions()
    );
    if (!session.loggedIn) {
      redirect("/login");
    }
  }

  const baseId = process.env.BASE_SPREADSHEET_ID?.trim() ?? "";
  const onlineId = process.env.ONLINE_SPREADSHEET_ID?.trim() ?? "";
  if (!baseId || !onlineId) {
    return (
      <div className="shell">
        <div className="section-title">설정 오류</div>
        <p style={{ color: "#cbd5e1" }}>
          Vercel 환경 변수에{" "}
          <code>BASE_SPREADSHEET_ID</code>, <code>ONLINE_SPREADSHEET_ID</code>를
          설정해 주세요. 서비스 계정 JSON은{" "}
          <code>GOOGLE_SERVICE_ACCOUNT_JSON</code>에 넣어 주세요.
        </p>
      </div>
    );
  }

  const selectedSeasons = parseSeasons(searchParams.seasons);
  const brandRaw = searchParams.brand;
  const selectedBrand =
    typeof brandRaw === "string" && brandRaw.trim()
      ? brandRaw.trim()
      : ALL_BRANDS_VALUE;

  try {
    const data = await getDashboardData(
      baseId,
      onlineId,
      selectedSeasons,
      selectedBrand === ALL_BRANDS_VALUE ? null : selectedBrand
    );
    return (
      <DashboardLayout
        data={data}
        selectedSeasons={selectedSeasons}
        selectedBrand={selectedBrand}
        showLogout={needAuth}
      />
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return (
      <div className="shell">
        <div className="section-title">데이터를 불러오지 못했습니다</div>
        <p style={{ color: "#cbd5e1" }}>
          Google API 또는 환경 변수 설정을 확인해 주세요.
        </p>
        <pre
          style={{
            color: "#fecaca",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {msg}
        </pre>
      </div>
    );
  }
}
