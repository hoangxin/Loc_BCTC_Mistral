import type { AnalysisRow } from './analysis';
import type { BusinessType } from './business-type';
import type { StatementScope } from './statement-scope';

export interface SummaryRow {
  stt: number;
  stockCode: string;
  companyName: string;
  // "San giao dich" va "Ten tai lieu" giong giao dien Vietstock, xem
  // lib/status.ts DownloadedReport - PHAI co o day thi file xuat (summary-
  // excel.ts/summary-pdf.ts) moi co du cot giong bang tren UI (da gap thieu
  // that qua feedback user 2026-07-06: xuat Excel bi thieu het cot nay vi
  // SummaryRow chua bao gio duoc cap nhat theo).
  exchange: string;
  title: string;
  statementScope: StatementScope;
  // Dung de chia file Excel tong hop thanh 4 sheet giong 4 tab loai hinh DN
  // tren UI (yeu cau user 2026-07-08 - xem lib/export/summary-excel.ts).
  businessType: BusinessType;
  analysis: AnalysisRow[];
}

// Cot % dong theo UNION cac nhan xuat hien (theo thu tu gap dau tien) - de khi
// lib/analysis.ts them/bot tieu chi, so cot tu dong theo, khong can sua
// UI/export (xem app/ReportsSummaryTable.tsx, lib/export/summary-excel.ts,
// lib/export/summary-pdf.ts).
export function collectAnalysisLabels(rows: SummaryRow[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const item of row.analysis) {
      if (!seen.has(item.label)) {
        seen.add(item.label);
        labels.push(item.label);
      }
    }
  }
  return labels;
}
