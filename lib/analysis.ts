import type { BusinessType } from './business-type';
import { findRevenueRow } from './export/validate-statements';
import {
  normalizeLabelText,
  valueColumnIndexes,
  findLabelColumnIndex,
  findRowByLabel,
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

type Row = (string | number | null)[];
type RowFinder = (table: StatementTable) => Row | null;

interface MetricDef {
  label: string;
  statement: 'balanceSheet' | 'incomeStatement';
  // 1 finder (chi tieu don), hoac 2 (gop ngan+dai han) - null neu BAT KY
  // finder nao khong tim thay dong => ca chi tieu tra ve null (khong doan
  // bua tu 1 phan du lieu).
  finders: RowFinder[];
  thresholds: Thresholds | null;
}

const BCDKT_THRESHOLDS: Thresholds = { level1: 20, level2: 40 };

// Tim theo TEN CHI TIEU (khong phai ma so) - xem comment chi tiet o
// findRowByLabel (lib/export/statement-shared.ts) ve ly do KHONG con dung ma
// so lam khoa chinh: da xac nhan (2026-07-08, doi chieu that SJ1/Thong tu 200
// vs IDV/Thong tu 99) ma so BI DICH CHUYEN hang loat giua 2 thong tu (vd ma
// 230 tu "Bat dong san dau tu" (TT200) doi thanh "Tai san sinh hoc dai han"
// (TT99, chen nhom moi) - tra ma so vo dieu kien se ra SO SAI NHUNG TRONG HOP
// LE. Ten chi tieu (theo VAS) KHONG doi giua 2 thong tu, chi co SO THU TU la
// doi - dung lam khoa on dinh hon nhieu.
function byLabel(include: string[], exclude: string[] = [], preferSubtotal = false): RowFinder {
  return (table) =>
    findRowByLabel(
      table,
      (label) => include.every((m) => label.includes(m)) && !exclude.some((m) => label.includes(m)),
      { preferSubtotal }
    );
}

// "- Nguyen gia" la dong CON, nhan lap lai GIONG HET nhau duoi MOI nhom TSCD
// (huu hinh/vo hinh/thue tai chinh) va BDS dau tu - khong the tim rieng bang
// ten (nhan qua chung chung). Tim dong cha "Tai san co dinh huu hinh" (nhan
// duy nhat, khong lap) truoc, roi lay DUNG dong ngay sau no (thu tu "Nguyen
// gia" luon nam sat duoi dong cha trong ca 2 thong tu - da verify SJ1 va IDV).
function findNguyenGiaTscdHuuHinh(table: StatementTable): Row | null {
  const labelIndex = findLabelColumnIndex(table.columns);
  const parentIndex = table.rows.findIndex((row) => {
    const label = row[labelIndex];
    return typeof label === 'string' && normalizeLabelText(label).includes('TAI SAN CO DINH HUU HINH');
  });
  if (parentIndex === -1) return null;
  const childRow = table.rows[parentIndex + 1];
  if (!childRow) return null;
  const childLabel = childRow[labelIndex];
  if (typeof childLabel !== 'string' || !normalizeLabelText(childLabel).includes('NGUYEN GIA')) return null;
  return childRow;
}

// DT thuan hay bi viet tat "DT thuan", VA can fallback ma so 10 (vi tri KHONG
// doi giua TT200/TT99, da verify) cho truong hop OCR chep khac thuong - dung
// lai chinh xac logic da kiem chung cua validate-statements.ts, khong viet
// lai lan 2 (xem findRevenueRow o do).
const findDoanhThuThuan: RowFinder = (table) => findRevenueRow(table);

// 21 chi tieu tang truong nguoi dung yeu cau (2026-07-08). Cac cot BCDKT gop
// ca ngan+dai han khi nguoi dung yeu cau gop (vd "Trả trước người bán" = NH +
// DH) - CA 2 finder phai tim thay thi moi cong, thieu 1 ben la tra null (xem
// sumFindersAtColumn duoi).
const METRICS: MetricDef[] = [
  {
    label: 'Tiền',
    statement: 'balanceSheet',
    finders: [byLabel(['TIEN VA CAC KHOAN TUONG DUONG TIEN']), byLabel(['DAU TU TAI CHINH NGAN HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Phải thu ngắn hạn khách hàng',
    statement: 'balanceSheet',
    finders: [byLabel(['PHAI THU NGAN HAN CUA KHACH HANG'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Trả trước người bán',
    statement: 'balanceSheet',
    finders: [byLabel(['TRA TRUOC CHO NGUOI BAN NGAN HAN']), byLabel(['TRA TRUOC CHO NGUOI BAN DAI HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Phải thu khác',
    statement: 'balanceSheet',
    finders: [byLabel(['PHAI THU NGAN HAN KHAC']), byLabel(['PHAI THU DAI HAN KHAC'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Tồn kho',
    statement: 'balanceSheet',
    finders: [byLabel(['HANG TON KHO'], [], true)],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Nguyên giá tscđ hữu hình',
    statement: 'balanceSheet',
    finders: [findNguyenGiaTscdHuuHinh],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'BĐS Đầu tư',
    statement: 'balanceSheet',
    finders: [byLabel(['BAT DONG SAN DAU TU'], [], true)],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'TS Dở dang',
    statement: 'balanceSheet',
    finders: [byLabel(['TAI SAN DO DANG DAI HAN'], [], true)],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'TS Thuế TN Hoãn lại',
    statement: 'balanceSheet',
    finders: [byLabel(['TAI SAN THUE THU NHAP HOAN LAI'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Phải trả người bán',
    statement: 'balanceSheet',
    finders: [byLabel(['PHAI TRA NGUOI BAN NGAN HAN']), byLabel(['PHAI TRA NGUOI BAN DAI HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Người mua trả trước',
    statement: 'balanceSheet',
    finders: [byLabel(['NGUOI MUA TRA TIEN TRUOC NGAN HAN']), byLabel(['NGUOI MUA TRA TIEN TRUOC DAI HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Chi phí phải trả',
    statement: 'balanceSheet',
    finders: [byLabel(['CHI PHI PHAI TRA NGAN HAN']), byLabel(['CHI PHI PHAI TRA DAI HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Phải trả khác',
    statement: 'balanceSheet',
    finders: [byLabel(['PHAI TRA NGAN HAN KHAC']), byLabel(['PHAI TRA DAI HAN KHAC'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Dự phòng phải trả',
    statement: 'balanceSheet',
    finders: [byLabel(['DU PHONG PHAI TRA NGAN HAN']), byLabel(['DU PHONG PHAI TRA DAI HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Vay',
    statement: 'balanceSheet',
    finders: [byLabel(['VAY VA NO THUE TAI CHINH NGAN HAN']), byLabel(['VAY VA NO THUE TAI CHINH DAI HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Vốn CSH',
    statement: 'balanceSheet',
    finders: [byLabel(['VON CHU SO HUU'], [], true)],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'DT thuần',
    statement: 'incomeStatement',
    finders: [findDoanhThuThuan],
    thresholds: { level1: 20, level2: 30 },
  },
  {
    label: 'Lãi gộp',
    statement: 'incomeStatement',
    finders: [byLabel(['LOI NHUAN GOP'])],
    thresholds: { level1: 30, level2: 40 },
  },
  {
    label: 'CPBH',
    statement: 'incomeStatement',
    finders: [byLabel(['CHI PHI BAN HANG'])],
    thresholds: null,
  },
  {
    label: 'CPQLDN',
    statement: 'incomeStatement',
    finders: [byLabel(['CHI PHI QUAN LY DOANH NGHIEP'])],
    thresholds: null,
  },
  {
    label: 'LNST',
    statement: 'incomeStatement',
    // Loai 2 dong con "...cua co dong khong kiem soat"/"...cua co dong cua
    // cong ty me" (bao cao Hop nhat) - ca 2 deu chua "LOI NHUAN SAU THUE" nhu
    // dong tong that su, phai loai rieng bang tu khoa "CO DONG".
    finders: [byLabel(['LOI NHUAN SAU THUE'], ['CO DONG'])],
    thresholds: { level1: 40, level2: 50 },
  },
];

// "-" VA o trong (null) deu duoc coi la 0 (quy uoc BCTC VN: khong phat sinh)
// (doi huong 2026-07-08 - truoc do chi "-" moi la 0, o trong bi coi la
// "khong doc duoc"; nhung doi chieu markdown-tables.ts thi o trong markdown
// LUON thanh null ngay tu buoc parse, con OCR "doc sai/nham" thi hau nhu
// khong xay ra voi Mistral - nen null thuc te gan nhu luon la o trong that,
// khong phai loi doc). Cell KHONG phai so va KHONG phai "-" (vd chu rac that
// su hiem gap) van tra ve "khong tinh duoc" - chi undefined (hang bi lech
// cot cau truc) moi giu nguyen an toan tuyet doi.
function numericValue(cell: string | number | null | undefined): number | null {
  if (typeof cell === 'number') return cell;
  if (cell === '-' || cell === null) return 0;
  return null;
}

// Cong gia tri cac finder cua 1 chi tieu tai 1 cot gia tri cu the - null neu
// BAT KY finder nao khong tim thay dong hoac gia tri khong doc duoc (an toan
// hon la cong nhung gi tim duoc - tranh % tinh tu 1 phan du lieu ma trong nhu
// day du).
function sumFindersAtColumn(table: StatementTable, finders: RowFinder[], columnIndex: number): number | null {
  let sum = 0;
  for (const find of finders) {
    const row = find(table);
    if (!row) return null; // chi tieu khong ton tai trong bang nay (vd khac bieu mau) - khong tinh duoc
    const value = numericValue(row[columnIndex]);
    if (value === null) return null;
    sum += value;
  }
  return sum;
}

// BCDKT: cot gia tri dau tien LUON la ky nay (cuoi ky), cot thu hai LUON la
// dau ky/dau nam - da verify qua du lieu OCR that (SJ1 va IDV), khong can do
// text.
function balanceSheetPeriodColumns(table: StatementTable): { currentIndex: number; priorIndex: number } | null {
  const [currentIndex, priorIndex] = valueColumnIndexes(table);
  if (currentIndex === undefined || priorIndex === undefined) return null;
  return { currentIndex, priorIndex };
}

// KQKD: KHONG the dung vi tri co dinh - bao cao Quy co toi 4 cot gia tri
// (Quy nay nam nay/nam truoc + Luy ke nam nay/nam truoc, da verify qua du
// lieu OCR that SJ1 va IDV). Nhan dien qua TEXT tieu de cot: "ky nay" = chua
// "NAM NAY" va KHONG chua "LUY KE" (loai 2 cot luy ke); "cung ky" tuong tu voi
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
// lieu OCR that (bao cao MBS - chung khoan) mot so ten chi tieu TRUNG hoac
// gan giong nhau nhung KHAC NGHIA hoan toan voi doanh nghiep thuong (bieu mau
// CTCK/Ngan hang/Bao hiem theo thong tu rieng, khong phai VAS thuong) - tra
// cuu vo dieu kien co the ra SO SAI NHUNG TRONG HOP LE, rat nguy hiem cho 1
// cong cu tai chinh. Ngan hang/Chung khoan/Bao hiem van tra du 21 nhan
// (percentChange/tier deu null) de cot hien dong nhat o moi tab loai hinh DN
// (chi hien "—"), theo dung lua chon nguoi dung da chot.
export function computeAnalysisRows(statements: FinancialStatements, businessType: BusinessType): AnalysisRow[] {
  if (businessType !== 'other') {
    return METRICS.map((metric) => ({ label: metric.label, percentChange: null, tier: null }));
  }

  const balanceSheetPeriods = balanceSheetPeriodColumns(statements.balanceSheet);
  const incomeStatementPeriods = incomeStatementPeriodColumns(statements.incomeStatement);

  return METRICS.map((metric) => {
    const table = metric.statement === 'balanceSheet' ? statements.balanceSheet : statements.incomeStatement;
    const periods = metric.statement === 'balanceSheet' ? balanceSheetPeriods : incomeStatementPeriods;

    if (periods === null) {
      return { label: metric.label, percentChange: null, tier: null };
    }

    const current = sumFindersAtColumn(table, metric.finders, periods.currentIndex);
    const prior = sumFindersAtColumn(table, metric.finders, periods.priorIndex);
    const percentChange = computePercentChange(current, prior);
    return { label: metric.label, percentChange, tier: tierFor(percentChange, metric.thresholds) };
  });
}
