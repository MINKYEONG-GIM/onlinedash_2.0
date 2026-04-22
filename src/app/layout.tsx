import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "온라인 리드타임 대시보드",
  description: "브랜드별 입출고·온라인 상품등록 모니터링",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
