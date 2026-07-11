import { determineStatementPageScope, looksLikeVietnameseText } from './pdf-text';
import { extractFinancialStatements, extractFinancialStatementsWithOcrProbe, NonVietnameseContentError } from './export/financial-statements';
import { extractFinancialStatementsFromDocx } from './export/docx-statements';
import { extractFinancialStatementsFromDoc } from './export/doc-statements';
import { classifyBusinessType, type BusinessType } from './business-type';
import type { FinancialStatements, UnreliableCells } from './export/statement-shared';
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
  unreliableCells: UnreliableCells;
}

const NO_UNRELIABLE_CELLS: UnreliableCells = { balanceSheet: new Set(), incomeStatement: new Set() };

// Tra ve null nghia la file nay BI LOAI (khong phai loi) - hien CHI dung cho
// truong hop phat hien noi dung khong phai tieng Viet (ban dich tieng Anh
// Vietstock kem san trong CUNG 1 zip, xem lib/report-source.ts
// isEnglishVariantEntry - loc theo TEN FILE that bai voi file KHONG co dau
// hieu ngon ngu trong ten, da gap that HCM Q1/2026 2026-07-12). Caller
// (lib/pipeline.ts/lib/custom-source.ts) phai tu kiem tra null va BO QUA file
// nay (khong dua vao ket qua, khong tinh la loi).
export async function extractReportContent(resolved: ResolvedReportFile): Promise<ReportContentResult | null> {
  if (resolved.format === 'docx') {
    const { statements, fullText, warnings } = await extractFinancialStatementsFromDocx(resolved.filePath);
    if (!looksLikeVietnameseText(fullText)) return null;
    return { statements, warnings, fullText, businessType: classifyBusinessType(fullText), unreliableCells: NO_UNRELIABLE_CELLS };
  }
  if (resolved.format === 'doc') {
    const { statements, fullText, warnings } = await extractFinancialStatementsFromDoc(resolved.filePath);
    if (!looksLikeVietnameseText(fullText)) return null;
    return { statements, warnings, fullText, businessType: classifyBusinessType(fullText), unreliableCells: NO_UNRELIABLE_CELLS };
  }

  const scopeLabel = `[perf] determineStatementPageScope ${resolved.filePath}`;
  console.time(scopeLabel);
  const scopeMap = await determineStatementPageScope([resolved.filePath]);
  console.timeEnd(scopeLabel);
  const scope = scopeMap.get(resolved.filePath);
  if (scope?.error) throw new Error(scope.error);
  // Text layer THAT da xac nhan khong phai tieng Viet - loai NGAY, khong ton
  // 1 lan goi OCR nao ca (mien phi, xem lib/pdf-text.ts).
  if (scope?.isLikelyNonVietnamese) return null;

  const ocrLabel = `[perf] extractFinancialStatements (Mistral) ${resolved.filePath}`;
  console.time(ocrLabel);
  try {
    // Bao cao scan dai (khong co text layer that de tu do diem cat, xem
    // lib/pdf-text.ts) - OCR THEO LO tang dan qua Mistral, vua tim diem cat
    // vua lay noi dung trong CUNG 1 vong (xem lib/export/financial-statements.ts).
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
  } catch (error) {
    // Chi bao cao scan dai (needsOcrProbe) moi co the nem loi nay - nhanh co
    // text layer that da bi chan tu truoc (isLikelyNonVietnamese o tren),
    // khong bao gio toi day.
    if (error instanceof NonVietnameseContentError) {
      console.timeEnd(ocrLabel);
      return null;
    }
    throw error;
  }
}
