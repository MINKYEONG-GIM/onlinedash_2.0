"use client";

import {
  ALL_BRANDS_LABEL,
  ALL_BRANDS_VALUE,
  BRANDS_LIST_UI,
  SEASON_OPTIONS,
} from "@/lib/constants";

type Props = {
  selectedSeasons: string[];
  selectedBrand: string;
};

export function DashboardFilters({
  selectedSeasons,
  selectedBrand,
}: Props) {
  return (
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
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              />
              {s}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="brand">브랜드</label>
        <select
          id="brand"
          name="brand"
          defaultValue={selectedBrand}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
        >
          <option value={ALL_BRANDS_VALUE}>{ALL_BRANDS_LABEL}</option>
          {BRANDS_LIST_UI.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true">
        필터 적용
      </button>
    </form>
  );
}
