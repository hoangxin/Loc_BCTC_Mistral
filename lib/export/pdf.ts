import { writeFile } from 'fs/promises';
import { findLabelColumnIndex, type FinancialStatements, type StatementTable } from './financial-statements';
import { autoColumnarize, REAL_AMOUNT_PATTERN } from '../text-columnarize';

// DU PHONG - KHONG con noi nao goi (2026-07-07, xem app/api/report-file/route.ts
// va lib/export/full-document.ts) - nut "Xuat PDF" gio mo THANG file goc tren
// Vietstock thay vi dung PDF moi qua writeReportPdf duoi. GIU LAI file nay
// (theo yeu cau user) phong khi can dung lai.
import {
  BODY_SIZE,
  HEADING_SIZE,
  MARGIN,
  PdfWriter,
  SUBHEADING_SIZE,
  computeColumnLayout,
  drawTableRow,
  formatCellValue,
  loadPdfDocumentWithFonts,
  sanitizeForPdf,
  wrapLine,
} from './pdf-shared';

export interface PdfReportMeta {
  stockCode: string;
  companyName: string;
  title: string;
}

// Do rong CO DINH cho cot nhan va tung cot so lieu trong cac dong dang bang
// (vd trong Thuyet minh) - PHAI co dinh, KHONG duoc tinh lai theo tung dong
// (vd theo so luong gia tri cua dong do), vi neu thay doi giua cac dong thi
// cac cot se bi xe lech nhau giua cac hang - dung 1 bo do rong chung cho CA
// DOAN de so hang duoi thang hang voi hang tren (yeu cau user 2026-07-05:
// "so hang duoi phai thang le voi so hang tren, giong file pdf goc").
const NOTES_LABEL_WIDTH = 260;
const NOTES_VALUE_COLUMN_WIDTH = 95;

// Vai bang qua phuc tap (nhieu cot, vd "Thay doi von chu so huu") khien AI
// "hallucinate" - lap lai 1 tu don (thuong la don vi tien te "VND") hang chuc/
// hang tram lan thay vi so lieu that (da gap that qua feedback user
// 2026-07-05, muc 22 tra ve gan 200 dong chi co chu "VND"). Phat hien: mot
// "cot gia tri" ma noi dung, sau khi bo khoang trang, CHINH LA 1 trong cac tu
// vo nghia thuong gap VA xuat hien lap lai qua nhieu lan lien tiep trong cung
// 1 dong - thay the toan bo cac gia tri do bang 1 ghi chu ro rang thay vi
// nhoi ca tram cot "VND" vao PDF (khong giup ich gi, chi lam roi mat).
const HALLUCINATION_FILLER_WORDS = new Set(['VND', 'ĐỒNG', 'DONG']);
const HALLUCINATION_MIN_REPEATS = 6;

function collapseHallucinatedRepeats(values: string[]): string[] {
  const normalized = values.map((value) => value.trim().toUpperCase());
  let repeatCount = 0;
  for (let i = 0; i < normalized.length; i++) {
    if (HALLUCINATION_FILLER_WORDS.has(normalized[i]) && normalized[i] === normalized[i - 1]) {
      repeatCount++;
    }
  }
  if (repeatCount < HALLUCINATION_MIN_REPEATS) return values;
  return ['(AI khong doc duoc so lieu bang nay - lap lai don vi tien te thay vi so that, can xem tay tren PDF goc)'];
}

// Bien the khac cua cung 1 kieu "hallucinate" o tren nhung MOI GIA TRI nam
// tren 1 DONG RIENG (khong phai nhieu gia tri tren cung 1 dong "|") - da gap
// that qua feedback user 2026-07-05 (muc "22. Thay doi von chu so huu" tra
// ve gan 200 DONG lien tiep chi co chu "VND", khong co dau "|" nao). Quet
// TOAN BO van ban, thay 1 chuoi dong lap giong het nhau (tu don vo nghia)
// bang 1 dong ghi chu duy nhat.
const HALLUCINATION_MIN_LINE_REPEATS = 6;

function collapseHallucinatedLineRuns(fullText: string): string {
  const lines = fullText.split(/\r?\n/);
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const normalized = lines[i].trim().toUpperCase();
    if (HALLUCINATION_FILLER_WORDS.has(normalized)) {
      let j = i;
      while (j < lines.length && lines[j].trim().toUpperCase() === normalized) j++;
      if (j - i >= HALLUCINATION_MIN_LINE_REPEATS) {
        result.push('(AI khong doc duoc so lieu doan nay - lap lai don vi tien te thay vi so that, can xem tay tren PDF goc)');
        i = j;
        continue;
      }
    }
    result.push(lines[i]);
    i++;
  }
  return result.join('\n');
}

