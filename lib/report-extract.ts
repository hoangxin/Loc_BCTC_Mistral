import { determineStatementPageScope } from './pdf-text';
import { extractFinancialStatements } from './export/financial-statements';
import { extractFinancialStatementsFromDocx } from './export/docx-statements';
import { extractFinancialStatementsFromDoc } from './export/doc-statements';
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
}

export async function extractReportContent(resolved: ResolvedReportFile): Promise<ReportContentResult> {
  if (resolved.format === 'docx') {
    const { statements, fullText, warnings } = await extractFinancialStatementsFromDocx(resolved.filePath);
    return { statements, warnings, fullText };
  }
  if (resolved.format === 'doc') {
    const { statements, fullText, warnings } = await extractFinancialStatementsFromDoc(resolved.filePath);
    return { statements, warnings, fullText };
  }

  const scopeMap = await determineStatementPageScope([resolved.filePath]);
  const scope = scopeMap.get(resolved.filePath);
  if (!scope?.pageNumbers) {
    throw new Error(scope?.error || 'Khong xac dinh duoc pham vi trang PDF');
  }
  const { statements, warnings } = await extractFinancialStatements({ filePath: resolved.filePath, pageNumbers: scope.pageNumbers });
  return { statements, warnings, fullText: null };
}

export interface ReportContentBatchEntry {
  content: ReportContentResult | null;
  error?: string;
}

// Cung phong cach gioi han so luong goi song song nhu STATEMENTS_CONCURRENCY
// cu (lib/export/index.ts, da thay the boi ham nay) - it hon buoc download vi
// pdf goi Mistral OCR (docx/doc thi khong goi AI nhung van gop chung 1 gioi
// han cho don gian, khong dang tach rieng vi so luong docx/doc thuc te it).
const EXTRACT_CONCURRENCY = 2;

export async function extractReportContentForResolvedFiles(
  resolvedFiles: ResolvedReportFile[]
): Promise<Map<string, ReportContentBatchEntry>> {
  const resultMap = new Map<string, ReportContentBatchEntry>();
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < resolvedFiles.length) {
      const index = nextIndex++;
      const resolved = resolvedFiles[index];
      try {
        const content = await extractReportContent(resolved);
        if (content.warnings.length > 0) {
          console.warn('bang so lieu con lech sau khi cau truc hoa', resolved.filePath, content.warnings);
        }
        resultMap.set(resolved.filePath, { content });
      } catch (error) {
        console.error('extract report content error', resolved.filePath, error);
        resultMap.set(resolved.filePath, { content: null, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(EXTRACT_CONCURRENCY, resolvedFiles.length) }, worker));
  return resultMap;
}
