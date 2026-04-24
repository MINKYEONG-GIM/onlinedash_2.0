import { unstable_cache } from "next/cache";
import { getAllSources } from "./google";
import { computeDashboard } from "./pipeline";

const DASHBOARD_REVALIDATE_SECONDS = 300;

const getDashboardDataCached = unstable_cache(
  async (
    baseSpreadsheetId: string,
    onlineSpreadsheetId: string,
    selectedSeasons: string[],
    selectedBrand: string | null
  ) => {
    const sources = await getAllSources(baseSpreadsheetId, onlineSpreadsheetId);
    return computeDashboard(sources, {
      selectedSeasons,
      selectedBrand,
    });
  },
  ["dashboard-data"],
  { revalidate: DASHBOARD_REVALIDATE_SECONDS }
);

export async function getDashboardData(
  baseSpreadsheetId: string,
  onlineSpreadsheetId: string,
  selectedSeasons: string[],
  selectedBrand: string | null
) {
  return getDashboardDataCached(
    baseSpreadsheetId,
    onlineSpreadsheetId,
    [...selectedSeasons].sort(),
    selectedBrand
  );
}
