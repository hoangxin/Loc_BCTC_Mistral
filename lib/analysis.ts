import type { FinancialStatements } from './export/financial-statements';

export interface AnalysisRow {
  label: string;
  percentChange: number | null;
}

// TODO: thay bang tieu chi doc BCTC that cua user (se duoc bo sung sau) -
// dung y dinh nhu lib/filter.ts (loc metadata) - hien pass-through (tra rong)
// de UI hien "(chua co tieu chi)" thay vi bang trong. KHONG tu doan tieu chi.
//
// Dau vao la statements DA CO SAN (tu Buoc 2 cua pipeline) - vi bang can doi
// ke toan luon co cot "so cuoi ky"/"so dau nam" VA bang ket qua kinh doanh
// thuong co ca cot ky nay/cung ky nam truoc trong CHINH 1 bao cao, phan lon
// tieu chi tang truong nguoi dung mo ta (CDKT so voi dau ky, KQKD so voi cung
// ky) co the tinh truc tiep tu day, khong can doi chieu bao cao ky truoc rieng.
export function computeAnalysisRows(statements: FinancialStatements): AnalysisRow[] {
  return [];
}