// Danh sach dang "* Ten cong ty" roi cac truong con (mo ta hoat dong, ty le
// so huu...) MOI TRUONG nam tren 1 DONG RIENG thay vi cung 1 dong voi dau
// "|" nhu da dan trong prompt - AI khong tuan thu nhat quan giua cac lan goi
// (da gap that qua feedback user 2026-07-05: CUNG 1 tai lieu, co lan model
// tra dung dinh dang "|", co lan lai tach thanh nhieu dong roi nhu the nay -
// khong the sua bang prompt don thuan). Gom cac dong "mo coi" ngay sau 1
// dong bat dau bang "*"/"-" (khong tu no chua so lieu/dau "|") lai thanh 1
// dong "|" duy nhat, dung lam luoi an toan bo sung cho autoColumnarize (chi
// xu ly khi CA nhan lan gia tri deu tren 1 dong san).
const BULLET_LINE_PATTERN = /^[*\-•]\s+/;
const MAX_BULLET_RECORD_LOOKAHEAD = 4;

function mergeBrokenBulletRecords(fullText: string): string {
  const lines = fullText.split(/\r?\n/);
  const result: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (BULLET_LINE_PATTERN.test(line) && !line.includes('|') && !REAL_AMOUNT_PATTERN.test(line)) {
      const parts = [line.replace(BULLET_LINE_PATTERN, '').trim()];
      let j = i + 1;
      while (
        j < lines.length &&
        parts.length - 1 < MAX_BULLET_RECORD_LOOKAHEAD &&
        lines[j].trim() !== '' &&
        !BULLET_LINE_PATTERN.test(lines[j]) &&
        !lines[j].includes('|')
      ) {
        parts.push(lines[j].trim());
        j++;
      }
      if (parts.length > 1) {
        result.push(parts.join(' | '));
        i = j;
        continue;
      }
    }
    result.push(line);
    i++;
  }
  return result.join('\n');
}

// Gia tri "giong so" (chi gom chu so/dau cham/phay/%/ngoac/gach ngang) - ve
// canh phai, 1 dong, trong 1 cot rong co dinh. Gia tri KHAC (vd mo ta hoat
// dong kinh doanh cua cong ty con trong danh sach cong ty con) la VAN BAN DAI
// - phai cho xuong dong trong pham vi cot (canh trai), KHONG duoc ve nguyen 1
// dong dai de no de len cot ben canh (da gap that qua feedback user
// 2026-07-05 voi bang danh sach cong ty con).
function isNumericLikeValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === '' || /^[\d.,()%\-–]+$/.test(trimmed);
}

// Ve 1 dong dang bang trong "Toan van bao cao" (vision model danh dau ranh
// gioi cot bang " | " khi chep - xem lib/export/transcribe.ts) thanh cac cot
// thang hang: ten chi tieu ben trai (co xuong dong neu dai), tung gia tri so
// can phai trong 1 cot rieng co do rong co dinh - khac han drawWrappedText
// (chi chay chu lien tuc, khong giu duoc cot) dung cho cac dong van ban
// thong thuong.
function drawNotesTableLine(writer: PdfWriter, line: string) {
  const parts = line.split('|').map((part) => part.trim());
  const label = parts[0] ?? '';
  const values = collapseHallucinatedRepeats(parts.slice(1));
  const size = BODY_SIZE;

  const labelLines = wrapLine(sanitizeForPdf(label), writer.regular, size, NOTES_LABEL_WIDTH - 4);
  const valueLinesPerColumn = values.map((rawValue) => {
    const value = sanitizeForPdf(rawValue);
    return isNumericLikeValue(value) ? [value] : wrapLine(value, writer.regular, size, NOTES_VALUE_COLUMN_WIDTH - 8);
  });
  const rowHeight = Math.max(labelLines.length, ...valueLinesPerColumn.map((lines) => lines.length), 1) * (size + 2);

  writer.ensureSpace(rowHeight);
  const topY = writer.y;

  let labelY = topY - size;
  for (const labelLine of labelLines) {
    writer.page.drawText(labelLine, { x: MARGIN, y: labelY, size, font: writer.regular });
    labelY -= size + 2;
  }

  let x = MARGIN + NOTES_LABEL_WIDTH;
  valueLinesPerColumn.forEach((lines, colIndex) => {
    const numeric = isNumericLikeValue(sanitizeForPdf(values[colIndex] ?? ''));
    let valueY = topY - size;
    for (const valueLine of lines) {
      if (numeric) {
        const textWidth = writer.regular.widthOfTextAtSize(valueLine, size);
        writer.page.drawText(valueLine, { x: x + NOTES_VALUE_COLUMN_WIDTH - textWidth - 4, y: valueY, size, font: writer.regular });
      } else {
        writer.page.drawText(valueLine, { x: x + 4, y: valueY, size, font: writer.regular });
      }
      valueY -= size + 2;
    }
    x += NOTES_VALUE_COLUMN_WIDTH;
  });

  writer.y = topY - rowHeight;
}

