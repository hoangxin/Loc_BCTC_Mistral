import ExcelJS from 'exceljs';
import type { FinancialStatements, StatementTable } from './financial-statements';

// Ten sheet Excel gioi han 31 ky tu va khong duoc chua [ ] : * ? / \ - cac ten
// duoi day deu an toan.
const SHEETS: { key: keyof FinancialStatements; name: string }[] = [
  { key: 'balanceSheet', name: 'Cân đối kế toán' },
  { key: 'incomeStatement', name: 'KQ kinh doanh' },
  { key: 'cashFlow', name: 'Lưu chuyển tiền tệ' },
];

function writeTable(sheet: ExcelJS.Worksheet, table: StatementTable): void {
  if (table.columns.length > 0) {
    const headerRow = sheet.addRow(table.columns);
    headerRow.font = { bold: true };
  }
  for (const row of table.rows) {
    sheet.addRow(row);
  }

  // sheet.columns chi khac null neu duoc gan truoc do bang mot mang dinh
  // nghia cot (voi header/key) - vi minh ghi row bang mang gia tri tho qua
  // addRow() nen phai chinh do rong tung cot qua getColumn(index).
  const columnCount = Math.max(table.columns.length, ...table.rows.map((row) => row.length), 1);
  for (let i = 1; i <= columnCount; i++) {
    const column = sheet.getColumn(i);
    column.width = 32;
    // Cot dau (ten chi tieu) la text, tu cot 2 tro di la so lieu - dinh dang
    // dau phay ngan cach hang nghin (theo yeu cau user 2026-07-04, khac quy
    // uoc dau cham cua ban goc) de de theo doi, khong anh huong cot text.
    if (i > 1) column.numFmt = '#,##0';
  }
}

// Ghi 3 bang so lieu (da duoc AI tach o lib/export/financial-statements.ts)
// ra 1 file .xlsx, moi bang 1 tab, dung thu tu: can doi ke toan, ket qua kinh
// doanh, luu chuyen tien te.
export async function writeFinancialStatementsExcel(statements: FinancialStatements, destPath: string): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  for (const { key, name } of SHEETS) {
    const sheet = workbook.addWorksheet(name);
    writeTable(sheet, statements[key]);
  }
  await workbook.xlsx.writeFile(destPath);
}
