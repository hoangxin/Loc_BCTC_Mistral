import type { BusinessType } from './business-type';
import {
  normalizeLabelText,
  valueColumnIndexes,
  findMaSoColumnIndex,
  findRowByCode,
  type FinancialStatements,
  type StatementTable,
} from './export/statement-shared';

export interface AnalysisRow {
  label: string;
  percentChange: number | null;
  tier: 'level1' | 'level2' | null;
}

interface Thresholds {
  level1: number;
  level2: number;
}

interface MetricDef {
  label: string;
  statement: 'balanceSheet' | 'incomeStatement';
  codes: number[];
  thresholds: Thresholds | null;
}

const BCDKT_THRESHOLDS: Thresholds = { level1: 20, level2: 40 };

// 21 chi tieu tang truong nguoi dung yeu cau (2026-07-08) - ma so theo Thong
// tu 200/2014/TT-BTC (Mau B01-DN/B01a-DN), DA VERIFY khop 100% voi du lieu
// OCR that (bao cao SJ1 trong data/latest-fetch.json luc thiet ke tinh nang
// nay). Cac cot BCDKT gop ca ma so ngan+dai han khi nguoi dung yeu cau gop
// (vd "Trả trước người bán" = 132 NH + 212 DH).
const METRICS: MetricDef[] = [
  { label: 'Tiền + ĐTTC Ngắn hạn', statement: 'balanceSheet', codes: [110, 120], thresholds: BCDKT_THRESHOLDS },
  { label: 'Phải thu ngắn hạn khách hàng', statement: 'balanceSheet', codes: [131], thresholds: BCDKT_THRESHOLDS },
  { label: 'Trả trước người bán', statement: 'balanceSheet', codes: [132, 212], thresholds: BCDKT_THRESHOLDS },
  { label: 'Phải thu khác', statement: 'balanceSheet', codes: [136, 216], thresholds: BCDKT_THRESHOLDS },
  { label: 'Tồn kho', statement: 'balanceSheet', codes: [140], thresholds: BCDKT_THRESHOLDS },
  { label: 'Nguyên giá tscđ hữu hình', statement: 'balanceSheet', codes: [222], thresholds: BCDKT_THRESHOLDS },
  { label: 'BĐS Đầu tư', statement: 'balanceSheet', codes: [230], thresholds: BCDKT_THRESHOLDS },
  { label: 'TS Dở dang', statement: 'balanceSheet', codes: [240], thresholds: BCDKT_THRESHOLDS },
  { label: 'TS Thuế TN Hoãn lại', statement: 'balanceSheet', codes: [262], thresholds: BCDKT_THRESHOLDS },
  { label: 'Phải trả người bán', statement: 'balanceSheet', codes: [311, 331], thresholds: BCDKT_THRESHOLDS },
  { label: 'Người mua trả trước', statement: 'balanceSheet', codes: [312, 332], thresholds: BCDKT_THRESHOLDS },
  { label: 'Chi phí phải trả', statement: 'balanceSheet', codes: [315, 333], thresholds: BCDKT_THRESHOLDS },
  { label: 'Phải trả khác', statement: 'balanceSheet', codes: [319, 337], thresholds: BCDKT_THRESHOLDS },
  { label: 'Dự phòng phải trả', statement: 'balanceSheet', codes: [321, 342], thresholds: BCDKT_THRESHOLDS },
  { label: 'Vay', statement: 'balanceSheet', codes: [320, 338], thresholds: BCDKT_THRESHOLDS },
  { label: 'Vốn CSH', statement: 'balanceSheet', codes: [400], thresholds: BCDKT_THRESHOLDS },
  { label: 'DT thuần', statement: 'incomeStatement', codes: [10], thresholds: { level1: 20, level2: 30 } },
  { label: 'Lãi gộp', statement: 'incomeStatement', codes: [20], thresholds: { level1: 30, level2: 40 } },
  { label: 'CPBH', statement: 'incomeStatement', codes: [25], thresholds: null },
  { label: 'CPQLDN', statement: 'incomeStatement', codes: [26], thresholds: null },
  { label: 'LNST', statement: 'incomeStatement', codes: [60], thresholds: { level1: 40, level2: 50 } },
];

// "-" la quy uoc BCTC VN cho "khong co/bang 0" (khac voi gia tri khong doc
// duoc/OCR loi) - CHI "-" moi duoc coi la 0, moi gia tri khac khong phai so
// deu la "khong tinh duoc" (null), theo dung nguyen tac cua
// lib/export/validate-statements.ts (khong doan bua khi thieu du lieu).
function numericValue(cell: string | number | null | undefined): number | null {
  if (typeof cell === 'number') return cell;
  if (cell === '-') return 0;
  return null;
}

// Cong gia tri cac ma so cua 1 chi tieu tai 1 cot gia tri cu the - null neu
// BAT KY ma so nao trong danh sach khong tim thay dong hoac gia tri khong doc
// duoc (an toan hon la cong nhung gi tim duoc - tranh % tinh tu 1 phan du
// lieu ma trong nhu day du).
function sumCodesAtColumn(table: StatementTable, maSoIndex: number, codes: number[], columnIndex: number): number | null {
  let sum = 0;
  for (const code of codes) {
    const row = findRowByCode(table, maSoIndex, code);
    if (!row) return null; // chi tieu khong ton tai trong bang nay (vd khac bieu mau) - khong tinh duoc
    const value = numericValue(row[columnIndex]);
    if (value === null) return null;
    sum += value;
  }
  return sum;
}

