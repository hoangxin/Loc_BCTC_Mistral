import { callMistralOcr } from '../ai/mistral-ocr';
import { validateFinancialStatements } from './validate-statements';
import { parseStatementsFromMarkdown } from './markdown-tables';
import type { FinancialStatements } from './statement-shared';

// Re-export de cac file khac (excel.ts, pdf.ts, validate-statements.ts, lib/export/index.ts...)
// tiep tuc import type tu day nhu truoc, khong can sua lai import o noi khac.
export type { StatementTable, FinancialStatements } from './statement-shared';
export { findLabelColumnIndex, normalizeLabelText } from './statement-shared';

export interface ExtractFinancialStatementsInput {
  filePath: string;
  // Danh sach so trang (1-based, dung so trang trong tai lieu goc) trong pham
  // vi 3 bang chinh (da duoc lib/pdf-text.ts determineStatementPageScope xac
  // dinh san, van dung Tesseract - CHI de tim diem cat "Thuyet minh", khong
  // lien quan gi den viec doc so lieu, xem lib/pdf-text.ts).
  pageNumbers: number[];
}

export interface ExtractFinancialStatementsResult {
  statements: FinancialStatements;
  // Khac rong nghia la sau khi parse xong, so lieu van khong khop nguyen tac
  // ke toan bat buoc - can kiem tra tay lai (xem validate-statements.ts).
  warnings: string[];
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

  return { statements, warnings: issues.map((issue) => issue.message) };
}
