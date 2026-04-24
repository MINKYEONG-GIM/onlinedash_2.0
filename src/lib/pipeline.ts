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

type BaseTable = {
  columns: string[];
  records: Record<string, unknown>[];
};

type RegisterRow = {
  스타일코드: string;
  시즌: string;
  온라인상품등록여부: string;
  제외여부: string;
};

type RegisterContext = {
  headerNorm: string[];
  dataRows: unknown[][];
};

const RAW_BRAND_CODE_TO_NAME: Record<string, string> = {
  SP: "스파오",
  NB: "뉴발란스",
  NK: "뉴발란스키즈",
  WH: "후아유",
  HP: "슈펜",
  MI: "미쏘",
  RM: "로엠",
  CV: "클라비스",
  EB: "에블린",
};

const SALE_AMOUNT_HEADERS = [
  "누적 판매액[외형매출]",
  "누적판매액[외형매출]",
  "누적 판매액(외형매출)",
  "누적판매액(외형매출)",
  "누적판매액",
  "판매액",
] as const;

const baseTableCache = new WeakMap<unknown[][], BaseTable>();
const registerDfCache = new WeakMap<unknown[][], RegisterRow[]>();
const registerContextCache = new WeakMap<unknown[][], RegisterContext | null>();
const baseStyleFirstInCache = new WeakMap<unknown[][], Map<string, Date>>();

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

function findColNormalized(keys: string[], cols: string[]): string | null {
  for (const k of keys) {
    const nk = norm(k);
    for (const c of cols) {
      if (norm(c) === nk) return c;
    }
  }
  return findCol(keys, cols);
}

function findSaleAmountCol(
  cols: string[],
  records: Record<string, unknown>[]
): string | null {
  const candidates = cols.filter((col) => {
    const normalized = norm(col);
    return normalized.includes("판매액") && !normalized.includes("판매량");
  });

  if (!candidates.length) {
    return findColNormalized([...SALE_AMOUNT_HEADERS], cols);
  }

  let bestCol: string | null = null;
  let bestScore = -1;
  for (const col of candidates) {
    const normalized = norm(col);
    const bonus =
      normalized.includes("누적판매액") && normalized.includes("외형매출")
        ? 1e15
        : 0;
    const total = records.reduce((sum, record) => sum + (toNum(record[col]) ?? 0), 0);
    const score = bonus + total;
    if (score > bestScore) {
      bestScore = score;
      bestCol = col;
    }
  }

  return bestCol;
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

function loadBaseTable(rows: unknown[][]): BaseTable {
  const cached = baseTableCache.get(rows);
  if (cached) return cached;

  if (!rows.length) {
    const empty = { columns: [], records: [] };
    baseTableCache.set(rows, empty);
    return empty;
  }

  const kw = ["브랜드", "스타일", "최초입고일", "입고", "출고", "판매"];
  let bestRow: number | null = null;
  let bestScore = 0;
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const row = (rows[i] ?? []).map((c) => String(c ?? ""));
    const score = row.filter((cell) => kw.some((k) => cell.includes(k))).length;
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  const { columns, records } = aoaToObjects(
    rows,
    bestRow !== null && bestScore > 0 ? bestRow : 0
  );
  const styleCol = findCol(["스타일코드", "스타일"], columns);
  const rawBrandCol = findCol(["브랜드(Now:단품)", "브랜드"], columns);
  for (const record of records) {
    const stylePrefix = styleCol
      ? String(record[styleCol] ?? "").trim().toLowerCase().slice(0, 2)
      : "";
    const brandFromStyle = STYLE_PREFIX_TO_BRAND[stylePrefix];
    const rawBrand = rawBrandCol ? String(record[rawBrandCol] ?? "").trim().toUpperCase() : "";
    const brandFromRaw = RAW_BRAND_CODE_TO_NAME[rawBrand];
    if (brandFromStyle) {
      record["브랜드"] = brandFromStyle;
    } else if (brandFromRaw) {
      record["브랜드"] = brandFromRaw;
    } else if (rawBrandCol) {
      record["브랜드"] = record[rawBrandCol] ?? "";
    }
  }

  const result = { columns, records };
  baseTableCache.set(rows, result);
  return result;
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
  rows: unknown[][]
): { row: number; norm: string[] } | null {
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const row = (rows[i] ?? []).map((c) => norm(c));
    const hasStyle = row.some((v) => v.includes("스타일코드") || v.includes("스타일"));
    const hasReg = row.some((v) => v.includes("공홈등록일"));
    if (hasStyle && hasReg) return { row: i, norm: row };
  }
  return null;
}

