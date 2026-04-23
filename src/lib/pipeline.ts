import * as XLSX from "xlsx";
import type { SourceBundle } from "./google";
import {
  BRAND_KEY_TO_SHEET_NAME,
  BRAND_TO_KEY,
  BU_GROUPS,
  NO_REG_SHEET_BRANDS,
  SEASON_OPTIONS,
  STYLE_PREFIX_TO_BRAND,
} from "./constants";

export type DashboardFilters = {
  selectedSeasons: string[];
  selectedBrand: string | null;
};

function norm(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, "");
}

function findCol(keys: string[], cols: string[]): string | null {
  for (const k of keys) {
    for (const c of cols) {
      if (String(c).trim() === k) return c;
    }
  }
  for (const k of keys) {
    for (const c of cols) {
      if (String(c).includes(k)) return c;
    }
  }
  return null;
}

function readWorkbook(buf: Buffer | null): XLSX.WorkBook | null {
  if (!buf || buf.length === 0) return null;
  try {
    return XLSX.read(buf, { type: "buffer", cellDates: true });
  } catch {
    return null;
  }
}

function sheetToAoa(wb: XLSX.WorkBook, sheetName: string): unknown[][] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: false,
  }) as unknown[][];
}

function aoaToObjects(
  rows: unknown[][],
  headerRow: number
): { columns: string[]; records: Record<string, unknown>[] } {
  if (rows.length <= headerRow) return { columns: [], records: [] };
  const header = (rows[headerRow] ?? []).map((c) => String(c ?? "").trim());
  const records: Record<string, unknown>[] = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const line = rows[i] ?? [];
    const obj: Record<string, unknown> = {};
    for (let j = 0; j < header.length; j++) {
      const key = header[j];
      if (!key) continue;
      obj[key] = line[j] ?? null;
    }
    records.push(obj);
  }
  return { columns: header, records };
}

function loadBaseInout(
  ioBytes: Buffer | null,
  targetSheetName?: string | null
): { columns: string[]; records: Record<string, unknown>[] } {
  const wb = readWorkbook(ioBytes);
  if (!wb) return { columns: [], records: [] };
  let sheetName: string | undefined;
  if (targetSheetName && wb.SheetNames.includes(targetSheetName)) {
    sheetName = targetSheetName;
  } else {
    const candidates = wb.SheetNames.filter((s) => !String(s).startsWith("_"));
    sheetName = candidates[0] ?? wb.SheetNames[wb.SheetNames.length - 1];
  }
  if (!sheetName) return { columns: [], records: [] };
  const preview = sheetToAoa(wb, sheetName);
  const kw = ["브랜드", "스타일", "최초입고일", "입고", "출고", "판매"];
  let bestRow: number | null = null;
  let bestScore = 0;
  for (let i = 0; i < Math.min(20, preview.length); i++) {
    const row = (preview[i] ?? []).map((c) => String(c ?? ""));
    const score = row.filter((cell) => kw.some((k) => cell.includes(k))).length;
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }
  const headerRow =
    bestRow !== null && bestScore > 0 ? bestRow : 0;
  const { columns, records } = aoaToObjects(preview, headerRow);
  const styleCol = findCol(["스타일코드", "스타일"], columns);
  if (styleCol && columns.includes(styleCol)) {
    for (const r of records) {
      const v = String(r[styleCol] ?? "").trim().toLowerCase().slice(0, 2);
      const brand = STYLE_PREFIX_TO_BRAND[v];
      if (brand) r["브랜드"] = brand;
    }
  }
  return { columns, records };
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseCellDate(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  const n = toNum(v);
  if (n !== null && n >= 1 && n <= 60000) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + n * 86400000);
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}

function colIdx(headerVals: string[], key: string): number | null {
  for (let i = 0; i < headerVals.length; i++) {
    if (norm(headerVals[i]).includes(key)) return i;
  }
  return null;
}

function findRegisterHeader(
  dfRaw: unknown[][]
): { row: number; norm: string[] } | null {
  for (let i = 0; i < Math.min(30, dfRaw.length); i++) {
    const row = (dfRaw[i] ?? []).map((c) => norm(c));
    const hasStyle = row.some((v) => v.includes("스타일코드") || v.includes("스타일"));
    const hasReg = row.some((v) => v.includes("공홈등록일"));
    if (hasStyle && hasReg) return { row: i, norm: row };
  }
  return null;
}

