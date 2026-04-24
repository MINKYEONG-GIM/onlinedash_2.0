import { google } from "googleapis";
import { JWT } from "google-auth-library";
import { BRAND_KEY_TO_SHEET_NAME } from "./constants";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];
const SOURCE_CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry<T> = {
  expiresAt: number;
  value: Promise<T>;
};

const titleCache = new Map<string, CacheEntry<string[]>>();
const sheetRowsCache = new Map<string, CacheEntry<unknown[][]>>();

function getJwt(): JWT {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw?.trim()) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not set");
  }
  const creds = JSON.parse(raw) as {
    client_email: string;
    private_key: string;
  };
  return new JWT({
    email: creds.client_email,
    key: creds.private_key.replace(/\\n/g, "\n"),
    scopes: SCOPES,
  });
}

function escapeSheetName(sheetName: string) {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

async function fetchSpreadsheetTitles(spreadsheetId: string): Promise<string[]> {
  const sheets = google.sheets({ version: "v4", auth: getJwt() });
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  return (meta.data.sheets ?? [])
    .map((sheet) => sheet.properties?.title ?? "")
    .filter(Boolean);
}

async function fetchSheetRows(
  spreadsheetId: string,
  sheetName: string
): Promise<unknown[][]> {
  const sheets = google.sheets({ version: "v4", auth: getJwt() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: escapeSheetName(sheetName),
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  return (res.data.values ?? []) as unknown[][];
}

function getCached<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = loader().catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, {
    expiresAt: now + SOURCE_CACHE_TTL_MS,
    value,
  });
  return value;
}

function pickDefaultBaseSheetName(sheetNames: string[]): string | null {
  if (!sheetNames.length) return null;
  const visible = sheetNames.filter((name) => !String(name).startsWith("_"));
  return visible[0] ?? sheetNames[sheetNames.length - 1] ?? null;
}

async function getSpreadsheetTitlesCached(spreadsheetId: string) {
  return getCached(titleCache, spreadsheetId, () =>
    fetchSpreadsheetTitles(spreadsheetId)
  );
}

async function getSheetRowsCached(spreadsheetId: string, sheetName: string) {
  return getCached(sheetRowsCache, `${spreadsheetId}::${sheetName}`, () =>
    fetchSheetRows(spreadsheetId, sheetName)
  );
}

export type SourceBundle = {
  baseDefaultRows: unknown[][];
  baseInoutRows: unknown[][];
  onlineByBrandRows: Record<string, unknown[][]>;
};

export async function getAllSources(
  baseSpreadsheetId: string,
  onlineSpreadsheetId: string
): Promise<SourceBundle> {
  const baseSheetNames = baseSpreadsheetId
    ? await getSpreadsheetTitlesCached(baseSpreadsheetId)
    : [];
  const baseDefaultSheetName = pickDefaultBaseSheetName(baseSheetNames);

  const [baseDefaultRows, baseInoutRows, onlineEntries] = await Promise.all([
    baseSpreadsheetId && baseDefaultSheetName
      ? getSheetRowsCached(baseSpreadsheetId, baseDefaultSheetName)
      : Promise.resolve([]),
    baseSpreadsheetId
      ? getSheetRowsCached(baseSpreadsheetId, "물류입고스타일수")
      : Promise.resolve([]),
    onlineSpreadsheetId
      ? Promise.all(
          Object.entries(BRAND_KEY_TO_SHEET_NAME).map(
            async ([key, sheetName]): Promise<[string, unknown[][]]> => [
              key,
              await getSheetRowsCached(onlineSpreadsheetId, sheetName),
            ]
          )
        )
      : Promise.resolve([] as [string, unknown[][]][]),
  ]);

  const onlineByBrandRows: Record<string, unknown[][]> = {};
  for (const [key, rows] of onlineEntries) {
    onlineByBrandRows[key] = rows;
  }

  return {
    baseDefaultRows,
    baseInoutRows,
    onlineByBrandRows,
  };
}
