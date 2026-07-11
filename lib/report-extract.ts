import { determineStatementPageScope } from './pdf-text';
import { extractFinancialStatements, extractFinancialStatementsWithOcrProbe } from './export/financial-statements';
import { extractFinancialStatementsFromDocx } from './export/docx-statements';
import { extractFinancialStatementsFromDoc } from './export/doc-statements';
import { classifyBusinessType, type BusinessType } from './business-type';
import type { FinancialStatements } from './export/statement-shared';
import type { ResolvedReportFile } from './report-source';

// Diem noi DUY NHAT re nhanh theo dinh dang file (pdf/docx/doc, xem
// lib/report-source.ts) de trich 3 bang - dung chung cho ca luong Vietstock
// hang loat (lib/pipeline.ts) lan nguon rieng (lib/custom-source.ts), tranh
// lap logic re nhanh o 2 noi. CHI trich 3 bang (pham vi truoc Thuyet minh cho
// pdf) - KHONG con OCR toan van o day nua (buoc do rieng, chi lam luc user
// bam "Xuat" cho 1 bao cao cu the - xem lib/export/full-document.ts,
// app/api/report-file/route.ts).
export interface ReportContentResult {
  statements: FinancialStatements;
  warnings: string[];
  fullText: string | null; // co san (khong ton them) cho docx/doc; null cho pdf (khong con OCR toan van o day)
  // Ngan hang/Chung khoan/Bao hiem/Khac - xem lib/business-type.ts.
  businessType: BusinessType;
  // Xem ExtractFinancialStatementsResult (lib/export/financial-statements.ts)
  // - CHI co gia tri thuc su cho nhanh PDF/Mistral OCR (noi loi "gop/bia dong"
  // duoc phat hien). docx/doc la parse van ban tat dinh (khong OCR, khong co
  // rui ro hallucination tuong tu) nen luon rong - khong chay kiem tra tong
  // nhom rieng cho 2 dinh dang nay (ngoai pham vi yeu cau nguoi dung 2026-07-11).
  unreliableIncomeStatementCells: Set<string>;
}

export async function extractReportContent(resolved: ResolvedReportFile): Promise<ReportContentResult> {
  if (resolved.format === 'docx') {
    const { statements, fullText, warnings } = await extractFinancialStatementsFromDocx(resolved.filePath);
    return { statements, warnings, fullText, businessType: classifyBusinessType(fullText), unreliableIncomeStatementCells: new Set() };
  }
  if (resolved.format === 'doc') {
    const { statements, fullText, warnings } = await extractFinancialStatementsFromDoc(resolved.filePath);
    return { statements, warnings, fullText, businessType: classifyBusinessType(fullText), unreliableIncomeStatementCells: new Set() };
  }

  const scopeLabel = `[perf] determineStatementPageScope ${resolved.filePath}`;
  console.time(scopeLabel);
  const scopeMap = await determineStatementPageScope([resolved.filePath]);
  console.timeEnd(scopeLabel);
  const scope = scopeMap.get(resolved.filePath);
  if (scope?.error) throw new Error(scope.error);

  const ocrLabel = `[perf] extractFinancialStatements (Mistral) ${resolved.filePath}`;
  console.time(ocrLabel);
  // Bao cao scan dai (khong co text layer that de tu do diem cat, xem
  // lib/pdf-text.ts) - OCR THEO LO tang dan qua Mistral, vua tim diem cat vua
  // lay noi dung trong CUNG 1 vong (xem lib/export/financial-statements.ts).
  if (scope?.needsOcrProbe) {
    if (!scope.totalPages) throw new Error('Khong xac dinh duoc tong so trang PDF');
    const result = await extractFinancialStatementsWithOcrProbe(resolved.filePath, scope.totalPages);
    console.timeEnd(ocrLabel);
    return { ...result, fullText: null };
  }

  if (!scope?.pageNumbers) {
    throw new Error(scope?.error || 'Khong xac dinh duoc pham vi trang PDF');
  }
  const result = await extractFinancialStatements({ filePath: resolved.filePath, pageNumbers: scope.pageNumbers });
  console.timeEnd(ocrLabel);
  return { ...result, fullText: null };
}
