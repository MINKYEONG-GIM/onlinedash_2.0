"use client";

import { Fragment, useState } from "react";
import type { InoutRow } from "@/lib/pipeline";

type Props = {
  rows: InoutRow[];
  brandSeasonByBrand: Record<string, InoutRow[]>;
};

const COLS = [
  "발주 STY수",
  "발주액",
  "입고 STY수",
  "입고액",
  "출고 STY수",
  "출고액",
  "판매 STY수",
  "판매액",
] as const;

export function InoutTable({ rows, brandSeasonByBrand }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  function toggle(brand: string) {
    setOpen((o) => ({ ...o, [brand]: !o[brand] }));
  }

  return (
    <div className="inout-wrap">
      <table className="inout-table">
        <thead>
          <tr>
            <th>브랜드</th>
            {COLS.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const brand = String(row["브랜드"] ?? "");
            const expanded = !!open[brand];
            const seasons = brandSeasonByBrand[brand] ?? [];
            return (
              <Fragment key={brand}>
                <tr className="brand-row">
                  <td className="brand-cell">
                    <button
                      type="button"
                      className="brand-toggle"
                      aria-expanded={expanded}
                      onClick={() => toggle(brand)}
                    >
                      <span>{brand}</span>
                      <span className="caret">{expanded ? "△" : "▽"}</span>
                    </button>
                  </td>
                  {COLS.map((c) => (
                    <td key={c}>{String(row[c] ?? "")}</td>
                  ))}
                </tr>
                {expanded
                  ? seasons.map((srow, i) => (
                      <tr key={`${brand}-s-${i}`} className="season-row">
                        <td className="season-indent">└ {String(srow["시즌"] ?? "")}</td>
                        {COLS.map((c) => (
                          <td key={c}>{String(srow[c] ?? "")}</td>
                        ))}
                      </tr>
                    ))
                  : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <style jsx>{`
        .inout-wrap {
          margin-top: 0.5rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
          background: var(--panel);
        }
        .inout-table {
          width: 100%;
          border-collapse: collapse;
        }
        .inout-table th,
        .inout-table td {
          border: 1px solid var(--border);
          padding: 6px 8px;
          text-align: center;
          font-size: 0.92rem;
        }
        .inout-table thead th {
          background: var(--bg);
          font-weight: 700;
        }
        .brand-row {
          background: #111827;
        }
        .brand-cell {
          text-align: left;
        }
        .brand-toggle {
          all: unset;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: 700;
          color: var(--text);
        }
        .caret {
          color: var(--muted);
          font-size: 0.85rem;
        }
        .season-row td {
          background: var(--bg);
          color: #cbd5e1;
          font-size: 0.88rem;
        }
        .season-indent {
          text-align: left !important;
          padding-left: 18px !important;
        }
      `}</style>
    </div>
  );
}