function normSeason(val: unknown): string {
  if (val === null || val === undefined) return "";
  const n = parseInt(String(val), 10);
  if (!isNaN(n) && n >= 1900 && n <= 2100) return "";
  if (!isNaN(n) && n > -100 && n < 100) return String(n);
  let s = String(val).trim().replace(/시즌/g, "").replace(/\s+/g, "");
  if (/\.0$/.test(s) && /^-?\d+\.0$/.test(s)) {
    const head = s[0];
    return head === "-" ? (s[1] ?? "") : head;
  }
  if (!s || (s.match(/^\d+$/) && s.length >= 3)) return "";
  s = s.toUpperCase();
  if (s.length >= 2 && /^[A-Za-z]/.test(s[0])) return s[1] ?? "";
  return s[0] ?? "";
}

function regdateCellFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === "nan") return false;
  return true;
}

function loadBrandRegisterDf(
  ioBytes: Buffer | null,
  targetSheetName?: string | null
): {
  스타일코드: string;
  시즌: string;
  온라인상품등록여부: string;
  제외여부: string;
}[] {
  const wb = readWorkbook(ioBytes);
  if (!wb) return [];
  const names = targetSheetName
    ? wb.SheetNames.includes(targetSheetName)
      ? [targetSheetName]
      : []
    : wb.SheetNames;
  for (const sheetName of names) {
    const dfRaw = sheetToAoa(wb, sheetName);
    const found = findRegisterHeader(dfRaw);
    if (!found) continue;
    const { row: headerRowIdx, norm: headerVals } = found;
    const styleCol =
      colIdx(headerVals, "스타일코드") ?? colIdx(headerVals, "스타일");
    const regdateCol = colIdx(headerVals, "공홈등록일");
    const seasonCol = colIdx(headerVals, "시즌");
    const excludeCol = colIdx(headerVals, "제외");
    if (styleCol === null || regdateCol === null) continue;
    const out: {
      스타일코드: string;
      시즌: string;
      온라인상품등록여부: string;
      제외여부: string;
    }[] = [];
    for (let r = headerRowIdx + 1; r < dfRaw.length; r++) {
      const line = dfRaw[r] ?? [];
      const style = String(line[styleCol] ?? "").trim();
      if (!style || style === "nan") continue;
      const reg = line[regdateCol];
      const ok = regdateCellFilled(reg);
      const season =
        seasonCol !== null && seasonCol < line.length
          ? String(line[seasonCol] ?? "").trim()
          : "";
      const ex =
        excludeCol !== null && excludeCol < line.length
          ? String(line[excludeCol] ?? "").trim()
          : "";
      out.push({
        스타일코드: style,
        시즌: season,
        온라인상품등록여부: ok ? "등록" : "미등록",
        제외여부: ex,
      });
    }
    return out;
  }
  return [];
}

export function seasonMatchesCell(seasonVal: unknown, selected: string[]): boolean {
  if (!selected.length) return true;
  const s = String(seasonVal ?? "").trim();
  for (const sel of selected) {
    const t = String(sel).trim();
    if (s === t) return true;
    if (s.startsWith(t)) {
      const next = s.slice(t.length, t.length + 1);
      const restOk =
        s.length === t.length ||
        !next ||
        !/[0-9A-Za-z가-힣]/.test(next);
      if (restOk) return true;
    }
  }
  return false;
}

function baseStyleToFirstInMap(ioBytes: Buffer | null): Map<string, Date> {
  const { columns, records } = loadBaseInout(ioBytes, null);
  const styleCol = findCol(["스타일코드", "스타일"], columns);
  const firstCol = findCol(["최초입고일", "입고일"], columns);
  const map = new Map<string, Date>();
  if (!styleCol || !firstCol) return map;
  for (const r of records) {
    const st = norm(r[styleCol]);
    if (!st) continue;
    const dt = parseCellDate(r[firstCol]);
    if (!dt) continue;
    const prev = map.get(st);
    if (!prev || dt < prev) map.set(st, dt);
  }
  return map;
}

export function countRegisteredStylesFromRegisterSheet(
  sources: SourceBundle,
  brandName: string,
  selectedSeasons: string[],
  seasonOptions: string[]
): number | null {
  if (NO_REG_SHEET_BRANDS.has(brandName)) return null;
  const brandKey = BRAND_TO_KEY[brandName];
  if (!brandKey) return null;
  const regBytes = sources.onlineByBrand[brandKey];
  if (!regBytes) return null;
  const sheet = BRAND_KEY_TO_SHEET_NAME[brandKey];
  const dfReg = loadBrandRegisterDf(regBytes, sheet);
  if (!dfReg.length) return 0;
  let d = dfReg.filter(
    (x) =>
      x.온라인상품등록여부 === "등록" &&
      (x.제외여부 ?? "").trim() === "포함"
  );
  if (
    selectedSeasons.length &&
    seasonOptions.length &&
    new Set(selectedSeasons).size !== new Set(seasonOptions).size
  ) {
    d = d.filter((row) => seasonMatchesCell(row.시즌, selectedSeasons));
  }
  const uniq = new Set(d.map((x) => norm(x.스타일코드)));
  return uniq.size;
}

