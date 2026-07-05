import ExcelJS from 'exceljs';
import { collectAnalysisLabels, type SummaryRow } from '../summary-row';

// Xuat bang tong hop (nhieu cong ty, cac dong duoc tick chon tren UI) ra 1
// file .xlsx DUY NHAT, KHAC voi lib/export/excel.ts (xuat 3 bang chi tiet cua
// TUNG bao cao rieng le) - build buffer trong bo nho, khong ghi dia (xem
// app/api/export-summary/route.ts).
export async function buildSummaryExcelBuffer(rows: SummaryRow[]): Promise<Buffer> {
  const labels = collectAnalysisLabels(rows);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Tổng hợp');

  const FIXED_COLUMN_COUNT = 6;
  const header = ['STT', 'Mã CK', 'Tên công ty', 'Sàn giao dịch', 'Tên tài liệu', 'Loại BCTC', ...labels.map((label) => `% ${label}`)];
  const headerRow = sheet.addRow(header);
  headerRow.font = { bold: true };

  for (const row of rows) {
    const byLabel = new Map(row.analysis.map((item) => [item.label, item.percentChange]));
    sheet.addRow([
      row.stt,
      row.stockCode,
      row.companyName,
      row.exchange,
      row.title,
      row.statementScope,
      ...labels.map((label) => byLabel.get(label) ?? null),
    ]);
  }

  for (let i = 1; i <= header.length; i++) {
    const column = sheet.getColumn(i);
    column.width = i <= FIXED_COLUMN_COUNT ? 24 : 16;
    if (i > FIXED_COLUMN_COUNT) column.numFmt = '0.0"%"';
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