function getRegisterContext(rows: unknown[][]): RegisterContext | null {
  const cached = registerContextCache.get(rows);
  if (cached !== undefined) return cached;

  const found = findRegisterHeader(rows);
  if (!found) {
    registerContextCache.set(rows, null);
    return null;
  }

  const context = {
    headerNorm: found.norm,
    dataRows: rows.slice(found.row + 1),
  };
  registerContextCache.set(rows, context);
  return context;
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

function loadBrandRegisterRows(rows: unknown[][]): RegisterRow[] {
  const cached = registerDfCache.get(rows);
  if (cached) return cached;

  const context = getRegisterContext(rows);
  if (!context) {
    registerDfCache.set(rows, []);
    return [];
  }

  const { headerNorm, dataRows } = context;
  const styleCol = colIdx(headerNorm, "스타일코드") ?? colIdx(headerNorm, "스타일");
  const regdateCol = colIdx(headerNorm, "공홈등록일");
  const seasonCol = colIdx(headerNorm, "시즌");
  const excludeCol = colIdx(headerNorm, "제외");
  if (styleCol === null || regdateCol === null) {
    registerDfCache.set(rows, []);
    return [];
  }

  const out: RegisterRow[] = [];
  for (const line of dataRows) {
    const style = String(line?.[styleCol] ?? "").trim();
    if (!style || style === "nan") continue;
    const reg = line?.[regdateCol];
    out.push({
      스타일코드: style,
      시즌:
        seasonCol !== null && seasonCol < (line?.length ?? 0)
          ? String(line?.[seasonCol] ?? "").trim()
          : "",
      온라인상품등록여부: regdateCellFilled(reg) ? "등록" : "미등록",
      제외여부:
        excludeCol !== null && excludeCol < (line?.length ?? 0)
          ? String(line?.[excludeCol] ?? "").trim()
          : "",
    });
  }

  registerDfCache.set(rows, out);
  return out;
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

function baseStyleToFirstInMap(rows: unknown[][]): Map<string, Date> {
  const cached = baseStyleFirstInCache.get(rows);
  if (cached) return cached;

  const table = loadBaseTable(rows);
  const styleCol = findCol(["스타일코드", "스타일"], table.columns);
  const firstCol = findCol(["최초입고일", "입고일"], table.columns);
  const map = new Map<string, Date>();
  if (!styleCol || !firstCol) {
    baseStyleFirstInCache.set(rows, map);
    return map;
  }

  for (const record of table.records) {
    const style = norm(record[styleCol]);
    if (!style) continue;
    const dt = parseCellDate(record[firstCol]);
    if (!dt) continue;
    const prev = map.get(style);
    if (!prev || dt < prev) map.set(style, dt);
  }

  baseStyleFirstInCache.set(rows, map);
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
  const regRows = sources.onlineByBrandRows[brandKey] ?? [];
  const dfReg = loadBrandRegisterRows(regRows);
  if (!dfReg.length) return 0;

  let filtered = dfReg.filter(
    (row) =>
      row.온라인상품등록여부 === "등록" &&
      (row.제외여부 ?? "").trim() === "포함"
  );
  if (
    selectedSeasons.length &&
    seasonOptions.length &&
    new Set(selectedSeasons).size !== new Set(seasonOptions).size
  ) {
    filtered = filtered.filter((row) =>
      seasonMatchesCell(row.시즌, selectedSeasons)
    );
  }
  return new Set(filtered.map((row) => norm(row.스타일코드))).size;
}

function parseDateSeriesVal(v: unknown): Date | null {
  if (v === 0 || v === "0") return null;
  return parseCellDate(v);
}

export function loadBrandRegisterAvgDays(
  regRows: unknown[][],
  baseDefaultRows: unknown[][],
  selectedSeasonsTuple: string[] | null
): Record<string, number | null> | null {
  if (!regRows.length) return null;
  const baseMap = baseStyleToFirstInMap(baseDefaultRows);
  if (!baseMap.size) return null;

  const context = getRegisterContext(regRows);
  if (!context) return null;

  const { headerNorm, dataRows } = context;
  const styleCol = colIdx(headerNorm, "스타일코드") ?? colIdx(headerNorm, "스타일");
  const regdateCol = colIdx(headerNorm, "공홈등록일");
  const seasonCol = colIdx(headerNorm, "시즌");
  const photoHandoverCol = colIdx(headerNorm, "포토인계일");
  const retouchDoneCol = colIdx(headerNorm, "리터칭완료일");
  if (styleCol === null || regdateCol === null) return null;

  let rows = dataRows;
  if (selectedSeasonsTuple?.length && seasonCol !== null) {
    const normSel = selectedSeasonsTuple.map((x) => normSeason(x)).filter(Boolean);
    if (normSel.length) {
      rows = rows.filter((line) => {
        const raw = String(line?.[seasonCol] ?? "").trim().toUpperCase();
        const ns = normSeason(line?.[seasonCol]);
        if (!normSel.includes(ns)) return false;
        return normSel.some((s) => new RegExp(`^G?${s}$`).test(raw));
      });
    }
  }
  if (!rows.length) return null;

  const totalDiffs: number[] = [];
  const photoHandoverDiffs: number[] = [];
  const photoDiffs: number[] = [];
  const registerDiffs: number[] = [];

  for (const line of rows) {
    const style = norm(line?.[styleCol]);
    const regDt = parseDateSeriesVal(line?.[regdateCol]);
    if (!style || !regDt) continue;

    const baseDt = baseMap.get(style);
    if (!baseDt) continue;

    const totalDiff = Math.floor(
      (regDt.getTime() - baseDt.getTime()) / 86400000
    );
    if (totalDiff >= 0) totalDiffs.push(totalDiff);

    const photoDt =
      photoHandoverCol !== null ? parseDateSeriesVal(line?.[photoHandoverCol]) : null;
    const retouchDt =
      retouchDoneCol !== null ? parseDateSeriesVal(line?.[retouchDoneCol]) : null;

    if (photoDt) {
      const d = Math.floor((photoDt.getTime() - baseDt.getTime()) / 86400000);
      photoHandoverDiffs.push(Math.max(0, d));
    }
    if (retouchDt && photoDt) {
      const d = Math.floor((retouchDt.getTime() - photoDt.getTime()) / 86400000);
      photoDiffs.push(Math.max(0, d));
    }
    if (retouchDt) {
      const d = Math.floor((regDt.getTime() - retouchDt.getTime()) / 86400000);
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

function pickSeason(seasons: unknown[], inFlags: boolean[]): string {
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
  const baseRows =
    sources.baseInoutRows.length > 0
      ? sources.baseInoutRows
      : sources.baseDefaultRows;
  const base = loadBaseTable(baseRows);
  if (!base.records.length) return [];

  const styleCol = findCol(["스타일코드", "스타일"], base.columns);
  const brandCol = findCol(["브랜드"], base.columns);
  const seasonCol = findCol(["시즌", "season"], base.columns);
  const firstInCol = findCol(["최초입고일", "입고일"], base.columns);
  const outAmtCol = findCol(["출고액"], base.columns);
  const inQtyCol = findCol(["입고량"], base.columns);
  const inAmtCol = findCol(["누적입고액", "입고액"], base.columns);
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

  for (const record of base.records) {
    const style = String(record[styleCol] ?? "").trim();
    if (!style) continue;

    const brand = String(record["브랜드"] ?? record[brandCol] ?? "").trim();
    const season = seasonCol ? record[seasonCol] : "";
    let inDateOk = false;
    if (firstInCol && firstInCol in record) {
      inDateOk = parseCellDate(record[firstInCol]) !== null;
      const num = toNum(record[firstInCol]);
      if (num !== null && num >= 1 && num <= 60000) inDateOk = true;
    }
    const hasQty =
      inQtyCol && inQtyCol in record ? (toNum(record[inQtyCol]) ?? 0) > 0 : false;
    const hasAmt =
      inAmtCol && inAmtCol in record ? (toNum(record[inAmtCol]) ?? 0) > 0 : false;
    const inFlag = inDateOk || hasQty || hasAmt;
    const outFlag =
      outAmtCol && outAmtCol in record ? (toNum(record[outAmtCol]) ?? 0) > 0 : false;

    const key = `${brand}\u0000${style}`;
    const group = groups.get(key) ?? {
      brand,
      style,
      seasons: [],
      inFlags: [],
      outFlags: [],
    };
    group.seasons.push(season);
    group.inFlags.push(inFlag);
    group.outFlags.push(outFlag);
    groups.set(key, group);
  }

  const rows = Array.from(groups.values()).map((group) => ({
    브랜드: group.brand,
    스타일코드: group.style,
    시즌: pickSeason(group.seasons, group.inFlags),
    입고여부: group.inFlags.some(Boolean),
    출고여부: group.outFlags.some(Boolean),
    온라인상품등록여부: "미등록",
  }));

  const byBrand = new Map<string, typeof rows>();
  for (const row of rows) {
    const arr = byBrand.get(row.브랜드) ?? [];
    arr.push(row);
    byBrand.set(row.브랜드, arr);
  }

  const out: typeof rows = [];
  for (const [brandName, brandRows] of byBrand) {
    const brandKey = BRAND_TO_KEY[brandName];
    if (brandKey) {
      const regRows = loadBrandRegisterRows(sources.onlineByBrandRows[brandKey] ?? []);
      if (regRows.length) {
        const regMap = new Map<string, string>();
        for (const row of regRows) {
          const key = norm(row.스타일코드);
          const isRegistered = row.온라인상품등록여부 === "등록";
          const prev = regMap.get(key) === "등록";
          regMap.set(key, prev || isRegistered ? "등록" : "미등록");
        }
        for (const row of brandRows) {
          out.push({
            ...row,
            온라인상품등록여부: regMap.get(norm(row.스타일코드)) ?? "미등록",
          });
        }
        continue;
      }
    }
    out.push(...brandRows);
  }

  return out;
}

export type InoutRow = Record<string, string>;

export function buildInoutAggregates(inoutRowsSource: unknown[][]): {
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
  const base = loadBaseTable(inoutRowsSource);
  if (!base.records.length) {
    return {
      rows: [],
      agg: { brandInQty: {}, brandOutQty: {}, brandSaleQty: {} },
      brandSeasonRows: [],
    };
  }

  const styleCol = findCol(["스타일코드", "스타일"], base.columns);
  const brandCol = findCol(["브랜드"], base.columns);
  if (!styleCol || !brandCol) {
    return {
      rows: [],
      agg: { brandInQty: {}, brandOutQty: {}, brandSaleQty: {} },
      brandSeasonRows: [],
    };
  }

  const orderQtyCol = findCol(["발주 STY", "발주수", "발주량"], base.columns);
  const orderAmtCol = findCol(["발주액"], base.columns);
  const inAmtCol = findCol(["누적입고액", "입고액"], base.columns);
  const outAmtCol = findCol(["출고액"], base.columns);
  const saleAmtCol = findSaleAmountCol(base.columns, base.records);
  const firstInCol = findCol(["최초입고일", "입고일"], base.columns);
  const inQtyCol = findCol(["입고량"], base.columns);
  const seasonCol = findCol(["시즌", "season"], base.columns);

  type ParsedRow = {
    style: string;
    brand: string;
    season: string;
    inFlag: boolean;
    outFlag: boolean;
    saleFlag: boolean;
    raw: Record<string, unknown>;
  };

  const parsed: ParsedRow[] = [];
  for (const record of base.records) {
    const style = String(record[styleCol] ?? "").trim();
    if (!style) continue;
    const brand = String(record["브랜드"] ?? record[brandCol] ?? "").trim();
    const season = seasonCol ? String(record[seasonCol] ?? "").trim() : "";

    let inDateOk = false;
    if (firstInCol && firstInCol in record) {
      inDateOk = parseCellDate(record[firstInCol]) !== null;
      const num = toNum(record[firstInCol]);
      if (num !== null && num >= 1 && num <= 60000) inDateOk = true;
    }
    const hasQty =
      inQtyCol && inQtyCol in record ? (toNum(record[inQtyCol]) ?? 0) > 0 : false;
    const hasAmt =
      inAmtCol && inAmtCol in record ? (toNum(record[inAmtCol]) ?? 0) > 0 : false;
    const inFlag = inDateOk || hasQty || hasAmt;
    const outFlag =
      outAmtCol && outAmtCol in record ? (toNum(record[outAmtCol]) ?? 0) > 0 : false;
    const saleFlag =
      saleAmtCol && saleAmtCol in record ? (toNum(record[saleAmtCol]) ?? 0) > 0 : false;

    parsed.push({ style, brand, season, inFlag, outFlag, saleFlag, raw: record });
  }

  const sumAmt = (rows: ParsedRow[], col: string | null) =>
    !col ? 0 : rows.reduce((sum, row) => sum + (toNum(row.raw[col]) ?? 0), 0);
  const uniq = (rows: ParsedRow[], pred: (row: ParsedRow) => boolean) =>
    new Set(rows.filter(pred).map((row) => row.style)).size;

  const byBrand = new Map<string, ParsedRow[]>();
  for (const row of parsed) {
    const arr = byBrand.get(row.brand) ?? [];
    arr.push(row);
    byBrand.set(row.brand, arr);
  }

  const brandInQty: Record<string, number> = {};
  const brandOutQty: Record<string, number> = {};
  const brandSaleQty: Record<string, number> = {};
  const brandOrderQty: Record<string, number> = {};
  const brandOrderAmt: Record<string, number> = {};
  const brandInAmt: Record<string, number> = {};
  const brandOutAmt: Record<string, number> = {};
  const brandSaleAmt: Record<string, number> = {};

  for (const [brand, rows] of byBrand) {
    brandInQty[brand] = uniq(rows, (row) => row.inFlag);
    brandOutQty[brand] = uniq(rows, (row) => row.outFlag);
    brandSaleQty[brand] = uniq(rows, (row) => row.saleFlag);
    brandOrderQty[brand] = new Set(rows.map((row) => row.style)).size;
    brandOrderAmt[brand] = sumAmt(rows, orderAmtCol);
    brandInAmt[brand] = sumAmt(
      rows.filter((row) => row.inFlag),
      inAmtCol
    );
    brandOutAmt[brand] = sumAmt(
      rows.filter((row) => row.outFlag),
      outAmtCol
    );
    brandSaleAmt[brand] = sumAmt(rows, saleAmtCol);
  }

  const fmtNum = (v: number) =>
    Number.isFinite(v) ? `${Math.round(v).toLocaleString("ko-KR")}` : "0";
  const fmtEok = (v: number) =>
    `${Math.round(v / 1e8).toLocaleString("ko-KR")} 억 원`;

  const rows: InoutRow[] = [];
  for (const [, brands] of BU_GROUPS) {
    for (const brand of brands) {
      rows.push({
        브랜드: brand,
        "발주 STY수": fmtNum(brandOrderQty[brand] ?? 0),
        발주액: fmtEok(brandOrderAmt[brand] ?? 0),
        "입고 STY수": fmtNum(brandInQty[brand] ?? 0),
        입고액: fmtEok(brandInAmt[brand] ?? 0),
        "출고 STY수": fmtNum(brandOutQty[brand] ?? 0),
        출고액: fmtEok(brandOutAmt[brand] ?? 0),
        "판매 STY수": fmtNum(brandSaleQty[brand] ?? 0),
        판매액: fmtEok(brandSaleAmt[brand] ?? 0),
      });
    }
  }

  const byBrandSeason = new Map<string, ParsedRow[]>();
  for (const row of parsed) {
    const key = `${row.brand}\u0000${row.season}`;
    const arr = byBrandSeason.get(key) ?? [];
    arr.push(row);
    byBrandSeason.set(key, arr);
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

  for (const [, rowsForSeason] of byBrandSeason) {
    if (!rowsForSeason.length) continue;
    const brand = rowsForSeason[0].brand;
    const season = rowsForSeason[0].season;
    const inRows = rowsForSeason.filter((row) => row.inFlag);
    const outRows = rowsForSeason.filter((row) => row.outFlag);
    const saleRows = rowsForSeason.filter((row) => row.saleFlag);

    brandSeasonRows.push({
      브랜드: brand,
      시즌: season,
      발주STY수: new Set(rowsForSeason.map((row) => row.style)).size,
      발주액: sumAmt(rowsForSeason, orderAmtCol),
      입고STY수: new Set(inRows.map((row) => row.style)).size,
      입고액: sumAmt(inRows, inAmtCol),
      출고STY수: new Set(outRows.map((row) => row.style)).size,
      출고액: sumAmt(outRows, outAmtCol),
      판매STY수: new Set(saleRows.map((row) => row.style)).size,
      판매액: sumAmt(rowsForSeason, saleAmtCol),
    });
  }

  return {
    rows,
    agg: { brandInQty, brandOutQty, brandSaleQty },
    brandSeasonRows,
  };
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

  const dfStyleAll = buildStyleTableAll(sources);
  const inoutRowsSource =
    sources.baseInoutRows.length > 0 ? sources.baseInoutRows : sources.baseDefaultRows;
  const {
    rows: inoutRows,
    agg: inoutAgg,
    brandSeasonRows,
  } = buildInoutAggregates(inoutRowsSource);

  let saleBase = loadBaseTable(inoutRowsSource);
  if (selectedBrand) {
    saleBase = {
      ...saleBase,
      records: saleBase.records.filter(
        (record) => String(record["브랜드"] ?? "").trim() === selectedBrand
      ),
    };
  }
  const saleSeasonCol = findCol(["시즌", "season"], saleBase.columns);
  if (
    selectedSeasons.length &&
    new Set(selectedSeasons).size !== new Set(seasons).size &&
    saleSeasonCol &&
    saleBase.columns.includes(saleSeasonCol)
  ) {
    saleBase = {
      ...saleBase,
      records: saleBase.records.filter((record) =>
        seasonMatchesCell(record[saleSeasonCol], selectedSeasons)
      ),
    };
  }

  let base = loadBaseTable(sources.baseDefaultRows);
  if (selectedBrand) {
    base = {
      ...base,
      records: base.records.filter(
        (record) => String(record["브랜드"] ?? "").trim() === selectedBrand
      ),
    };
  }

  let kpiBase = base;
  const seasonCol = findCol(["시즌", "season"], base.columns);
  if (
    selectedSeasons.length &&
    new Set(selectedSeasons).size !== new Set(seasons).size &&
    seasonCol &&
    base.columns.includes(seasonCol)
  ) {
    kpiBase = {
      ...base,
      records: base.records.filter((record) =>
        seasonMatchesCell(record[seasonCol], selectedSeasons)
      ),
    };
  }

  const inAmtCol = findCol(["누적입고액", "입고액"], kpiBase.columns);
  const outAmtCol = findCol(["출고액"], kpiBase.columns);
  const saleAmtCol = findSaleAmountCol(saleBase.columns, saleBase.records);
  const firstInCol = findCol(["최초입고일", "입고일"], kpiBase.columns);
  const inQtyCol = findCol(["입고량"], kpiBase.columns);
  const styleCol = findCol(["스타일코드", "스타일"], saleBase.columns);
  const kpiStyleCol = findCol(["스타일코드", "스타일"], kpiBase.columns);

  let totalInAmt = 0;
  let totalOutAmt = 0;
  let totalSaleAmt = 0;
  for (const record of kpiBase.records) {
    if (inAmtCol) totalInAmt += toNum(record[inAmtCol]) ?? 0;
    if (outAmtCol) totalOutAmt += toNum(record[outAmtCol]) ?? 0;
  }
  for (const record of saleBase.records) {
    if (saleAmtCol) totalSaleAmt += toNum(record[saleAmtCol]) ?? 0;
  }

  let totalInSty = 0;
  let totalOutSty = 0;
  let totalSaleSty = 0;
  if (saleBase.records.length && styleCol && saleBase.columns.includes(styleCol)) {
    const stylesSale = new Set<string>();
    for (const record of saleBase.records) {
      const style = String(record[styleCol] ?? "").trim();
      if (!style) continue;
      const saleFlag =
        saleAmtCol && saleAmtCol in record ? (toNum(record[saleAmtCol]) ?? 0) > 0 : false;
      if (saleFlag) stylesSale.add(style);
    }
    totalSaleSty = stylesSale.size;
  }
  if (kpiBase.records.length && kpiStyleCol && kpiBase.columns.includes(kpiStyleCol)) {
    const stylesIn = new Set<string>();
    const stylesOut = new Set<string>();
    for (const record of kpiBase.records) {
      const style = String(record[kpiStyleCol] ?? "").trim();
      if (!style) continue;
      let inDateOk = false;
      if (firstInCol && firstInCol in record) {
        inDateOk = parseCellDate(record[firstInCol]) !== null;
        const num = toNum(record[firstInCol]);
        if (num !== null && num >= 1 && num <= 60000) inDateOk = true;
      }
      const hasQty =
        inQtyCol && inQtyCol in record ? (toNum(record[inQtyCol]) ?? 0) > 0 : false;
      const hasAmt =
        inAmtCol && inAmtCol in record ? (toNum(record[inAmtCol]) ?? 0) > 0 : false;
      const inFlag = inDateOk || hasQty || hasAmt;
      const outFlag =
        outAmtCol && outAmtCol in record ? (toNum(record[outAmtCol]) ?? 0) > 0 : false;
      if (inFlag) stylesIn.add(style);
      if (outFlag) stylesOut.add(style);
    }
    totalInSty = stylesIn.size;
    totalOutSty = stylesOut.size;
  } else if (selectedBrand) {
    totalInSty = inoutAgg.brandInQty[selectedBrand] ?? 0;
    totalOutSty = inoutAgg.brandOutQty[selectedBrand] ?? 0;
    totalSaleSty = inoutAgg.brandSaleQty[selectedBrand] ?? 0;
  } else {
    totalInSty = Object.values(inoutAgg.brandInQty).reduce((a, b) => a + b, 0);
    totalOutSty = Object.values(inoutAgg.brandOutQty).reduce((a, b) => a + b, 0);
    totalSaleSty = Object.values(inoutAgg.brandSaleQty).reduce((a, b) => a + b, 0);
  }

  let tableRows = dfStyleAll;
  if (
    selectedSeasons.length &&
    new Set(selectedSeasons).size !== new Set(seasons).size
  ) {
    tableRows = tableRows.filter((row) =>
      seasonMatchesCell(row.시즌, selectedSeasons)
    );
  }

  const seen = new Set<string>();
  const inRows = tableRows.filter((row) => {
    if (!row.입고여부) return false;
    const key = `${row.브랜드}\u0000${row.시즌}\u0000${row.스타일코드}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const allBrands = Array.from(
    new Set(dfStyleAll.map((row) => row.브랜드).filter(Boolean))
  ).sort();

  const inByBrand = new Map<string, Set<string>>();
  for (const row of inRows) {
    const set = inByBrand.get(row.브랜드) ?? new Set<string>();
    set.add(row.스타일코드);
    inByBrand.set(row.브랜드, set);
  }

  const seasonTuple =
    selectedSeasons.length &&
    new Set(selectedSeasons).size !== new Set(seasons).size
      ? selectedSeasons
      : null;

  const monitor: MonitorRow[] = allBrands.map((brand) => {
    const noReg = NO_REG_SHEET_BRANDS.has(brand);
    const inCount = inByBrand.get(brand)?.size ?? 0;
    const registeredCount = countRegisteredStylesFromRegisterSheet(
      sources,
      brand,
      selectedSeasons,
      seasons
    );
    const onlineCount = noReg ? -1 : registeredCount ?? 0;
    const rate =
      noReg || inCount === 0
        ? 0
        : Math.round((onlineCount / inCount) * 100) / 100;
    const rateText = noReg ? "-" : `${Math.round(rate * 100)}%`;

    const row: MonitorRow = {
      브랜드: brand,
      물류입고스타일수: inCount,
      온라인등록스타일수: onlineCount,
      온라인등록율: rate,
      _등록율: rateText,
      포토인계소요일수: "-",
      포토소요일수: "-",
      상품등록소요일수: "-",
      평균전체등록소요일수: "-",
      noReg,
    };

    if (!noReg && BRAND_TO_KEY[brand]) {
      const brandKey = BRAND_TO_KEY[brand];
      const avg = loadBrandRegisterAvgDays(
        sources.onlineByBrandRows[brandKey] ?? [],
        sources.baseDefaultRows,
        seasonTuple
      );
      if (avg) {
        const setIf = (key: keyof typeof avg, col: keyof MonitorRow) => {
          const value = avg[key];
          if (value !== null && value !== undefined) {
            (row as Record<string, unknown>)[col] = value.toFixed(1);
          }
        };
        setIf("평균전체등록소요일수", "평균전체등록소요일수");
        setIf("포토인계소요일수", "포토인계소요일수");
        setIf("포토소요일수", "포토소요일수");
        setIf("상품등록소요일수", "상품등록소요일수");
      }
    }

    return row;
  });

  monitor.sort((a, b) => b.물류입고스타일수 - a.물류입고스타일수);

  const brandSeasonByBrand: Record<string, InoutRow[]> = {};
  for (const row of brandSeasonRows) {
    const fmt = (value: number, isAmt: boolean) =>
      isAmt
        ? `${Math.round(value / 1e8).toLocaleString("ko-KR")} 억 원`
        : `${Math.round(value).toLocaleString("ko-KR")}`;

    const formatted: InoutRow = {
      시즌: String(row.시즌).trim(),
      "발주 STY수": fmt(row.발주STY수, false),
      발주액: fmt(row.발주액, true),
      "입고 STY수": fmt(row.입고STY수, false),
      입고액: fmt(row.입고액, true),
      "출고 STY수": fmt(row.출고STY수, false),
      출고액: fmt(row.출고액, true),
      "판매 STY수": fmt(row.판매STY수, false),
      판매액: fmt(row.판매액, true),
    };

    const arr = brandSeasonByBrand[row.브랜드] ?? [];
    arr.push(formatted);
    brandSeasonByBrand[row.브랜드] = arr;
  }

  for (const brand of Object.keys(brandSeasonByBrand)) {
    brandSeasonByBrand[brand].sort((a, b) =>
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
