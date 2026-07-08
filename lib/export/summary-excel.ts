import ExcelJS from 'exceljs';
import { collectAnalysisLabels, type SummaryRow } from '../summary-row';
import { BUSINESS_TYPE_LABELS, BUSINESS_TYPE_ORDER } from '../business-type';

function writeSummarySheet(sheet: ExcelJS.Worksheet, rows: SummaryRow[]): void {
  const labels = collectAnalysisLabels(rows);

  // Bo cot "Ten tai lieu" (yeu cau user 2026-07-08, dong bo voi bang UI -
  // app/ReportsSummaryTable.tsx da bo cot nay truoc do).
  const FIXED_COLUMN_COUNT = 5;
  const header = ['STT', 'Mã CK', 'Tên công ty', 'Sàn giao dịch', 'Loại BCTC', ...labels.map((label) => `% ${label}`)];
  const headerRow = sheet.addRow(header);
  headerRow.font = { bold: true };

  rows.forEach((row, index) => {
    const byLabel = new Map(row.analysis.map((item) => [item.label, item.percentChange]));
    sheet.addRow([
      index + 1,
      row.stockCode,
      row.companyName,
      row.exchange,
      row.statementScope,
      ...labels.map((label) => byLabel.get(label) ?? null),
    ]);
  });

  for (let i = 1; i <= header.length; i++) {
    const column = sheet.getColumn(i);
    column.width = i <= FIXED_COLUMN_COUNT ? 24 : 16;
    if (i > FIXED_COLUMN_COUNT) column.numFmt = '0.0"%"';
  }
}

// Xuat bang tong hop (nhieu cong ty) ra 1 file .xlsx DUY NHAT nhung CHIA
// THANH 4 SHEET giong dung 4 tab loai hinh DN tren UI (yeu cau user
// 2026-07-08 - xem app/BusinessTypeTabs.tsx) - moi nhom BCTC theo mau bieu
// phap ly khac nhau nen tach rieng, KHAC voi lib/export/excel.ts (xuat 3
// bang chi tiet cua TUNG bao cao rieng le). STT danh lai tu 1 trong TUNG
// sheet (giong cach ReportsSummaryTable danh STT theo tung tab, khong dung
// STT goc da gan xuyen suot o app/api/export-summary/route.ts). Luon tao du
// 4 sheet (ke ca rong) de khop 1-1 voi 4 tab tren UI, du 1 nhom khong co bao
// cao nao. Build buffer trong bo nho, khong ghi dia (xem
// app/api/export-summary/route.ts).
export async function buildSummaryExcelBuffer(rows: SummaryRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  for (const type of BUSINESS_TYPE_ORDER) {
    const groupRows = rows.filter((row) => row.businessType === type);
    const sheet = workbook.addWorksheet(BUSINESS_TYPE_LABELS[type]);
    writeSummarySheet(sheet, groupRows);
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