function parseDateSeriesVal(v: unknown): Date | null {
  if (v === 0 || v === "0") return null;
  return parseCellDate(v);
}

export function loadBrandRegisterAvgDays(
  regBytes: Buffer | null,
  inoutBytes: Buffer | null,
  selectedSeasonsTuple: string[] | null,
  targetSheetName?: string | null
): Record<string, number | null> | null {
  if (!regBytes?.length) return null;
  const baseMap = baseStyleToFirstInMap(inoutBytes);
  if (!baseMap.size) return null;
  const wb = readWorkbook(regBytes);
  if (!wb) return null;
  const names = targetSheetName
    ? wb.SheetNames.includes(targetSheetName)
      ? [targetSheetName]
      : []
    : wb.SheetNames;
  for (const sheetName of names) {
    const dfRaw = sheetToAoa(wb, sheetName);
    const found = findRegisterHeader(dfRaw);
    if (!found) continue;
    const { row: headerRowIdx, norm: headerVals } = found;
    const styleCol =
      colIdx(headerVals, "스타일코드") ?? colIdx(headerVals, "스타일");
    const regdateCol = colIdx(headerVals, "공홈등록일");
    const seasonCol = colIdx(headerVals, "시즌");
    const photoHandoverCol = colIdx(headerVals, "포토인계일");
    const retouchDoneCol = colIdx(headerVals, "리터칭완료일");
    if (styleCol === null || regdateCol === null) continue;
    let dataRows: unknown[][] = [];
    for (let r = headerRowIdx + 1; r < dfRaw.length; r++) {
      dataRows.push(dfRaw[r] ?? []);
    }
    if (selectedSeasonsTuple?.length && seasonCol !== null) {
      const normSel = selectedSeasonsTuple.map((x) => normSeason(x)).filter(Boolean);
      if (normSel.length) {
        dataRows = dataRows.filter((line) => {
          const raw = String(line[seasonCol] ?? "").trim().toUpperCase();
          const ns = normSeason(line[seasonCol]);
          if (!normSel.includes(ns)) return false;
          return normSel.some((s) => new RegExp(`^G?${s}$`).test(raw));
        });
      }
    }
    if (!dataRows.length) continue;
    const totalDiffs: number[] = [];
    const photoHandoverDiffs: number[] = [];
    const photoDiffs: number[] = [];
    const registerDiffs: number[] = [];
    const dfCalc: { style: string; regDt: Date }[] = [];
    for (const line of dataRows) {
      const styleNorm = norm(line[styleCol]);
      const regDt = parseDateSeriesVal(line[regdateCol]);
      if (styleNorm && regDt) dfCalc.push({ style: styleNorm, regDt });
    }
    for (const row of dfCalc) {
      const baseDt = baseMap.get(row.style);
      if (!baseDt) continue;
      const diff = Math.floor(
        (row.regDt.getTime() - baseDt.getTime()) / 86400000
      );
      if (diff >= 0) totalDiffs.push(diff);
    }
    for (const line of dataRows) {
      const styleNorm = norm(line[styleCol]);
      const regDt = parseDateSeriesVal(line[regdateCol]);
      const baseDt = baseMap.get(styleNorm);
      if (!styleNorm || !regDt || !baseDt) continue;
      const photoDt =
        photoHandoverCol !== null && photoHandoverCol < line.length
          ? parseDateSeriesVal(line[photoHandoverCol])
          : null;
      const retouchDt =
        retouchDoneCol !== null && retouchDoneCol < line.length
          ? parseDateSeriesVal(line[retouchDoneCol])
          : null;
      if (photoDt && photoHandoverCol !== null) {
        const d = Math.floor(
          (photoDt.getTime() - baseDt.getTime()) / 86400000
        );
        photoHandoverDiffs.push(Math.max(0, d));
      }
      if (retouchDt && photoDt && retouchDoneCol !== null) {
        const d = Math.floor(
          (retouchDt.getTime() - photoDt.getTime()) / 86400000
        );
        photoDiffs.push(Math.max(0, d));
      }
      if (retouchDt && retouchDoneCol !== null) {
        const d = Math.floor(
          (regDt.getTime() - retouchDt.getTime()) / 86400000
        );
        registerDiffs.push(Math.max(0, d));
      }
    }
    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
    return {
      평균전체등록소요일수: avg(totalDiffs),
      포토인계소요일수: avg(photoHandoverDiffs),
      포토소요일수: avg(photoDiffs),
      상품등록소요일수: avg(registerDiffs),
    };
  }
  return null;
}

