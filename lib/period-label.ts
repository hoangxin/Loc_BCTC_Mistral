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
