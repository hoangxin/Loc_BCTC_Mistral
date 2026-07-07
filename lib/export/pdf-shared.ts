import { readFile } from 'fs/promises';
import { join } from 'path';
import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { normalizeLabelText } from './statement-shared';

// Tach tu lib/export/pdf.ts (2026-07-05) - phan "ve bang PDF" thuan tuy,
// khong gan gi voi noi dung BCTC cu the, de dung chung cho ca xuat 1 bao cao
// (pdf.ts) va xuat bang tong hop nhieu cong ty (summary-pdf.ts).

export const PAGE_WIDTH = 595.28; // A4, don vi pt
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
export const BODY_SIZE = 10;
export const TABLE_SIZE = 8;
export const HEADING_SIZE = 15;
export const SUBHEADING_SIZE = 11;
export const BORDER_COLOR = rgb(0.6, 0.6, 0.6);

// Dung font Noto Sans dong goi san trong repo (ho tro day du tieng Viet co
// dau) thay vi font chuan cua pdf-lib (Helvetica/Times khong co dau tieng
// Viet) - TRUOC DAY tro thang toi C:/Windows/Fonts/arial.ttf, chi dung duoc
// khi chay tren may Windows cua user; gay loi ENOENT ngay khi len Vercel
// (Linux, khong co duong dan do) - gap that 2026-07-07. Noto Sans (OFL,
// google/fonts) da kiem tra du glyph tieng Viet can dung (nguyen am co dau,
// d/D moc, u/U moc rieng...).
const FONT_REGULAR_PATH = join(process.cwd(), 'lib', 'export', 'fonts', 'NotoSans-Regular.ttf');
const FONT_BOLD_PATH = join(process.cwd(), 'lib', 'export', 'fonts', 'NotoSans-Bold.ttf');

// Loc bo ky tu ma font Arial khong co glyph (vd rac OCR, ky tu hiem) - giu lai
// ASCII in duoc ( -~) + Latin-1 Supplement/Extended-A/B
// ( -ɏ, gom cac chu co dau don gian + d/D, u/U, o/O moc rieng cua
// tieng Viet) + Latin Extended Additional (Ḁ-ỿ, hau het nguyen am
// tieng Viet ghep dau) - tranh pdf-lib nem loi "cannot encode" giua chung lam
// hong ca file.
const UNSAFE_CHAR_PATTERN = /[^ -~ -ɏḀ-ỿ\n\r\t]/g;

export function sanitizeForPdf(text: string): string {
  return text.replace(UNSAFE_CHAR_PATTERN, ' ');
}

