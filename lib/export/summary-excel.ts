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
    const byLabel = new Map(row.analysis.map((item) => [item.label, item]));
    const excelRow = sheet.addRow([
      index + 1,
      row.stockCode,
      row.companyName,
      row.exchange,
      row.statementScope,
      // Chi tieu bi kiem tra cheo tong nhom KQKD phat hien sai sau khi da
      // retry (xem lib/analysis.ts AnalysisRow.unreliable) - ghi ro CANH BAO
      // dang chu thay vi con so tinh tu du lieu co the da bi OCR gop/bia dong
      // (yeu cau user 2026-07-11: "báo lỗi ra bảng kết quả ở dòng tương ứng").
      ...labels.map((label) => {
        const item = byLabel.get(label);
        return item?.unreliable ? 'Cần xem tay' : (item?.percentChange ?? null);
      }),
    ]);

    // Highlight mau THEO DUNG quy luat tab Ket qua (yeu cau nguoi dung
    // 2026-07-18 - xem .pct-unreliable/.pct-level1/.pct-level2 o app/globals.css,
    // cung 1 nguon du lieu item.unreliable/item.tier tu lib/analysis.ts, chi
    // khac cach the hien mau: Excel dung fgColor thay vi CSS background, va
    // khong the "nhap nhay" (pct-blink) nhu web nen level2 chi giu nen vang
    // dam + chu dam de van phan biet duoc voi level1).
    labels.forEach((label, labelIdx) => {
      const item = byLabel.get(label);
      const cell = excelRow.getCell(FIXED_COLUMN_COUNT + 1 + labelIdx);
      if (item?.unreliable) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0E0' } };
        cell.font = { bold: true, color: { argb: 'FFB3261E' } };
        cell.note = 'OCR có thể đã gộp/bịa dòng dữ liệu, đã thử đọc lại (retry) nhưng vẫn sai kiểm tra chéo - cần xem tay trên PDF gốc.';
      } else if (item?.tier === 'level2') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD400' } };
        cell.font = { bold: true };
      } else if (item?.tier === 'level1') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3B0' } };
        cell.font = { bold: true };
      }
    });
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
