import ExcelJS from 'exceljs';
import type { FinancialStatements, StatementTable } from './financial-statements';
import { findLabelColumnIndex, isMetadataColumnName } from './statement-shared';
import { classifyRowTier } from './row-style';
import type { BusinessType } from '../business-type';

// Ten sheet Excel gioi han 31 ky tu va khong duoc chua [ ] : * ? / \ - cac ten
// duoi day deu an toan.
const DEFAULT_SHEETS: { key: keyof FinancialStatements; name: string }[] = [
  { key: 'balanceSheet', name: 'Cân đối kế toán' },
  { key: 'incomeStatement', name: 'KQ kinh doanh' },
  { key: 'cashFlow', name: 'Lưu chuyển tiền tệ' },
];

// CTCK (Mau B01-CTCK): thay "Luu chuyen tien te" bang "Cac chi tieu ngoai
// BCTC" (tai san/tien CTCK quan ly ho nha dau tu, KHONG thuoc BCDKT chinh -
// xem statement-shared.ts) - yeu cau user 2026-07-11.
const SECURITIES_SHEETS: { key: keyof FinancialStatements; name: string }[] = [
  { key: 'balanceSheet', name: 'Cân đối kế toán' },
  { key: 'offBalanceSheet', name: 'Chỉ tiêu ngoài BCTC' },
  { key: 'incomeStatement', name: 'KQ kinh doanh' },
];

// Ngan hang (Mau B02a/TCTD-HN, Thong tu 49/2014/TT-NHNN): cung bo "Luu chuyen
// tien te" (yeu cau user 2026-07-12 - NH khong dung bang nay de phan tich) va
// them "Cac chi tieu ngoai BCTC" - o day la bang "CAC CHI TIEU NGOAI BAO CAO
// TINH HINH TAI CHINH" that su cua NH (muc "Nghia vu no tiem an": Bao lanh vay
// von, Cam ket giao dich hoi doai, Cam ket cho vay khong huy ngang, Cam ket
// trong nghiep vu L/C, Bao lanh khac, Cam ket khac... - da xac nhan qua 3 bao
// cao that HDB/VCB/MBB Q1/2026 + mau EIB nguoi dung cung cap, KHAC ban chat
// voi bang cung ten cua CTCK).
const BANK_SHEETS: { key: keyof FinancialStatements; name: string }[] = [
  { key: 'balanceSheet', name: 'Cân đối kế toán' },
  { key: 'offBalanceSheet', name: 'Chỉ tiêu ngoài BCTC' },
  { key: 'incomeStatement', name: 'KQ kinh doanh' },
];

function sheetsForBusinessType(businessType: BusinessType): { key: keyof FinancialStatements; name: string }[] {
  if (businessType === 'securities') return SECURITIES_SHEETS;
  if (businessType === 'bank') return BANK_SHEETS;
  return DEFAULT_SHEETS;
}

// Do rong cot tu chinh theo do dai noi dung THAT (thay vi 1 do rong co dinh
// 32 cho MOI cot nhu truoc) - fix yeu cau user 2026-07-10: cot Ma so/Thuyet
// minh (chi vai ky tu, vd "411a") bi thua rong trong khi cot Chi tieu (van
// ban dai nhat bang) lai chat.
const MIN_COLUMN_WIDTH = 8;
const MAX_COLUMN_WIDTH = 60;
// Cot ten chi tieu can rong toi thieu du cho van ban dai (vd "Chi phi quan ly
// doanh nghiep") du dong dang xet co gia tri ngan.
const LABEL_COLUMN_MIN_WIDTH = 38;
const COLUMN_WIDTH_PADDING = 2;

function displayLength(value: string | number | null): number {
  if (value == null) return 0;
  // Uoc luong do dai SAU khi ap dau phay ngan cach hang nghin (numFmt
  // '#,##0' duoi day) de do rong khop voi thu se hien tren Excel, khong phai
  // chuoi so tho.
  if (typeof value === 'number') return value.toLocaleString('en-US').length;
  return String(value).length;
}

