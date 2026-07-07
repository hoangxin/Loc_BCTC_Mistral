import { callMistralOcr, type MistralOcrPage } from '../ai/mistral-ocr';
import { validateFinancialStatements } from './validate-statements';
import { containsNotesSectionMarker, parseStatementsFromMarkdown } from './markdown-tables';
import { classifyBusinessType, type BusinessType } from '../business-type';
import type { FinancialStatements } from './statement-shared';

// Re-export de cac file khac (excel.ts, pdf.ts, validate-statements.ts, lib/export/index.ts...)
// tiep tuc import type tu day nhu truoc, khong can sua lai import o noi khac.
export type { StatementTable, FinancialStatements } from './statement-shared';
export { findLabelColumnIndex, normalizeLabelText } from './statement-shared';

export interface ExtractFinancialStatementsInput {
  filePath: string;
  // Danh sach so trang (1-based, dung so trang trong tai lieu goc) trong pham
  // vi 3 bang chinh - da duoc lib/pdf-text.ts determineStatementPageScope xac
  // dinh san TU TEXT LAYER THAT (khong OCR), dung cho truong hop PDF born-digital
  // hoac scan ngan (xem needsOcrProbe). Bao cao scan dai dung
  // extractFinancialStatementsWithOcrProbe duoi thay vi ham nay.
  pageNumbers: number[];
}

export interface ExtractFinancialStatementsResult {
  statements: FinancialStatements;
  // Khac rong nghia la sau khi parse xong, so lieu van khong khop nguyen tac
  // ke toan bat buoc - can kiem tra tay lai (xem validate-statements.ts).
  warnings: string[];
  // Ngan hang/Chung khoan/Bao hiem/Khac - suy tu MA MAU BIEU in tren chinh
  // markdown OCR duoc (xem lib/business-type.ts) - tinh LUON o day (khong ton
  // OCR/doc them lan nao) vi markdown da co san trong tay.
  businessType: BusinessType;
}

// Thay the hoan toan Qwen vision (2026-07-05, xem memory/README): goi thang
// Mistral OCR (KHONG qua OpenRouter, xem lib/ai/mistral-ocr.ts) tren CHINH file
// PDF goc (khong can render anh tung trang qua pdf-lib/pdf-parse nhu truoc -
// Mistral OCR nhan thang file PDF), roi parse markdown tra ve thanh 3 bang
// HOAN TOAN LOCAL (lib/export/markdown-tables.ts, khong goi AI them). Da test
// that (2026-07-05) tren 2 bao cao (HSG 6 trang, TIX 29 trang) - ca 2 deu dat
// 0 loi validateFinancialStatements() sau khi sua cac bug parse markdown, so
// voi Qwen vision truoc day thinh thoang van lech vai so.
//
// KHONG con vong lap "corrective retry" goi lai AI voi prompt sua loi nhu ban
// Qwen vision cu (xem lich su o financial-statements.ts truoc day) - khai
// niem do dua tren viec "yeu cau model doc lai anh ky hon", khong ap dung duoc
// voi OCR (khong co hoi thoai sua loi). Retry o day CHI la retry MANG/loi tam
// thoi (trong lib/ai/mistral-ocr.ts), khong phai retry noi dung. Neu
// validateFinancialStatements() con thay van de sau 1 lan doc, no duoc BAO CAO
// qua warnings (fail-closed, khong am tham bo qua - nguyen tac chuan cua
// project nay), KHONG tu dong "sua" - can nguoi xem tay tren PDF neu can.
export async function extractFinancialStatements(
  input: ExtractFinancialStatementsInput
): Promise<ExtractFinancialStatementsResult> {
  const pagesZeroBased = input.pageNumbers.map((n) => n - 1);
  const { pages } = await callMistralOcr(input.filePath, { pages: pagesZeroBased });

  const markdown = pages.map((p) => p.markdown).join('\n\n');
  const statements = parseStatementsFromMarkdown(markdown);
  const issues = validateFinancialStatements(statements);

  return { statements, warnings: issues.map((issue) => issue.message), businessType: classifyBusinessType(markdown) };
}