// Dau phay ngan cach hang nghin (theo yeu cau user 2026-07-04) - khac quy uoc
// dau cham cua ban goc PDF Vietstock, nhung de theo doi/doi chieu hon voi
// cach doc so quoc te.
export function formatCellValue(value: string | number | null): string {
  if (value == null) return '';
  if (typeof value !== 'number') return sanitizeForPdf(String(value));
  const negative = value < 0;
  const digits = String(Math.round(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return negative ? `(${digits})` : digits;
}

// Gap tung dong theo do rong toi da (greedy word-wrap) - can vi pdf-lib khong
// tu xuong dong, phai tu tinh do rong text bang font that su dang dung.
export function wrapLine(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = (text ?? '').split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function loadPdfDocumentWithFonts(): Promise<{ doc: PDFDocument; regular: PDFFont; bold: PDFFont }> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([readFile(FONT_REGULAR_PATH), readFile(FONT_BOLD_PATH)]);
  const regular = await doc.embedFont(regularBytes, { subset: true });
  const bold = await doc.embedFont(boldBytes, { subset: true });
  return { doc, regular, bold };
}

// Quan ly vi tri ve (trang hien tai + toa do Y) va tu dong sang trang moi khi
// het cho - dung chung cho ca phan tieu de, bang so lieu, va toan van.
export class PdfWriter {
  page: PDFPage;
  y: number = 0;

  constructor(
    private doc: PDFDocument,
    public regular: PDFFont,
    public bold: PDFFont
  ) {
    this.page = this.newPage();
  }

  private newPage(): PDFPage {
    const page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = PAGE_HEIGHT - MARGIN;
    return page;
  }

  ensureSpace(height: number) {
    if (this.y - height < MARGIN) {
      this.page = this.newPage();
    }
  }

  drawText(text: string, opts: { size?: number; bold?: boolean; gapAfter?: number } = {}) {
    const size = opts.size ?? BODY_SIZE;
    const font = opts.bold ? this.bold : this.regular;
    const gapAfter = opts.gapAfter ?? 4;
    this.ensureSpace(size + gapAfter);
    this.page.drawText(sanitizeForPdf(text), { x: MARGIN, y: this.y - size, size, font });
    this.y -= size + gapAfter;
  }

  drawWrappedText(text: string, opts: { size?: number; gapAfter?: number } = {}) {
    const size = opts.size ?? BODY_SIZE;
    const gapAfter = opts.gapAfter ?? 2;
    for (const line of wrapLine(sanitizeForPdf(text), this.regular, size, CONTENT_WIDTH)) {
      this.ensureSpace(size + gapAfter);
      this.page.drawText(line, { x: MARGIN, y: this.y - size, size, font: this.regular });
      this.y -= size + gapAfter;
    }
  }
}

export interface ColumnLayout {
  x: number;
  width: number;
}

// Cac cot chi chua ma/chu thich ngan (STT, Ma so, Thuyet minh) - khong can
// nhieu cho nhu cot ten chi tieu hay cac cot so lieu (13-14 chu so). Neu
// khong tach rieng, cot STT (chi 1-2 ky tu) se bi chia deu chung mot phan
// rong voi cac cot so lieu dai, day cac cot so lieu bi hep lai va chu de de
// bi ve de len nhau giua cac cot - da gap that qua feedback user 2026-07-04.
const NARROW_COLUMN_NAMES = ['STT', 'MA SO', 'THUYET MINH'];
const NARROW_COLUMN_WIDTH = 45;

function isNarrowColumn(columnName: string): boolean {
  const normalized = normalizeLabelText(columnName);
  return NARROW_COLUMN_NAMES.some((name) => normalized.includes(name));
}

export function computeColumnLayout(columns: string[], labelColumnIndex: number): ColumnLayout[] {
  // Cot ten chi tieu can rong hon nhieu vi la cau tieng Viet dai; cac cot
  // ngan (STT/Ma so/Thuyet minh) duoc cap 1 do rong co dinh nho; phan con lai
  // chia deu cho cac cot so lieu (thuong la 2 cot: so cuoi ky/so dau nam).
  const labelWidth = Math.min(CONTENT_WIDTH * 0.4, 220);
  const narrowIndexes = new Set(
    columns.map((col, i) => (i !== labelColumnIndex && isNarrowColumn(col) ? i : -1)).filter((i) => i !== -1)
  );
  const wideCount = columns.length - 1 - narrowIndexes.size;
  const usedWidth = labelWidth + narrowIndexes.size * NARROW_COLUMN_WIDTH;
  const wideWidth = wideCount > 0 ? Math.max(60, (CONTENT_WIDTH - usedWidth) / wideCount) : 0;

  const layout: ColumnLayout[] = [];
  let x = MARGIN;
  for (let i = 0; i < columns.length; i++) {
    const width = i === labelColumnIndex ? labelWidth : narrowIndexes.has(i) ? NARROW_COLUMN_WIDTH : wideWidth;
    layout.push({ x, width });
    x += width;
  }
  return layout;
}

export function drawTableRow(writer: PdfWriter, cells: string[], columns: ColumnLayout[], opts: { bold?: boolean }) {
  const font = opts.bold ? writer.bold : writer.regular;
  const padding = 3;
  const wrappedCells = cells.map((cell, i) => wrapLine(cell, font, TABLE_SIZE, columns[i].width - padding * 2));
  const lineCount = Math.max(1, ...wrappedCells.map((lines) => lines.length));
  const rowHeight = lineCount * (TABLE_SIZE + 2) + padding * 2;

  writer.ensureSpace(rowHeight);
  const topY = writer.y;
  const bottomY = topY - rowHeight;

  wrappedCells.forEach((lines, i) => {
    let cellY = topY - padding - TABLE_SIZE;
    for (const line of lines) {
      writer.page.drawText(line, { x: columns[i].x + padding, y: cellY, size: TABLE_SIZE, font });
      cellY -= TABLE_SIZE + 2;
    }
  });

  for (const col of columns) {
    writer.page.drawLine({ start: { x: col.x, y: topY }, end: { x: col.x, y: bottomY }, thickness: 0.5, color: BORDER_COLOR });
  }
  const rightEdge = columns[columns.length - 1].x + columns[columns.length - 1].width;
  writer.page.drawLine({ start: { x: rightEdge, y: topY }, end: { x: rightEdge, y: bottomY }, thickness: 0.5, color: BORDER_COLOR });
  writer.page.drawLine({ start: { x: MARGIN, y: topY }, end: { x: rightEdge, y: topY }, thickness: 0.5, color: BORDER_COLOR });
  writer.page.drawLine({ start: { x: MARGIN, y: bottomY }, end: { x: rightEdge, y: bottomY }, thickness: 0.5, color: BORDER_COLOR });

  writer.y = bottomY;
}
