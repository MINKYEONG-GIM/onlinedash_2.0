export const BRAND_KEY_TO_SHEET_NAME: Record<string, string> = {
  spao: "스파오",
  whoau: "후아유",
  clavis: "클라비스",
  mixxo: "미쏘",
  roem: "로엠",
  shoopen: "슈펜",
  eblin: "에블린",
  newbalance: "뉴발란스",
  nbkids: "뉴발란스키즈",
};

export const BRANDS_LIST_UI = [
  "스파오",
  "미쏘",
  "후아유",
  "로엠",
  "뉴발란스",
  "뉴발란스키즈",
  "슈펜",
  "에블린",
  "클라비스",
];

export const BRAND_TO_KEY: Record<string, string> = {
  스파오: "spao",
  후아유: "whoau",
  클라비스: "clavis",
  미쏘: "mixxo",
  로엠: "roem",
  슈펜: "shoopen",
  에블린: "eblin",
  뉴발란스: "newbalance",
  뉴발란스키즈: "nbkids",
};

export const BU_GROUPS: [string, string[]][] = [
  ["캐쥬얼BU", ["스파오"]],
  ["스포츠BU", ["뉴발란스", "뉴발란스키즈", "후아유", "슈펜"]],
  ["여성BU", ["미쏘", "로엠", "클라비스", "에블린"]],
];

export const NO_REG_SHEET_BRANDS = new Set<string>();

export const SEASON_OPTIONS = ["1", "2", "A", "B", "C", "S", "F"];

export const STYLE_PREFIX_TO_BRAND: Record<string, string> = {
  sp: "스파오",
  rm: "로엠",
  mi: "미쏘",
  wh: "후아유",
  hp: "슈펜",
  cv: "클라비스",
  eb: "에블린",
  nb: "뉴발란스",
  nk: "뉴발란스키즈",
};