// BCDKT: cot gia tri dau tien LUON la ky nay (cuoi ky), cot thu hai LUON la
// dau ky/dau nam - da verify qua du lieu OCR that (SJ1: cot ["CHỈ TIÊU","Mã
// số","Thuyết minh","31/03/2026","01/10/2025"]), khong can do text.
function balanceSheetPeriodColumns(table: StatementTable): { currentIndex: number; priorIndex: number } | null {
  const [currentIndex, priorIndex] = valueColumnIndexes(table);
  if (currentIndex === undefined || priorIndex === undefined) return null;
  return { currentIndex, priorIndex };
}

// KQKD: KHONG the dung vi tri co dinh - bao cao Quy co toi 4 cot gia tri
// (Quy nay nam nay/nam truoc + Luy ke nam nay/nam truoc, da verify qua du
// lieu OCR that SJ1). Nhan dien qua TEXT tieu de cot: "ky nay" = chua "NAM
// NAY" va KHONG chua "LUY KE" (loai 2 cot luy ke); "cung ky" tuong tu voi
// "NAM TRUOC". Fallback ve vi tri (giong BCDKT) neu khong khop pattern nao ca
// (vd bao cao dung tu ngu khac thuong).
function incomeStatementPeriodColumns(table: StatementTable): { currentIndex: number; priorIndex: number } | null {
  const valueIndexes = valueColumnIndexes(table);
  const currentIndex = valueIndexes.find((i) => {
    const normalized = normalizeLabelText(table.columns[i] ?? '');
    return normalized.includes('NAM NAY') && !normalized.includes('LUY KE');
  });
  const priorIndex = valueIndexes.find((i) => {
    const normalized = normalizeLabelText(table.columns[i] ?? '');
    return normalized.includes('NAM TRUOC') && !normalized.includes('LUY KE');
  });
  if (currentIndex !== undefined && priorIndex !== undefined) return { currentIndex, priorIndex };

  const [fallbackCurrent, fallbackPrior] = valueIndexes;
  if (fallbackCurrent === undefined || fallbackPrior === undefined) return null;
  return { currentIndex: fallbackCurrent, priorIndex: fallbackPrior };
}

function computePercentChange(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null) return null;
  if (prior === 0) return null; // khong tinh % tang truong tu goc 0 (vo cuc/khong xac dinh)
  return ((current - prior) / Math.abs(prior)) * 100;
}

function tierFor(percentChange: number | null, thresholds: Thresholds | null): 'level1' | 'level2' | null {
  if (percentChange === null || thresholds === null) return null;
  if (percentChange >= thresholds.level2) return 'level2';
  if (percentChange >= thresholds.level1) return 'level1';
  return null;
}

// Ap 21 chi tieu tang truong (yeu cau user 2026-07-08) len 1 bao cao da OCR
// xong 3 bang. GATE BAT BUOC theo businessType === 'other': da verify qua du
// lieu OCR that (bao cao MBS - chung khoan) mot so ma so TRUNG SO nhung KHAC
// NGHIA hoan toan voi doanh nghiep thuong (vd ma 110 o CTCK la "Tài sản tài
// chính", khong phai "Tiền") - tra ma so vo dieu kien se ra SO SAI NHUNG
// TRONG HOP LE, rat nguy hiem cho 1 cong cu tai chinh. Ngan hang/Chung
// khoan/Bao hiem van tra du 21 nhan (percentChange/tier deu null) de cot
// hien dong nhat o moi tab loai hinh DN (chi hien "—"), theo dung lua chon
// nguoi dung da chot.
export function computeAnalysisRows(statements: FinancialStatements, businessType: BusinessType): AnalysisRow[] {
  if (businessType !== 'other') {
    return METRICS.map((metric) => ({ label: metric.label, percentChange: null, tier: null }));
  }

  const balanceSheetMaSoIndex = findMaSoColumnIndex(statements.balanceSheet);
  const balanceSheetPeriods = balanceSheetPeriodColumns(statements.balanceSheet);
  const incomeStatementMaSoIndex = findMaSoColumnIndex(statements.incomeStatement);
  const incomeStatementPeriods = incomeStatementPeriodColumns(statements.incomeStatement);

  return METRICS.map((metric) => {
    const table = metric.statement === 'balanceSheet' ? statements.balanceSheet : statements.incomeStatement;
    const maSoIndex = metric.statement === 'balanceSheet' ? balanceSheetMaSoIndex : incomeStatementMaSoIndex;
    const periods = metric.statement === 'balanceSheet' ? balanceSheetPeriods : incomeStatementPeriods;

    if (maSoIndex === null || periods === null) {
      return { label: metric.label, percentChange: null, tier: null };
    }

    const current = sumCodesAtColumn(table, maSoIndex, metric.codes, periods.currentIndex);
    const prior = sumCodesAtColumn(table, maSoIndex, metric.codes, periods.priorIndex);
    const percentChange = computePercentChange(current, prior);
    return { label: metric.label, percentChange, tier: tierFor(percentChange, metric.thresholds) };
  });
}