// Lo DAU TIEN khi do diem cat bang chinh Mistral (bao cao scan dai, khong co
// text layer that de tu do - xem lib/pdf-text.ts needsOcrProbe). Ban dau thu
// 6 trang + mo rong 1 trang/lan (2026-07-07) de toi thieu so trang OCR du,
// nhung do that cho thay moi lan goi Mistral OCR co phi CO DINH ~4s (round-trip
// mang, khong giam theo so trang) - mo rong tung trang cong don qua nhieu lan
// goi rieng le lam CHAM HAN so voi gop chung 1 lo (vd 6 trang trong 1 lan goi
// chi ~11s, ~1.8s/trang, so voi 1 trang/lan ~4s/trang) - doi lai quyet dinh
// (2026-07-07, sau khi do so lieu that): quay ve lo 12 trang nhu Tesseract
// truoc day (it lan goi hon, nhanh hon ro ret), mo rong 2 trang/lan (thay vi 1)
// neu chua du - can bang giua toc do (it lan goi hon 1 trang/lan) va tranh OCR
// du qua nhieu (khong quay lai lo lon 12 trang/lan luc mo rong).
const INITIAL_PROBE_BATCH_SIZE = 12;
// Sau lo dau, moi lan OCR THEM 2 trang moi (khong OCR lai cac trang cu - merge
// vao ket qua da co) roi kiem tra lai ngay.
const EXPAND_STEP = 2;

// Bao cao scan dai: KHONG con Tesseract do diem cat truoc (xem lich su bo
// Tesseract 2026-07-07 - crash native "Create skia surface failed" tren tai
// lieu nhieu trang, cong them ton them 1 vong OCR local rieng). Thay bang OCR
// THANG qua Mistral theo tung lo (lo dau INITIAL_PROBE_BATCH_SIZE trang, sau
// do tung trang EXPAND_STEP), dung LUON markdown da OCR duoc de tim tieu de
// "Thuyet minh" (containsNotesSectionMarker) - thay vi 2 buoc rieng (do diem
// cat roi OCR lai lan nua), gio CHI 1 vong OCR tang dan, dung ngay khi thay
// "Thuyet minh" (hoac het trang). Cac lan goi sau CHI OCR trang MOI (chua OCR
// lan nao), roi merge vao ket qua da co - khong bao gio OCR lai tu dau. Markdown
// OCR duoc dung LUON lam dau vao parseStatementsFromMarkdown (ham do da tu
// chan dung truoc "Thuyet minh" - xem NOTES_SECTION_MARKERS) - khong OCR lai lan 2.
export async function extractFinancialStatementsWithOcrProbe(filePath: string, totalPages: number): Promise<ExtractFinancialStatementsResult> {
  const collected: MistralOcrPage[] = [];
  let cursor = 0;

  while (cursor < totalPages) {
    const step = collected.length === 0 ? INITIAL_PROBE_BATCH_SIZE : EXPAND_STEP;
    const batchEnd = Math.min(cursor + step, totalPages);
    const pagesZeroBased = Array.from({ length: batchEnd - cursor }, (_, i) => cursor + i);
    const { pages } = await callMistralOcr(filePath, { pages: pagesZeroBased });
    collected.push(...pages);
    cursor = batchEnd;

    const markdownSoFar = collected.map((p) => p.markdown).join('\n\n');
    if (containsNotesSectionMarker(markdownSoFar)) break;
  }

  const markdown = collected.map((p) => p.markdown).join('\n\n');
  const statements = parseStatementsFromMarkdown(markdown);
  const issues = validateFinancialStatements(statements);

  return { statements, warnings: issues.map((issue) => issue.message), businessType: classifyBusinessType(markdown) };
}