function pickSeason(
  seasons: unknown[],
  inFlags: boolean[]
): string {
  for (let i = 0; i < seasons.length; i++) {
    if (inFlags[i]) {
      const s = String(seasons[i] ?? "").trim();
      if (s) return s;
    }
  }
  return "";
}

export function buildStyleTableAll(sources: SourceBundle): {
  브랜드: string;
  스타일코드: string;
  시즌: string;
  입고여부: boolean;
  출고여부: boolean;
  온라인상품등록여부: string;
}[] {
  const baseBytes = sources.inout;
  let base = loadBaseInout(baseBytes, "물류입고스타일수");
  if (!base.records.length && baseBytes) {
    base = loadBaseInout(baseBytes, null);
  }
  const { columns, records } = base;
  if (!records.length) return [];
  const styleCol = findCol(["스타일코드", "스타일"], columns);
  const brandCol = findCol(["브랜드(Now:단품)"], columns);
  const seasonCol = findCol(["시즌", "season"], columns);
  const firstInCol = findCol(["최초입고일", "입고일"], columns);
  const outAmtCol = findCol(["출고액"], columns);
  const inQtyCol = findCol(["입고량"], columns);
  const inAmtCol = findCol(["누적입고액", "입고액"], columns);
  if (!styleCol || !brandCol) return [];
  const groups = new Map<
    string,
    {
      brand: string;
      style: string;
      seasons: unknown[];
      inFlags: boolean[];
      outFlags: boolean[];
    }
  >();
  for (const r of records) {
    const style = String(r[styleCol] ?? "").trim();
    if (!style) continue;
    const brand = String(r["브랜드"] ?? r[brandCol] ?? "").trim();
    const season = seasonCol ? r[seasonCol] : "";
    let inDateOk = false;
    if (firstInCol && firstInCol in r) {
      const dt = parseCellDate(r[firstInCol]);
      inDateOk = dt !== null;
      const num = toNum(r[firstInCol]);
      if (num !== null && num >= 1 && num <= 60000) inDateOk = true;
    }
    const hasQty =
      inQtyCol && inQtyCol in r
        ? (toNum(r[inQtyCol]) ?? 0) > 0
        : false;
    const hasAmt =
      inAmtCol && inAmtCol in r
        ? (toNum(r[inAmtCol]) ?? 0) > 0
        : false;
    const 입고 = inDateOk || hasQty || hasAmt;
    const outAmt =
      outAmtCol && outAmtCol in r ? toNum(r[outAmtCol]) ?? 0 : 0;
    const 출고 = outAmt > 0;
    const key = `${brand}\u0000${style}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        brand,
        style,
        seasons: [],
        inFlags: [],
        outFlags: [],
      };
      groups.set(key, g);
    }
    g.seasons.push(season);
    g.inFlags.push(입고);
    g.outFlags.push(출고);
  }
  const rows: {
    브랜드: string;
    스타일코드: string;
    시즌: string;
    입고여부: boolean;
    출고여부: boolean;
    온라인상품등록여부: string;
  }[] = [];
  for (const g of groups.values()) {
    const 시즌 = pickSeason(g.seasons, g.inFlags);
    const 입고여부 = g.inFlags.some(Boolean);
    const 출고여부 = g.outFlags.some(Boolean);
    rows.push({
      브랜드: g.brand,
      스타일코드: g.style,
      시즌,
      입고여부,
      출고여부,
      온라인상품등록여부: "미등록",
    });
  }
  const byBrand = new Map<string, typeof rows>();
  for (const row of rows) {
    const arr = byBrand.get(row.브랜드) ?? [];
    arr.push(row);
    byBrand.set(row.브랜드, arr);
  }
  const out: typeof rows = [];
  for (const [brandName, bAgg] of byBrand) {
    const brandKey = BRAND_TO_KEY[brandName];
    if (brandKey) {
      const regBytes = sources.onlineByBrand[brandKey];
      const dfReg = loadBrandRegisterDf(
        regBytes,
        BRAND_KEY_TO_SHEET_NAME[brandKey]
      );
      if (dfReg.length) {
        const regMap = new Map<string, string>();
        for (const r of dfReg) {
          const k = norm(r.스타일코드);
          const isReg = r.온라인상품등록여부 === "등록";
          const prev = regMap.get(k) === "등록";
          regMap.set(k, prev || isReg ? "등록" : "미등록");
        }
        for (const r of bAgg) {
          const reg = regMap.get(norm(r.스타일코드)) ?? "미등록";
          out.push({
            ...r,
            온라인상품등록여부: reg || "미등록",
          });
        }
        continue;
      }
    }
    for (const r of bAgg) {
      out.push({ ...r, 온라인상품등록여부: "미등록" });
    }
  }
  return out;
}

export type InoutRow = Record<string, string>;

export function buildInoutAggregates(ioBytes: Buffer | null): {
  rows: InoutRow[];
  agg: {
    brandInQty: Record<string, number>;
    brandOutQty: Record<string, number>;
    brandSaleQty: Record<string, number>;
  };
  brandSeasonRows: {
    브랜드: string;
    시즌: string;
    발주STY수: number;
    발주액: number;
    입고STY수: number;
    입고액: number;
    출고STY수: number;
    출고액: number;
    판매STY수: number;
    판매액: number;
  }[];
} {
  const { columns, records } = loadBaseInout(ioBytes, "물류입고스타일수");
  if (!records.length) {
    return {
      rows: [],
      agg: { brandInQty: {}, brandOutQty: {}, brandSaleQty: {} },
      brandSeasonRows: [],
    };
  }
  const styleCol = findCol(["스타일코드", "스타일"], columns);
  const brandCol = findCol(["브랜드(Now:단품)"], columns);
  if (!styleCol || !brandCol) {
    return {
      rows: [],
      agg: { brandInQty: {}, brandOutQty: {}, brandSaleQty: {} },
      brandSeasonRows: [],
    };
  }
  const orderQtyCol = findCol(["발주 STY", "발주수", "발주량"], columns);
  const orderAmtCol = findCol(["발주액"], columns);
  const inAmtCol = findCol(["누적입고액", "입고액"], columns);
  const outAmtCol = findCol(["출고액"], columns);
  const saleAmtCol = findCol(["누적판매액", "판매액"], columns);
  const firstInCol = findCol(["최초입고일", "입고일"], columns);
  const inQtyCol = findCol(["입고량"], columns);
  const seasonCol = findCol(["시즌", "season"], columns);

  type R = {
    style: string;
    brand: string;
    season: string;
    _in: boolean;
    _out: boolean;
    _sale: boolean;
    raw: Record<string, unknown>;
  };
  const parsed: R[] = [];
  for (const r of records) {
    const style = String(r[styleCol] ?? "").trim();
    if (!style) continue;
    const brand = String(r["브랜드"] ?? r[brandCol] ?? "").trim();
    const season = seasonCol ? String(r[seasonCol] ?? "").trim() : "";
    let inDateOk = false;
    if (firstInCol && firstInCol in r) {
      inDateOk = parseCellDate(r[firstInCol]) !== null;
      const num = toNum(r[firstInCol]);
      if (num !== null && num >= 1 && num <= 60000) inDateOk = true;
    }
    const hasQty =
      inQtyCol && inQtyCol in r
        ? (toNum(r[inQtyCol]) ?? 0) > 0
        : false;
    const hasAmt =
      inAmtCol && inAmtCol in r
        ? (toNum(r[inAmtCol]) ?? 0) > 0
        : false;
    const _in = inDateOk || hasQty || hasAmt;
    const _out =
      outAmtCol && outAmtCol in r
        ? (toNum(r[outAmtCol]) ?? 0) > 0
        : false;
    const _sale =
      saleAmtCol && saleAmtCol in r
        ? (toNum(r[saleAmtCol]) ?? 0) > 0
        : false;
    parsed.push({ style, brand, season, _in, _out, _sale, raw: r });
  }
  const sumAmt = (g: R[], c: string | null) =>
    !c
      ? 0
      : g.reduce((s, x) => s + (toNum(x.raw[c]) ?? 0), 0);
  const uniq = (g: R[], pred: (x: R) => boolean) =>
    new Set(g.filter(pred).map((x) => x.style)).size;
  const byBrand = new Map<string, R[]>();
  for (const p of parsed) {
    const arr = byBrand.get(p.brand) ?? [];
    arr.push(p);
    byBrand.set(p.brand, arr);
  }
  const brandInQty: Record<string, number> = {};
  const brandOutQty: Record<string, number> = {};
  const brandSaleQty: Record<string, number> = {};
  const brandOrderQty: Record<string, number> = {};
  const brandOrderAmt: Record<string, number> = {};
  const brandInAmt: Record<string, number> = {};
  const brandOutAmt: Record<string, number> = {};
  const brandSaleAmt: Record<string, number> = {};
  for (const [b, g] of byBrand) {
    brandInQty[b] = uniq(g, (x) => x._in);
    brandOutQty[b] = uniq(g, (x) => x._out);
    brandSaleQty[b] = uniq(g, (x) => x._sale);
    brandOrderQty[b] = new Set(g.map((x) => x.style)).size;
    brandOrderAmt[b] = sumAmt(g, orderAmtCol);
    brandInAmt[b] = sumAmt(
      g.filter((x) => x._in),
      inAmtCol
    );
    brandOutAmt[b] = sumAmt(
      g.filter((x) => x._out),
      outAmtCol
    );
    brandSaleAmt[b] = sumAmt(g, saleAmtCol);
  }
  const fmtNum = (v: number) => (Number.isFinite(v) ? `${Math.round(v).toLocaleString("ko-KR")}` : "0");
  const fmtEok = (v: number) =>
    `${Math.round(v / 1e8).toLocaleString("ko-KR")} 억 원`;
  const rows: InoutRow[] = [];
  for (const [, buBrands] of BU_GROUPS) {
    for (const b of buBrands) {
      rows.push({
        브랜드: b,
        "발주 STY수": fmtNum(brandOrderQty[b] ?? 0),
        발주액: fmtEok(brandOrderAmt[b] ?? 0),
        "입고 STY수": fmtNum(brandInQty[b] ?? 0),
        입고액: fmtEok(brandInAmt[b] ?? 0),
        "출고 STY수": fmtNum(brandOutQty[b] ?? 0),
        출고액: fmtEok(brandOutAmt[b] ?? 0),
        "판매 STY수": fmtNum(brandSaleQty[b] ?? 0),
        판매액: fmtEok(brandSaleAmt[b] ?? 0),
      });
    }
  }
  const bsKey = (x: R) => `${x.brand}\u0000${x.season}`;
  const bsMap = new Map<string, R[]>();
  for (const p of parsed) {
    const k = bsKey(p);
    const arr = bsMap.get(k) ?? [];
    arr.push(p);
    bsMap.set(k, arr);
  }
  const brandSeasonRows: {
    브랜드: string;
    시즌: string;
    발주STY수: number;
    발주액: number;
    입고STY수: number;
    입고액: number;
    출고STY수: number;
    출고액: number;
    판매STY수: number;
    판매액: number;
  }[] = [];
  for (const [, grp] of bsMap) {
    if (!grp.length) continue;
    const b = grp[0].brand;
    const s = grp[0].season;
    const inGrp = grp.filter((x) => x._in);
    const outGrp = grp.filter((x) => x._out);
    const saleGrp = grp.filter((x) => x._sale);
    brandSeasonRows.push({
      브랜드: b,
      시즌: s,
      발주STY수: new Set(grp.map((x) => x.style)).size,
      발주액: sumAmt(grp, orderAmtCol),
      입고STY수: new Set(inGrp.map((x) => x.style)).size,
      입고액: sumAmt(inGrp, inAmtCol),
      출고STY수: new Set(outGrp.map((x) => x.style)).size,
      출고액: sumAmt(outGrp, outAmtCol),
      판매STY수: new Set(saleGrp.map((x) => x.style)).size,
      판매액: sumAmt(grp, saleAmtCol),
    });
  }
  return { rows, agg: { brandInQty, brandOutQty, brandSaleQty }, brandSeasonRows };
}

function eokLabel(x: number): string {
  if (!Number.isFinite(x)) return "0.00";
  return (x / 1e8).toLocaleString("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export type MonitorRow = {
  브랜드: string;
  물류입고스타일수: number;
  온라인등록스타일수: number;
  온라인등록율: number;
  _등록율: string;
  포토인계소요일수: string;
  포토소요일수: string;
  상품등록소요일수: string;
  평균전체등록소요일수: string;
  noReg: boolean;
};

export type DashboardPayload = {
  updatedAt: string;
  kpis: {
    입고억: string;
    입고STY: number;
    출고억: string;
    출고STY: number;
    판매억: string;
    판매STY: number;
  };
  monitor: MonitorRow[];
  inoutRows: InoutRow[];
  brandSeasonByBrand: Record<string, InoutRow[]>;
};

export function computeDashboard(
  sources: SourceBundle,
  filters: DashboardFilters
): DashboardPayload {
  const { selectedSeasons, selectedBrand } = filters;
  const seasons = SEASON_OPTIONS;
  const baseBytes = sources.inout;
  const dfStyleAll = buildStyleTableAll(sources);
  const { rows: inoutRows, agg: inoutAgg, brandSeasonRows } =
    buildInoutAggregates(baseBytes);

  let dfBase = loadBaseInout(baseBytes, "물류입고스타일수");
  if (selectedBrand) {
    const brandFilterCol = findCol(["브랜드(Now:단품)"], dfBase.columns);

    dfBase = {
      ...dfBase,
      records: dfBase.records.filter(
        (r) =>
          String(r["브랜드"] ?? r[brandFilterCol ?? ""] ?? "").trim() ===
          selectedBrand
      ),
    };
  let dfKpi = dfBase;
  const seasonCol = findCol(["시즌", "season"], dfBase.columns);
  if (
    selectedSeasons.length &&
    new Set(selectedSeasons).size !== new Set(seasons).size &&
    seasonCol &&
    dfBase.columns.includes(seasonCol)
  ) {
    dfKpi = {
      ...dfBase,
      records: dfBase.records.filter((r) =>
        seasonMatchesCell(r[seasonCol], selectedSeasons)
      ),
    };
  }
  const inAmtCol = findCol(["누적입고액", "입고액"], dfKpi.columns);
  const outAmtCol = findCol(["출고액"], dfKpi.columns);
  const saleAmtCol = findCol(
    ["누적 판매액[외형매출]", "누적판매액", "판매액"],
    dfKpi.columns
  );
  const firstInCol = findCol(["최초입고일", "입고일"], dfKpi.columns);
  const inQtyCol = findCol(["입고량"], dfKpi.columns);
  const styleCol = findCol(["스타일코드", "스타일"], dfKpi.columns);
  let totalInAmt = 0;
  let totalOutAmt = 0;
  let totalSaleAmt = 0;
  for (const r of dfKpi.records) {
    if (inAmtCol) totalInAmt += toNum(r[inAmtCol]) ?? 0;
    if (outAmtCol) totalOutAmt += toNum(r[outAmtCol]) ?? 0;
    if (saleAmtCol) totalSaleAmt += toNum(r[saleAmtCol]) ?? 0;
  }
  let totalInSty = 0;
  let totalOutSty = 0;
  let totalSaleSty = 0;
  if (dfKpi.records.length && styleCol && dfKpi.columns.includes(styleCol)) {
    const stylesIn = new Set<string>();
    const stylesOut = new Set<string>();
    const stylesSale = new Set<string>();
    for (const r of dfKpi.records) {
      const st = String(r[styleCol] ?? "").trim();
      if (!st) continue;
      let inDateOk = false;
      if (firstInCol && firstInCol in r) {
        inDateOk = parseCellDate(r[firstInCol]) !== null;
        const num = toNum(r[firstInCol]);
        if (num !== null && num >= 1 && num <= 60000) inDateOk = true;
      }
      const hasQty =
        inQtyCol && inQtyCol in r
          ? (toNum(r[inQtyCol]) ?? 0) > 0
          : false;
      const hasAmt =
        inAmtCol && inAmtCol in r
          ? (toNum(r[inAmtCol]) ?? 0) > 0
          : false;
      const _in = inDateOk || hasQty || hasAmt;
      const _out =
        outAmtCol && outAmtCol in r
          ? (toNum(r[outAmtCol]) ?? 0) > 0
          : false;
      const _sale =
        saleAmtCol && saleAmtCol in r
          ? (toNum(r[saleAmtCol]) ?? 0) > 0
          : false;
      if (_in) stylesIn.add(st);
      if (_out) stylesOut.add(st);
      if (_sale) stylesSale.add(st);
    }
    totalInSty = stylesIn.size;
    totalOutSty = stylesOut.size;
    totalSaleSty = stylesSale.size;
  } else if (selectedBrand) {
    totalInSty = inoutAgg.brandInQty[selectedBrand] ?? 0;
    totalOutSty = inoutAgg.brandOutQty[selectedBrand] ?? 0;
    totalSaleSty = inoutAgg.brandSaleQty[selectedBrand] ?? 0;
  } else {
    totalInSty = Object.values(inoutAgg.brandInQty).reduce((a, b) => a + b, 0);
    totalOutSty = Object.values(inoutAgg.brandOutQty).reduce((a, b) => a + b, 0);
    totalSaleSty = Object.values(inoutAgg.brandSaleQty).reduce((a, b) => a + b, 0);
  }

  let dfForTable = dfStyleAll;
  if (
    selectedSeasons.length &&
    new Set(selectedSeasons).size !== new Set(seasons).size
  ) {
    dfForTable = dfForTable.filter((r) =>
      seasonMatchesCell(r.시즌, selectedSeasons)
    );
  }
  const seen = new Set<string>();
  const dfIn = dfForTable.filter((r) => {
    if (r.입고여부 !== true) return false;
    const k = `${r.브랜드}\u0000${r.시즌}\u0000${r.스타일코드}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const allBrands = Array.from(
    new Set(dfStyleAll.map((r) => r.브랜드).filter(Boolean))
  ).sort();
  const inByBrand = new Map<string, Set<string>>();
  for (const r of dfIn) {
    const set = inByBrand.get(r.브랜드) ?? new Set();
    set.add(r.스타일코드);
    inByBrand.set(r.브랜드, set);
  }
  const seasonTuple =
    selectedSeasons.length &&
    new Set(selectedSeasons).size !== new Set(seasons).size
      ? selectedSeasons
      : null;
  const monitor: MonitorRow[] = allBrands.map((brand) => {
    const noReg = NO_REG_SHEET_BRANDS.has(brand);
    const 물류 = (inByBrand.get(brand)?.size ?? 0) || 0;
    const cnt = countRegisteredStylesFromRegisterSheet(
      sources,
      brand,
      selectedSeasons,
      seasons
    );
    const 온라인등록 = noReg ? -1 : cnt ?? 0;
    const rate =
      noReg || 물류 === 0 ? 0 : Math.round(((온라인등록 as number) / 물류) * 100) / 100;
    const _등록율 = noReg ? "-" : `${Math.round(rate * 100)}%`;
    return {
      브랜드: brand,
      물류입고스타일수: 물류,
      온라인등록스타일수: 온라인등록 as number,
      온라인등록율: rate,
      _등록율,
      포토인계소요일수: "-",
      포토소요일수: "-",
      상품등록소요일수: "-",
      평균전체등록소요일수: "-",
      noReg,
    };
  });
  for (const row of monitor) {
    if (row.noReg || !BRAND_TO_KEY[row.브랜드]) continue;
    const key = BRAND_TO_KEY[row.브랜드];
    const regBytes = sources.onlineByBrand[key];
    if (!regBytes) continue;
    const avg = loadBrandRegisterAvgDays(
      regBytes,
      baseBytes,
      seasonTuple,
      BRAND_KEY_TO_SHEET_NAME[key]
    );
    if (!avg) continue;
    const setIf = (k: keyof typeof avg, col: keyof MonitorRow) => {
      const v = avg[k];
      if (v !== null && v !== undefined) {
        (row as Record<string, unknown>)[col as string] = v.toFixed(1);
      }
    };
    setIf("평균전체등록소요일수", "평균전체등록소요일수");
    setIf("포토인계소요일수", "포토인계소요일수");
    setIf("포토소요일수", "포토소요일수");
    setIf("상품등록소요일수", "상품등록소요일수");
  }
  monitor.sort((a, b) => b.물류입고스타일수 - a.물류입고스타일수);

  const brandSeasonByBrand: Record<string, InoutRow[]> = {};
  for (const r of brandSeasonRows) {
    const fmt = (v: number, isAmt: boolean) =>
      isAmt
        ? `${Math.round(v / 1e8).toLocaleString("ko-KR")} 억 원`
        : `${Math.round(v).toLocaleString("ko-KR")}`;
    const row: InoutRow = {
      시즌: String(r.시즌).trim(),
      "발주 STY수": fmt(r.발주STY수, false),
      발주액: fmt(r.발주액, true),
      "입고 STY수": fmt(r.입고STY수, false),
      입고액: fmt(r.입고액, true),
      "출고 STY수": fmt(r.출고STY수, false),
      출고액: fmt(r.출고액, true),
      "판매 STY수": fmt(r.판매STY수, false),
      판매액: fmt(r.판매액, true),
    };
    const arr = brandSeasonByBrand[r.브랜드] ?? [];
    arr.push(row);
    brandSeasonByBrand[r.브랜드] = arr;
  }
  for (const k of Object.keys(brandSeasonByBrand)) {
    brandSeasonByBrand[k].sort((a, b) =>
      String(a.시즌).localeCompare(String(b.시즌), "ko")
    );
  }

  return {
    updatedAt: new Date().toISOString(),
    kpis: {
      입고억: eokLabel(totalInAmt),
      입고STY: totalInSty,
      출고억: eokLabel(totalOutAmt),
      출고STY: totalOutSty,
      판매억: eokLabel(totalSaleAmt),
      판매STY: totalSaleSty,
    },
    monitor,
    inoutRows,
    brandSeasonByBrand,
  };
}