// In dam cac dong "tong nhom" (sub-heading) va dam+HOA cac dong "tong lon"
// (heading) giong van ban goc (yeu cau user 2026-07-08) - xem
// lib/export/row-style.ts de biet quy tac phan loai tung bang.
function writeTable(sheet: ExcelJS.Worksheet, statementKey: keyof FinancialStatements, table: StatementTable): void {
  if (table.columns.length > 0) {
    const headerRow = sheet.addRow(table.columns);
    headerRow.font = { bold: true };
  }

  const labelIndex = findLabelColumnIndex(table.columns, table.rows);
  for (const row of table.rows) {
    const tier = classifyRowTier(statementKey, table, row, labelIndex);
    const values =
      tier === 'heading'
        ? row.map((cell, i) => (i === labelIndex && typeof cell === 'string' ? cell.toLocaleUpperCase('vi-VN') : cell))
        : row;
    const excelRow = sheet.addRow(values);
    if (tier !== 'plain') excelRow.font = { bold: true };
  }

  // sheet.columns chi khac null neu duoc gan truoc do bang mot mang dinh
  // nghia cot (voi header/key) - vi minh ghi row bang mang gia tri tho qua
  // addRow() nen phai chinh do rong/can le tung cot qua getColumn(index) SAU
  // khi da ghi het row. ExcelJS (Column._applyStyle) tu dong ap NGUOC LAI cho
  // ca cac o da ton tai lan luot cac o sinh sau nay, nen goi sau addRow van
  // ra dung ket qua cho MOI o trong cot (da xac nhan doc source exceljs).
  const columnCount = Math.max(table.columns.length, ...table.rows.map((row) => row.length), 1);
  for (let i = 1; i <= columnCount; i++) {
    const colIndex = i - 1;
    const isLabelColumn = colIndex === labelIndex;
    const maxContentLength = table.rows.reduce(
      (max, row) => Math.max(max, displayLength(row[colIndex] ?? null)),
      displayLength(table.columns[colIndex] ?? null)
    );

    const column = sheet.getColumn(i);
    column.width = Math.min(
      Math.max(maxContentLength + COLUMN_WIDTH_PADDING, isLabelColumn ? LABEL_COLUMN_MIN_WIDTH : MIN_COLUMN_WIDTH),
      MAX_COLUMN_WIDTH
    );
    // Cot dau (ten chi tieu) la text, tu cot 2 tro di la so lieu - dinh dang
    // dau phay ngan cach hang nghin (theo yeu cau user 2026-07-04, khac quy
    // uoc dau cham cua ban goc) de de theo doi, khong anh huong cot text.
    if (i > 1) column.numFmt = '#,##0';
    // Can le THEO CA COT, khong de ExcelJS tu can theo KIEU DU LIEU tung o -
    // truoc day 1 cot Ma so vua co gia tri so (411 -> tu dong sang phai) vua
    // co gia tri chu (411a/411b -> tu dong sang trai), lam lech hang trong
    // CUNG 1 cot (yeu cau user 2026-07-10, xac nhan that tren bao cao IDV).
    column.alignment = {
      horizontal: isLabelColumn ? 'left' : isMetadataColumnName(table.columns[colIndex]) ? 'center' : 'right',
      vertical: 'middle',
    };
  }
}

// Ghi cac bang so lieu (da duoc AI tach o lib/export/financial-statements.ts)
// ra 1 file .xlsx, moi bang 1 tab - thu tu/danh sach bang phu thuoc businessType
// (xem sheetsForBusinessType o tren, CTCK co bo bang rieng).
export async function writeFinancialStatementsExcel(
  statements: FinancialStatements,
  destPath: string,
  businessType: BusinessType
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  for (const { key, name } of sheetsForBusinessType(businessType)) {
    const sheet = workbook.addWorksheet(name);
    writeTable(sheet, key, statements[key]);
  }
  await workbook.xlsx.writeFile(destPath);
}
