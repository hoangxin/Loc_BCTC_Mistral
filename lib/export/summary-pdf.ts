import { collectAnalysisLabels, type SummaryRow } from '../summary-row';
import { BODY_SIZE, HEADING_SIZE, PdfWriter, computeColumnLayout, drawTableRow, loadPdfDocumentWithFonts } from './pdf-shared';

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

// Xuat bang tong hop ra 1 file PDF DUY NHAT (khac lib/export/pdf.ts, xuat chi
// tiet 3 bang + toan van cua TUNG bao cao rieng le) - tai dung PdfWriter/
// drawTableRow/computeColumnLayout tu lib/export/pdf-shared.ts.
export async function buildSummaryPdfBuffer(rows: SummaryRow[]): Promise<Buffer> {
  const labels = collectAnalysisLabels(rows);
  const { doc, regular, bold } = await loadPdfDocumentWithFonts();
  const writer = new PdfWriter(doc, regular, bold);

  writer.drawText('Bảng tổng hợp % thay đổi BCTC', { size: HEADING_SIZE, bold: true, gapAfter: 10 });

  const columns = ['STT', 'Mã CK', 'Tên công ty', 'Loại BCTC', ...labels.map((label) => `% ${label}`)];
  const COMPANY_NAME_COLUMN_INDEX = 2;
  const layout = computeColumnLayout(columns, COMPANY_NAME_COLUMN_INDEX);

  drawTableRow(writer, columns, layout, { bold: true });
  for (const row of rows) {
    const byLabel = new Map(row.analysis.map((item) => [item.label, item.percentChange]));
    const cells = [
      String(row.stt),
      row.stockCode,
      row.companyName,
      row.statementScope,
      ...labels.map((label) => formatPercent(byLabel.get(label))),
    ];
    drawTableRow(writer, cells, layout, { bold: false });
  }

  if (rows.length === 0) {
    writer.drawText('(Không có dòng nào được chọn)', { size: BODY_SIZE, gapAfter: 4 });
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
