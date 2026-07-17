import type { ReportTerm } from './vietstock-reports';

// Vietstock co 7 loai ky bao cao/nam (da xac nhan qua goi API that
// /data/getrptterm, xem lib/vietstock-reports.ts): "Quý 1".."Quý 4", "6T" (6
// thang dau nam - bao cao soat xet ban nien, HO SO RIENG voi Quy 2 du cung
// han cuoi ky 30/6), "9T" (9 thang dau nam, cung han cuoi ky 30/9 nhu Quy 3),
// "Nam" (bao cao kiem toan ca nam, cung han cuoi ky 31/12 nhu Quy 4). Module
// nay chi lo suy ra nhan hien thi/ten thu muc tu ReportTerm.description -
// KHONG tu sinh danh sach ky (viec do lay truc tiep tu Vietstock qua
// fetchReportTerms, luon dung theo thoi gian hien tai - xem README).

const QUARTER_PATTERN = /^Quý\s*(\d)$/i;

export function isRegularQuarterTerm(term: ReportTerm): { quarter: number; year: number } | null {
  const match = term.description.trim().match(QUARTER_PATTERN);
  if (!match) return null;
  return { quarter: Number(match[1]), year: term.yearPeriod };
}

export function periodFolderSlug(term: ReportTerm): string {
  const quarter = isRegularQuarterTerm(term);
  if (quarter) return `Q${quarter.quarter}`;
  const desc = term.description.trim();
  if (desc === '6T') return '6T';
  if (desc === '9T') return '9T';
  if (desc === 'Năm') return 'Nam';
  return desc.replace(/\s+/g, '') || 'Ky';
}

export function periodDisplayLabel(term: ReportTerm): string {
  const quarter = isRegularQuarterTerm(term);
  if (quarter) return `Quý ${quarter.quarter}/${term.yearPeriod}`;
  const desc = term.description.trim();
  if (desc === '6T') return `6 tháng đầu năm ${term.yearPeriod}`;
  if (desc === '9T') return `9 tháng đầu năm ${term.yearPeriod}`;
  if (desc === 'Năm') return `Cả năm ${term.yearPeriod}`;
  return `${desc}/${term.yearPeriod}`;
}

// Chieu NGUOC lai periodDisplayLabel - suy nhan hien thi TU periodYear/periodSlug
// da luu san tren TUNG report (lib/status.ts DownloadedReport, xem
// periodFolderSlug o tren de biet cach 2 truong nay duoc sinh ra) thay vi tu 1
// ReportTerm day du (khong co san khi doc lai status.reports, vd app/PeriodResultsPanel.tsx
// gom nhom ket qua theo ky de hien tab "Ket qua {ky}" - yeu cau nguoi dung 2026-07-17).
export function periodSlugDisplayLabel(periodYear: number, periodSlug: string): string {
  const quarterMatch = periodSlug.match(/^Q([1-4])$/);
  if (quarterMatch) return `Quý ${quarterMatch[1]}/${periodYear}`;
  if (periodSlug === '6T') return `6 tháng đầu năm ${periodYear}`;
  if (periodSlug === '9T') return `9 tháng đầu năm ${periodYear}`;
  if (periodSlug === 'Nam') return `Cả năm ${periodYear}`;
  return `${periodSlug}/${periodYear}`;
}

// Thu tu sap xep tab ky (moi nhat truoc) - Q4 > Q3 > Q2 > Q1, "Nam"/"9T"/"6T"
// xep sau cung trong nam (thuong cong bo muon hon cac quy) vi khong co "thu
// tu quy" ro rang de so sanh truc tiep voi Q1-4.
const PERIOD_SLUG_SORT_WEIGHT: Record<string, number> = { Q1: 1, Q2: 2, Q3: 3, Q4: 4, '6T': 5, '9T': 6, Nam: 7 };

export function comparePeriodDesc(a: { periodYear: number; periodSlug: string }, b: { periodYear: number; periodSlug: string }): number {
  if (a.periodYear !== b.periodYear) return b.periodYear - a.periodYear;
  const weightA = PERIOD_SLUG_SORT_WEIGHT[a.periodSlug] ?? 0;
  const weightB = PERIOD_SLUG_SORT_WEIGHT[b.periodSlug] ?? 0;
  return weightB - weightA;
}
