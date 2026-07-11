import { mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { readStatus } from '@/lib/pipeline';
import { writeFinancialStatementsExcel } from '@/lib/export/excel';
import { buildOutputFilename } from '@/lib/export/output-filename';

export const dynamic = 'force-dynamic';

// Xuat Excel THEO YEU CAU cho 1 bao cao cu the (nut "Excel" o moi hang,
// app/ReportsSummaryTable.tsx) - dung THANG `report.statements` da OCR san
// luc "Tai BCTC" (lib/pipeline.ts, pham vi truoc "Thuyet minh") - KHONG tai
// lai file goc, KHONG goi AI gi them.
//
// Nut "PDF" KHONG con goi route nay nua (yeu cau user 2026-07-07) - gio mo
// THANG file goc tren Vietstock o tab moi (xem buildOriginalFileUrl,
// app/ReportsSummaryTable.tsx), khong can OCR toan van + dung PDF moi nua.
// Toan bo logic cu (tai lai file goc, OCR toan van qua Mistral, ghep PDF that
// bang pdf-lib) van GIU LAI o duoi dang comment - PHONG KHI can dung lai
// huong "xuat PDF rieng cua app" (vd neu can PDF co dinh dang thong nhat,
// khong phu thuoc dinh dang file goc tren Vietstock):
//
// import { createWriteStream } from 'fs';
// import { writeFile } from 'fs/promises';
// import { basename, extname } from 'path';
// import axios from 'axios';
// import { resolveReportSourceFiles } from '@/lib/report-source';
// import { extractFullReportFromPdf } from '@/lib/export/full-document';
// import { extractFinancialStatementsFromDocx } from '@/lib/export/docx-statements';
// import { extractFinancialStatementsFromDoc } from '@/lib/export/doc-statements';
// import { writeReportPdf } from '@/lib/export/pdf';
// import type { ReportFile } from '@/lib/vietstock-reports';
// import type { FinancialStatements } from '@/lib/export/statement-shared';
//
// const REQUEST_TIMEOUT_MS = 30000;
//
// async function downloadToScratch(fileUrl: string, destDir: string): Promise<string> {
//   await mkdir(destDir, { recursive: true });
//   const rawName = basename(new URL(fileUrl).pathname) || 'bctc';
//   const filePath = join(destDir, `${Date.now()}-${decodeURIComponent(rawName)}`);
//
//   const response = await axios.get(fileUrl, { responseType: 'stream', headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: REQUEST_TIMEOUT_MS });
//   await new Promise<void>((resolve, reject) => {
//     const writer = createWriteStream(filePath);
//     response.data.pipe(writer);
//     writer.on('finish', () => resolve());
//     writer.on('error', reject);
//   });
//   return filePath;
// }
//
// // kind=pdf: PDF can CA bang lan toan van phai ra tu CUNG 1 nguon - tai LAI
// // file goc tu `fileUrl` roi OCR TOAN VAN TU DAU (lib/export/full-document.ts
// // cho pdf; mammoth/word-extractor cho docx/doc, van khong AI) - KHONG dung
// // `report.statements` cu, tranh ghep 2 ket qua doc lap lam 1.
// // (trong nhanh kind==='pdf' cua ham GET duoi):
// //   const scratchDir = join(tmpdir(), 'loc-bctc-export', String(Date.now()));
// //   const rawPath = await downloadToScratch(report.fileUrl, scratchDir);
// //   const fakeReportFile: ReportFile = {
// //     fileInfoID: 0,
// //     stockCode: report.stockCode,
// //     exchange: report.exchange,
// //     companyName: report.companyName,
// //     financeUrl: report.financeUrl,
// //     fileUrl: report.fileUrl,
// //     title: report.title,
// //     fullName: basename(rawPath),
// //     fileExt: extname(rawPath),
// //     lastUpdate: new Date(report.lastUpdate),
// //   };
// //   const { resolved, errors } = await resolveReportSourceFiles({ report: fakeReportFile, filePath: rawPath });
// //   const match = report.entryName ? resolved.find((r) => r.entryName === report.entryName) : resolved[0];
// //   if (!match) throw new Error(errors.join('; ') || 'Không tải lại được file gốc để xuất.');
// //   let statements: FinancialStatements;
// //   let fullText: string;
// //   if (match.format === 'pdf') {
// //     ({ statements, fullText } = await extractFullReportFromPdf(match.filePath));
// //   } else if (match.format === 'docx') {
// //     ({ statements, fullText } = await extractFinancialStatementsFromDocx(match.filePath));
// //   } else {
// //     ({ statements, fullText } = await extractFinancialStatementsFromDoc(match.filePath));
// //   }
// //   const outputPath = join(scratchDir, `${filenameBase}.pdf`);
// //   await writeReportPdf({ stockCode: report.stockCode, companyName: report.companyName, title: report.title }, fullText, statements, outputPath);
// //   buffer = await readFile(outputPath);
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('filePath');
  const kind = searchParams.get('kind');

  if (!filePath || kind !== 'excel') {
    return Response.json({ error: 'Thiếu filePath hoặc kind không hợp lệ.' }, { status: 400 });
  }

  const status = readStatus();
  const report = status.reports.find((r) => r.filePath === filePath);
  if (!report) {
    return Response.json({ error: 'Không tìm thấy báo cáo.' }, { status: 404 });
  }

  const filenameBase = buildOutputFilename({
    stockCode: report.stockCode,
    periodYear: report.periodYear,
    periodSlug: report.periodSlug,
    statementScope: report.statementScope,
  });

  try {
    const scratchDir = join(tmpdir(), 'loc-bctc-export', String(Date.now()));
    await mkdir(scratchDir, { recursive: true });
    const outputPath = join(scratchDir, `${filenameBase}.xlsx`);
    await writeFinancialStatementsExcel(report.statements, outputPath, report.businessType);
    const buffer = await readFile(outputPath);

    const filename = `${filenameBase}.xlsx`;
    // Luu 1 ban sao vao dia server (chi thuc su "vao may nguoi dung" khi chay
    // local, npm run dev - tren Vercel day chi la /tmp, mat ngay, xem
    // EXPORT_SAVE_DIR trong README) - best-effort, khong chan response neu loi.
    try {
      const saveDir = process.env.EXPORT_SAVE_DIR || join(process.cwd(), 'data', 'exports');
      await mkdir(saveDir, { recursive: true });
      await writeFile(join(saveDir, filename), buffer);
    } catch (error) {
      console.warn('report-file: khong luu duoc ban sao cuc bo (binh thuong tren Vercel, dia ngoai /tmp la read-only)', error);
    }

    return new Response(new Blob([new Uint8Array(buffer)]), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('report-file route error', filePath, error);
    return Response.json({ error: error instanceof Error ? error.message : 'Không xuất được file.' }, { status: 500 });
  }
}
