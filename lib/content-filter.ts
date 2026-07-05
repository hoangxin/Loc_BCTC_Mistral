import type { FinancialStatements } from './export/financial-statements';

export interface ContentFilterCandidate {
  filePath: string;
  statements: FinancialStatements;
}

// TODO: thay bang tieu chi loc noi dung that cua user (vd tang truong doanh
// thu/loi nhuan so voi ky truoc, hoac cac dau hieu khac dang luu y tren BCTC)
// - hien pass-through (giu tat ca) vi tieu chi cu the chua duoc chot, dung y
// dinh nhu lib/filter.ts (loc metadata). KHONG tu doan tieu chi - hoi user
// truoc khi vien logic that vao day.
//
// Dau vao la statements DA CO SAN (lay tu vision model o Buoc 2 cua pipeline,
// xem lib/export/index.ts extractStatementsForFiles) - vi bang B01/B02-DN cua
// VAS luon co ca cot ky nay va ky truoc, phan lon tieu chi tang truong co the
// tinh truc tiep tu 1 bao cao, khong can doi chieu chua ky truoc rieng.
export function filterByFinancialContent<T extends ContentFilterCandidate>(candidates: T[]): T[] {
  return candidates;
}