function drawStatementTable(writer: PdfWriter, heading: string, table: StatementTable) {
  if (table.columns.length === 0 && table.rows.length === 0) return;

  writer.drawText(heading, { size: SUBHEADING_SIZE, bold: true, gapAfter: 6 });

  const columnCount = Math.max(table.columns.length, ...table.rows.map((row) => row.length), 1);
  const paddedColumnNames = Array.from({ length: columnCount }, (_, i) => table.columns[i] ?? '');
  const labelColumnIndex = findLabelColumnIndex(table.columns);
  const columns = computeColumnLayout(paddedColumnNames, labelColumnIndex);

  const headerCells = paddedColumnNames.map((name) => sanitizeForPdf(name));
  drawTableRow(writer, headerCells, columns, { bold: true });

  for (const row of table.rows) {
    const cells = Array.from({ length: columnCount }, (_, i) => formatCellValue(row[i] ?? null));
    drawTableRow(writer, cells, columns, { bold: false });
  }

  writer.y -= 10;
}

const STATEMENT_SECTIONS: { key: keyof FinancialStatements; heading: string }[] = [
  { key: 'balanceSheet', heading: 'Bảng cân đối kế toán' },
  { key: 'incomeStatement', heading: 'Báo cáo kết quả hoạt động kinh doanh' },
  { key: 'cashFlow', heading: 'Báo cáo lưu chuyển tiền tệ' },
];

// Xuat PDF text sach (khong phai anh scan goc) - dung khi user can highlight/
// ghi chu/copy so lieu ra ngoai, thay the .docx (xem lib/export/docx.ts, da bo).
// Gom 3 bang so lieu (da AI/vision model cau truc hoa) VA toan van bao cao
// (ke ca Thuyet minh, chi co voi bao cao da qua bo loc noi dung - xem
// lib/pipeline.ts) trong CUNG 1 file, giong cau truc .docx cu.
export async function writeReportPdf(
  meta: PdfReportMeta,
  fullText: string,
  statements: FinancialStatements | null,
  destPath: string
): Promise<void> {
  const { doc, regular, bold } = await loadPdfDocumentWithFonts();
  const writer = new PdfWriter(doc, regular, bold);

  writer.drawText(`${meta.stockCode} - ${meta.companyName}`, { size: HEADING_SIZE, bold: true, gapAfter: 8 });
  writer.drawText(meta.title, { size: SUBHEADING_SIZE, bold: true, gapAfter: 12 });

  if (statements) {
    for (const { key, heading } of STATEMENT_SECTIONS) {
      drawStatementTable(writer, heading, statements[key]);
    }
  }

  writer.drawText('Toàn văn báo cáo', { size: SUBHEADING_SIZE, bold: true, gapAfter: 8 });
  // Tien xu ly TOAN VAN BAN truoc khi tach dong ve - gom cac "ho so bullet" bi
  // vo thanh nhieu dong roi ve lai thanh 1 dong "|", va thu gon cac chuoi dong
  // lap tu vo nghia (hallucination) - ca 2 deu la luoi an toan doc lap voi
  // viec model co tuan thu dinh dang da dan trong prompt hay khong (xem
  // lib/export/transcribe.ts va comment o tung ham).
  const preprocessedFullText = collapseHallucinatedLineRuns(mergeBrokenBulletRecords(fullText));
  for (const rawLine of preprocessedFullText.split(/\r?\n/)) {
    // Dong dang bang (vd trong Thuyet minh) duoc vision model danh dau ranh
    // gioi cot bang " | " khi chep (xem lib/export/transcribe.ts) - ve rieng
    // theo cot thang hang thay vi chay chu lien tuc nhu dong van ban thuong.
    // autoColumnarize: luoi an toan cho cac dong AI QUEN chen "|" du co so
    // lieu ro rang (xem comment o ham do).
    const line = autoColumnarize(rawLine);
    if (line.includes('|')) {
      drawNotesTableLine(writer, line);
    } else {
      writer.drawWrappedText(line);
    }
  }

  const bytes = await doc.save();
  await writeFile(destPath, bytes);
}
