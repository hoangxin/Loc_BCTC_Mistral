import { callMistralOcr } from '../ai/mistral-ocr';
import { parseStatementsFromMarkdown, cleanMarkdownForPdfText } from './markdown-tables';
import { validateFinancialStatements } from './validate-statements';
import type { FinancialStatements } from './statement-shared';

export interface FullReportResult {
  statements: FinancialStatements;
  fullText: string;
  warnings: string[];
}

// Dung DUY NHAT cho buoc "Xuat Excel/PDF" theo yeu cau (app/api/report-file) -
// OCR TOAN VAN CA TAI LIEU trong 1 LAN GOI DUY NHAT, roi tach ca 3 bang lan
// toan van TU CUNG 1 KET QUA OCR do. Quyet dinh theo yeu cau user (2026-07-06):
// KHONG ghep ket qua OCR 3 bang (rieng, pham vi truoc "Thuyet minh", tinh luc
// "Tai BCTC" - lib/report-extract.ts) voi OCR toan van (o day) lam 1 - 2 lan
// OCR doc lap tren cung 1 file co the cho ra so hoi khac nhau (Mistral khong
// dam bao 100% deterministic), ghep se rui ro sai lech ngam. `statements` tra
// ve tu ham nay la 1 PHEP TINH DOC LAP, KHONG lien quan gi den `analysis`/
// `statements` da hien tren bang ket qua luc "Tai BCTC".
//
// parseStatementsFromMarkdown da duoc sua (xem NOTES_SECTION_MARKERS trong
// markdown-tables.ts) de tu chan muc "Luu chuyen tien te" truoc "Thuyet minh"
// ke ca khi dau vao la TOAN VAN (khac han cach goi cu chi truyen dung pham vi
// truoc Thuyet minh) - khong can Tesseract do diem cat nhu buoc "Tai BCTC".
export async function extractFullReportFromPdf(filePath: string): Promise<FullReportResult> {
  const { pages } = await callMistralOcr(filePath);
  const markdown = pages.map((p) => p.markdown).join('\n\n');

  const statements = parseStatementsFromMarkdown(markdown);
  const fullText = cleanMarkdownForPdfText(markdown);
  const issues = validateFinancialStatements(statements);

  return { statements, fullText, warnings: issues.map((issue) => issue.message) };
}
