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

  const header = ['STT', 'Mã CK', 'Tên công ty', 'Loại BCTC', ...labels.map((label) => `% ${label}`)];
  const headerRow = sheet.addRow(header);
  headerRow.font = { bold: true };

  for (const row of rows) {
    const byLabel = new Map(row.analysis.map((item) => [item.label, item.percentChange]));
    sheet.addRow([row.stt, row.stockCode, row.companyName, row.statementScope, ...labels.map((label) => byLabel.get(label) ?? null)]);
  }

  for (let i = 1; i <= header.length; i++) {
    const column = sheet.getColumn(i);
    column.width = i <= 4 ? 24 : 16;
    if (i > 4) column.numFmt = '0.0"%"';
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
