import { collectAnalysisLabels, type SummaryRow } from '../summary-row';
import { BODY_SIZE, HEADING_SIZE, PdfWriter, computeColumnLayout, drawTableRow, loadPdfDocumentWithFonts } from './pdf-shared';
import { formatPercentCell, formatPercentValue, percentCellKind } from '../percent-cell';
import type { AnalysisRow } from '../analysis';

// Rieng PDF de TRONG o khong co du lieu (khong in "—" nhu web/Excel): o day
// ky hieu do phai nam trong bo ky tu cua font nhung vao PDF (lib/export/fonts)
// moi in duoc, de trong la an toan va van doc duoc nhu truoc. Cac dang o
// khac dung dung 1 ban chu voi web/Excel (xem lib/percent-cell.ts).
function percentCellTextForPdf(item: AnalysisRow | undefined): string {
  const kind = percentCellKind(item);
  if (kind === 'percent') return formatPercentValue(item?.percentChange);
  if (kind === 'unreliable' || kind === 'newFromZero') return formatPercentCell(item);
  return '';
}

// Xuat bang tong hop ra 1 file PDF DUY NHAT (khac lib/export/pdf.ts, xuat chi
// tiet 3 bang + toan van cua TUNG bao cao rieng le) - tai dung PdfWriter/
// drawTableRow/computeColumnLayout tu lib/export/pdf-shared.ts.
export async function buildSummaryPdfBuffer(rows: SummaryRow[]): Promise<Buffer> {
  const labels = collectAnalysisLabels(rows);
  const { doc, regular, bold } = await loadPdfDocumentWithFonts();
  const writer = new PdfWriter(doc, regular, bold);

  writer.drawText('Bảng tổng hợp % thay đổi BCTC', { size: HEADING_SIZE, bold: true, gapAfter: 10 });

  // Bo cot "Ten tai lieu" (yeu cau user 2026-07-08, dong bo voi bang UI -
  // app/ReportsSummaryTable.tsx da bo cot nay truoc do).
  const columns = ['STT', 'Mã CK', 'Tên công ty', 'Sàn giao dịch', 'Loại BCTC', ...labels.map((label) => `% ${label}`)];
  const COMPANY_NAME_COLUMN_INDEX = 2;
  const layout = computeColumnLayout(columns, COMPANY_NAME_COLUMN_INDEX);

  drawTableRow(writer, columns, layout, { bold: true });
  for (const row of rows) {
    const byLabel = new Map(row.analysis.map((item) => [item.label, item]));
    const cells = [
      String(row.stt),
      row.stockCode,
      row.companyName,
      row.exchange,
      row.statementScope,
      // Chi tieu bi kiem tra cheo tong nhom KQKD phat hien sai sau khi da
      // retry (xem lib/analysis.ts AnalysisRow.unreliable) - ghi ro CANH BAO
      // dang chu thay vi con so tinh tu du lieu co the da bi OCR gop/bia dong
      // (yeu cau user 2026-07-11: "báo lỗi ra bảng kết quả ở dòng tương ứng").
      ...labels.map((label) => percentCellTextForPdf(byLabel.get(label))),
    ];
    drawTableRow(writer, cells, layout, { bold: false });
  }

  if (rows.length === 0) {
    writer.drawText('(Không có dòng nào được chọn)', { size: BODY_SIZE, gapAfter: 4 });
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
