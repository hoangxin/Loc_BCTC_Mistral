// Khoa nhan dien "cung 1 bao cao" - tach rieng file NAY (khong co import
// Node-only nao ca) de dung duoc CA server (lib/pipeline.ts) LAN client
// ('use client', app/FetchControls.tsx) - lib/pipeline.ts co import fs/path
// nen KHONG the import thang tu do vao 1 component client.
export interface ReportIdentity {
  stockCode: string;
  periodYear: number;
  periodSlug: string;
  title: string;
}

export function reportIdentityKey(report: ReportIdentity): string {
  return `${report.stockCode}::${report.periodYear}-${report.periodSlug}::${report.title}`;
}
