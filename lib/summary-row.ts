import type { AnalysisRow } from './analysis';
import type { StatementScope } from './statement-scope';

export interface SummaryRow {
  stt: number;
  stockCode: string;
  companyName: string;
  statementScope: StatementScope;
  analysis: AnalysisRow[];
}

// Cot % dong theo UNION cac nhan xuat hien (theo thu tu gap dau tien) - vi
// lib/analysis.ts hien la TODO (tra rong), khi co tieu chi that thi so cot se
// tu dong theo, khong can sua UI/export (xem app/ReportsSummaryTable.tsx,
// lib/export/summary-excel.ts, lib/export/summary-pdf.ts).
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
