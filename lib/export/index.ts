import { writeFile } from 'fs/promises';
import { writeReportPdf } from './pdf';
import type { FinancialStatements } from './financial-statements';
import { writeFinancialStatementsExcel } from './excel';

// Trich 3 bang (Buoc 1, cho TAT CA bao cao da tai ve) gio nam o
// lib/report-extract.ts (extractReportContentForResolvedFiles) - re nhanh
// duoc theo dinh dang pdf/docx/doc (xem lib/report-source.ts), thay the ham
// extractStatementsForFiles cu (chi biet PDF) tung o day.
const WRITE_CONCURRENCY = 4;

function withExt(filePath: string, ext: string): string {
  return filePath.replace(/\.(pdf|docx?)$/i, ext);
}

export interface WriteExportsInput {
  filePath: string; // duong dan file PDF goc - dung de suy ra ten file .pdf sach/.xlsx cung thu muc
  statements: FinancialStatements; // da co san tu Buoc 1, khong goi lai AI
  fullText: string; // toan van bao cao KE CA phan Thuyet minh (lib/export/transcribe.ts, qua vision model) - CHI lay cho bao cao da qua loc
  stockCode: string;
  companyName: string;
  title: string;
}

export interface ExportResult {
  cleanPdfPath: string | null;
  excelPath: string | null;
  // Ghi tu chinh "fullText" da co san (khong ton them lan goi AI nao) - chi
  // co voi bao cao da qua bo loc (day la buoc duy nhat chep toan van, xem
  // lib/export/transcribe.ts). null neu ghi that bai.
  textPath: string | null;
  error?: string;
}

// Buoc 2 - CHI chay cho bao cao da qua bo loc noi dung (lib/content-filter.ts):
// ghi .xlsx (3 bang), PDF text sach (3 bang + toan van gom ca Thuyet minh,
// xem lib/export/pdf.ts - thay the .docx cu theo yeu cau user 2026-07-04 vi
// user can highlight/ghi chu/copy so truc tiep tren PDF), va .txt (cung noi
// dung toan van, ghi kem luon vi da co san, khong ton them chi phi) tu ket
// qua da co san o Buoc 1 + transcribeFullDocument - khong goi lai vision
// model o day. Dat ten ".clean.pdf" (khong phai ".pdf") de KHONG de len file
// PDF scan goc cung thu muc.
export async function writeReportExports(inputs: WriteExportsInput[]): Promise<Map<string, ExportResult>> {
  const resultMap = new Map<string, ExportResult>();
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < inputs.length) {
      const index = nextIndex++;
      const input = inputs[index];
      const result: ExportResult = { cleanPdfPath: null, excelPath: null, textPath: null };
      const errors: string[] = [];

      try {
        const excelPath = withExt(input.filePath, '.xlsx');
        await writeFinancialStatementsExcel(input.statements, excelPath);
        result.excelPath = excelPath;
      } catch (error) {
        console.error('export excel error', input.filePath, error);
        errors.push(error instanceof Error ? error.message : String(error));
      }

      try {
        const cleanPdfPath = withExt(input.filePath, '.clean.pdf');
        await writeReportPdf(
          { stockCode: input.stockCode, companyName: input.companyName, title: input.title },
          input.fullText,
          input.statements,
          cleanPdfPath
        );
        result.cleanPdfPath = cleanPdfPath;
      } catch (error) {
        console.error('export pdf error', input.filePath, error);
        errors.push(error instanceof Error ? error.message : String(error));
      }

      try {
        const textPath = withExt(input.filePath, '.txt');
        await writeFile(textPath, input.fullText, 'utf-8');
        result.textPath = textPath;
      } catch (error) {
        console.error('write text error', input.filePath, error);
        errors.push(error instanceof Error ? error.message : String(error));
      }

      if (errors.length > 0) {
        result.error = errors.join('; ');
      }
      resultMap.set(input.filePath, result);
    }
  }

  await Promise.all(Array.from({ length: Math.min(WRITE_CONCURRENCY, inputs.length) }, worker));

  return resultMap;
}
