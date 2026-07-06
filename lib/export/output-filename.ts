import type { StatementScope } from '../statement-scope';

export interface OutputFilenameInput {
  stockCode: string;
  periodYear: number;
  periodSlug: string; // "Q1".."Q4" | "6T" | "9T" | "Nam" - xem lib/period-label.ts periodFolderSlug
  statementScope: StatementScope;
}

function statementScopeSuffix(scope: StatementScope): string {
  if (scope === 'Hợp nhất') return '_HN';
  if (scope === 'Riêng lẻ') return '_M';
  return '';
}

// Ten file xuat (khong dinh dang) theo dung yeu cau user 2026-07-06:
// {Ma CK}_{2 so cuoi nam}{hau to ky}_BCTC{hau to loai} - vd "HSG_26Q2_BCTC_HN",
// "HSG_26Q2_BCTC_M" (Cong ty me), "HSG_26Q2_BCTC" (khong phan biet - "Chung").
// Dung cho ca ten file luu cuc bo (data/exports/) lan Content-Disposition tra
// ve trinh duyet (app/api/report-file).
export function buildOutputFilename(input: OutputFilenameInput): string {
  const yy = String(((input.periodYear % 100) + 100) % 100).padStart(2, '0');
  const stockCode = input.stockCode || 'BCTC';
  return `${stockCode}_${yy}${input.periodSlug}_BCTC${statementScopeSuffix(input.statementScope)}`;
}
