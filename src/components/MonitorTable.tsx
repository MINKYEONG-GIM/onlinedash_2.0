import type { MonitorRow } from "@/lib/pipeline";

const TOOLTIP_RATE =
  "(초록불) 90% 초과\n(노란불) 80% 초과\n(빨간불) 80% 이하";
const TOOLTIP_AVG =
  "(초록불) 3일 이하\n(노란불) 5일 이하\n(빨간불) 5일 초과";

function fmt(n: number) {
  return `${Math.round(n).toLocaleString("ko-KR")}`;
}

function rateCell(rate: number, text: string, noReg: boolean) {
  if (noReg) return "-";
  const dot =
    rate <= 0.8 ? "dot-red" : rate <= 0.9 ? "dot-yellow" : "dot-green";
  return (
    <span className="rate-cell" title={TOOLTIP_RATE}>
      <span className={`dot ${dot}`} />
      {text}
    </span>
  );
}

function avgCell(val: string, noReg: boolean) {
  if (noReg) return "-";
  const raw = val.replace(/,/g, "").trim();
  if (raw === "" || raw === "-" || raw === "nan") {
    return (
      <span title={TOOLTIP_AVG} className="rate-cell">
        {val}
      </span>
    );
  }
  const num = parseFloat(raw);
  if (!Number.isFinite(num)) {
    return (
      <span title={TOOLTIP_AVG} className="rate-cell">
        {val}
      </span>
    );
  }
  const dot =
    num <= 3 ? "dot-green" : num <= 5 ? "dot-yellow" : "dot-red";
  return (
    <span className="rate-cell" title={TOOLTIP_AVG}>
      <span className={`dot ${dot}`} />
      {val}
    </span>
  );
}

export function MonitorTable({ rows }: { rows: MonitorRow[] }) {
  return (
    <div className="table-wrap">
      <table className="monitor-table">
        <thead>
          <tr>
            <th className="col-small">브랜드</th>
            <th>물류입고<br />스타일수</th>
            <th>온라인등록<br />스타일수</th>
            <th className="col-emphasis" title="온라인등록 스타일수 / 물류입고 입고스타일수">
              온라인등록율
            </th>
            <th className="col-small">포토인계<br />소요일수</th>
            <th className="col-small">포토<br />소요일수</th>
            <th className="col-small">상품등록<br />소요일수</th>
            <th className="col-emphasis">평균전체등록<br />소요일수</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.브랜드}>
              <td className="col-small">{r.브랜드}</td>
              <td className="col-small">{fmt(r.물류입고스타일수)}</td>
              <td className="col-small">
                {r.noReg ? "-" : fmt(Math.max(0, r.온라인등록스타일수))}
              </td>
              <td className="col-emphasis">
                {rateCell(r.온라인등록율, r._등록율, r.noReg)}
              </td>
              <td className="col-small">{r.noReg ? "-" : r.포토인계소요일수}</td>
              <td className="col-small">{r.noReg ? "-" : r.포토소요일수}</td>
              <td className="col-small">{r.noReg ? "-" : r.상품등록소요일수}</td>
              <td className="col-emphasis">
                {avgCell(r.평균전체등록소요일수, r.noReg)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
