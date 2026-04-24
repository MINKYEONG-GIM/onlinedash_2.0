import { google } from "googleapis";
import { JWT } from "google-auth-library";
import * as XLSX from "xlsx";
import { BRAND_KEY_TO_SHEET_NAME } from "./constants";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

const SOURCE_CACHE_TTL_MS = 5 * 60 * 1000;
const spreadsheetBytesCache = new Map<
  string,
  { expiresAt: number; value: Promise<Buffer | null> }
>();

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

/** Drive export → xlsx bytes; 실패 시 Sheets API로 워크북 생성 후 xlsx 버퍼 반환 */
export async function fetchSpreadsheetXlsxBytes(sheetId: string): Promise<Buffer | null> {
  if (!sheetId) return null;
  const auth = getJwt();
  const drive = google.drive({ version: "v3", auth });
  try {
    const res = await drive.files.export(
      {
        fileId: sheetId,
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      { responseType: "arraybuffer" }
    );
    return Buffer.from(res.data as ArrayBuffer);
  } catch {
    return fetchSpreadsheetViaSheetsApi(sheetId, auth);
  }
}

function getCachedSpreadsheetXlsxBytes(sheetId: string): Promise<Buffer | null> {
  if (!sheetId) return Promise.resolve(null);

  const now = Date.now();
  const cached = spreadsheetBytesCache.get(sheetId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = fetchSpreadsheetXlsxBytes(sheetId).catch((error) => {
    spreadsheetBytesCache.delete(sheetId);
    throw error;
  });
  spreadsheetBytesCache.set(sheetId, {
    expiresAt: now + SOURCE_CACHE_TTL_MS,
    value,
  });
  return value;
}

async function fetchSpreadsheetViaSheetsApi(
  sheetId: string,
  auth: JWT
): Promise<Buffer | null> {
  try {
    const sheets = google.sheets({ version: "v4", auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetTabs = meta.data.sheets ?? [];
    const wb = XLSX.utils.book_new();
    for (let idx = 0; idx < sheetTabs.length; idx++) {
      const title = sheetTabs[idx]?.properties?.title ?? `Sheet${idx + 1}`;
      const safeTitle = title.replace(/'/g, "''");
      const range = `'${safeTitle}'`;
      let rows: unknown[][] = [];
      try {
        const got = await sheets.spreadsheets.values.get({
          spreadsheetId: sheetId,
          range,
        });
        rows = (got.data.values ?? []) as unknown[][];
      } catch {
        rows = [];
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const sheetName = title.slice(0, 31) || `Sheet${idx + 1}`;
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
    const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return out;
  } catch {
    return null;
  }
}

export type SourceBundle = {
  inout: Buffer | null;
  onlineByBrand: Record<string, Buffer | null>;
};

export async function getAllSources(
  baseSpreadsheetId: string,
  onlineSpreadsheetId: string
): Promise<SourceBundle> {
  const [inout, onlineBytes] = await Promise.all([
    getCachedSpreadsheetXlsxBytes(baseSpreadsheetId),
    onlineSpreadsheetId
      ? getCachedSpreadsheetXlsxBytes(onlineSpreadsheetId)
      : Promise.resolve(null),
  ]);
  const onlineByBrand: Record<string, Buffer | null> = {};
  for (const key of Object.keys(BRAND_KEY_TO_SHEET_NAME)) {
    onlineByBrand[key] = onlineBytes;
  }
  return { inout, onlineByBrand };
}
