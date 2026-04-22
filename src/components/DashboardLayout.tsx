import { BRANDS_LIST_UI, SEASON_OPTIONS } from "@/lib/constants";
import type { DashboardPayload } from "@/lib/pipeline";
import { InoutTable } from "./InoutTable";
import { LogoutButton } from "./LogoutButton";
import { MonitorTable } from "./MonitorTable";

type Props = {
  data: DashboardPayload;
  selectedSeasons: string[];
  selectedBrand: string;
  showLogout: boolean;
};

export function DashboardLayout({
  data,
  selectedSeasons,
  selectedBrand,
  showLogout,
}: Props) {
  const updated = new Date(data.updatedAt);
  const timeStr = updated.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <div className="shell">
      <div className="header-row">
        <LogoutButton enabled={showLogout} />
      </div>
      <div className="head">
        <div>
          <div className="title-pill">온라인 리드타임 대시보드</div>
          <div className="update-time">업데이트시간 {timeStr}</div>
        </div>
        <form className="filters" method="get" action="/">
          <div>
            <label>연도</label>
            <div style={{ fontWeight: 600, padding: "0.35rem 0" }}>2026년</div>
          </div>
          <div>
            <label>시즌</label>
            <div className="season-grid">
              {SEASON_OPTIONS.map((s) => (
                <label key={s}>
                  <input
                    type="checkbox"
                    name="seasons"
                    value={s}
                    defaultChecked={selectedSeasons.includes(s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="brand">브랜드</label>
            <select id="brand" name="brand" defaultValue={selectedBrand}>
              {BRANDS_LIST_UI.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="sr-only" htmlFor="apply">
              적용
            </label>
            <button id="apply" type="submit">
              필터 적용
            </button>
          </div>
        </form>
      </div>

      <div className="kpi-row">
        <div className="kpi-card">
          <span className="label">입고</span>
          <span className="value">
            {data.kpis.입고억} 억원 / {data.kpis.입고STY.toLocaleString("ko-KR")}STY
          </span>
        </div>
        <div className="kpi-card">
          <span className="label">출고</span>
          <span className="value">
            {data.kpis.출고억} 억원 / {data.kpis.출고STY.toLocaleString("ko-KR")}STY
          </span>
        </div>
        <div className="kpi-card">
          <span className="label">전체 판매</span>
          <span className="value">
            {data.kpis.판매억} 억원 / {data.kpis.판매STY.toLocaleString("ko-KR")}STY
          </span>
        </div>
      </div>

      <div className="section-title">(온라인) 상품등록 모니터링</div>
      <div className="section-note">
        가등록한 스타일은 등록으로 인정되지 않습니다
      </div>
      <MonitorTable rows={data.monitor} />

      <div className="section-title">(온/오프 전체) 입출고 현황</div>
      <div className="section-note" style={{ fontSize: "1.05rem", color: "#cbd5e1" }}>
        STY 기준 통계
      </div>
      <div className="section-note">브랜드명을 클릭하면 시즌별 수치를 보실 수 있습니다</div>
      <InoutTable
        rows={data.inoutRows}
        brandSeasonByBrand={data.brandSeasonByBrand}
      />

      <div className="footer-note">
        문의가 있으시면 CAIO실 김민경(kim_minkyeong07@eland.co.kr)로 부탁드립니다
      </div>
    </div>
  );
}
