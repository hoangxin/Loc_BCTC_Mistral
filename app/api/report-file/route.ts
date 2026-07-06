import { createWriteStream } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, extname, join } from 'path';
import axios from 'axios';
import { readStatus } from '@/lib/pipeline';
import { resolveReportSourceFiles } from '@/lib/report-source';
import { extractFullReportFromPdf } from '@/lib/export/full-document';
import { extractFinancialStatementsFromDocx } from '@/lib/export/docx-statements';
import { extractFinancialStatementsFromDoc } from '@/lib/export/doc-statements';
import { writeFinancialStatementsExcel } from '@/lib/export/excel';
import { writeReportPdf } from '@/lib/export/pdf';
import { buildOutputFilename } from '@/lib/export/output-filename';
import type { ReportFile } from '@/lib/vietstock-reports';
import type { FinancialStatements } from '@/lib/export/statement-shared';

export const dynamic = 'force-dynamic';
// Buoc pdf goi Mistral OCR toan van - lau hon 1 request thuong, tang gioi han
// thoi gian chay (chi co hieu luc neu goi Vercel cho phep tang - Hobby mac
// dinh gioi han thap hon, xem README).
export const maxDuration = 60;

const REQUEST_TIMEOUT_MS = 30000;

async function downloadToScratch(fileUrl: string, destDir: string): Promise<string> {
  await mkdir(destDir, { recursive: true });
  const rawName = basename(new URL(fileUrl).pathname) || 'bctc';
  const filePath = join(destDir, `${Date.now()}-${decodeURIComponent(rawName)}`);

  const response = await axios.get(fileUrl, { responseType: 'stream', headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: REQUEST_TIMEOUT_MS });
  await new Promise<void>((resolve, reject) => {
    const writer = createWriteStream(filePath);
    response.data.pipe(writer);
    writer.on('finish', () => resolve());
    writer.on('error', reject);
  });
  return filePath;
}

// Luu 1 ban sao vao dia server (mac dinh, khong can bat/tat) - CHI thuc su
// "vao may nguoi dung" khi server va trinh duyet la CUNG 1 may (npm run dev
// local) - tren Vercel, server o xa, ghi dia server KHONG lam file xuat hien
// tren may nguoi dung (gioi han bao mat trinh duyet, khong phai han che cua
// code) - duong tai that ve may nguoi dung LUON la qua Content-Disposition +
// trinh duyet tu tai (xem cuoi ham GET). EXPORT_SAVE_DIR (tuy chon, .env) cho
// doi thu muc luu cuc bo nay khi chay local - vd tro thang vao 1 thu muc
// ngoai project (D:\Temporary FS) thay vi data/exports/ mac dinh.
async function saveLocalCopy(buffer: Buffer, filename: string): Promise<void> {
  try {
    const dir = process.env.EXPORT_SAVE_DIR || join(process.cwd(), 'data', 'exports');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, filename), buffer);
  } catch (error) {
    console.warn('report-file: khong luu duoc ban sao cuc bo (binh thuong tren Vercel, dia ngoai /tmp la read-only)', error);
  }
}

// Xuat Excel/PDF THEO YEU CAU cho 1 bao cao cu the (nut "Excel"/"PDF" o moi
// hang, app/ReportsSummaryTable.tsx):
// - kind=excel: dung THANG `report.statements` da OCR san luc "Tai BCTC"
//   (lib/pipeline.ts, pham vi truoc "Thuyet minh") - KHONG tai lai file goc,
//   KHONG goi AI gi them, vi Excel khong co toan van nen khong co rui ro
//   "ghep 2 lan OCR" (quyet dinh user 2026-07-06).
// - kind=pdf: PDF can CA bang lan toan van phai ra tu CUNG 1 nguon - tai LAI
//   file goc tu `fileUrl` roi OCR TOAN VAN TU DAU (lib/export/full-document.ts
//   cho pdf; mammoth/word-extractor cho docx/doc, van khong AI) - KHONG dung
//   `report.statements` cu, tranh ghep 2 ket qua doc lap lam 1.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('filePath');
  const kind = searchParams.get('kind');

  if (!filePath || (kind !== 'excel' && kind !== 'pdf')) {
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
    let buffer: Buffer;

    if (kind === 'excel') {
      const scratchDir = join(tmpdir(), 'loc-bctc-export', String(Date.now()));
      await mkdir(scratchDir, { recursive: true });
      const outputPath = join(scratchDir, `${filenameBase}.xlsx`);
      await writeFinancialStatementsExcel(report.statements, outputPath);
      buffer = await readFile(outputPath);
    } else {
      const scratchDir = join(tmpdir(), 'loc-bctc-export', String(Date.now()));
      const rawPath = await downloadToScratch(report.fileUrl, scratchDir);
      const fakeReportFile: ReportFile = {
        fileInfoID: 0,
        stockCode: report.stockCode,
        exchange: report.exchange,
        companyName: report.companyName,
        financeUrl: report.financeUrl,
        fileUrl: report.fileUrl,
        title: report.title,
        fullName: basename(rawPath),
        fileExt: extname(rawPath),
        lastUpdate: new Date(report.lastUpdate),
      };

      const { resolved, errors } = await resolveReportSourceFiles({ report: fakeReportFile, filePath: rawPath });
      const match = report.entryName ? resolved.find((r) => r.entryName === report.entryName) : resolved[0];
      if (!match) {
        throw new Error(errors.join('; ') || 'Không tải lại được file gốc để xuất.');
      }

      let statements: FinancialStatements;
      let fullText: string;
      if (match.format === 'pdf') {
        ({ statements, fullText } = await extractFullReportFromPdf(match.filePath));
      } else if (match.format === 'docx') {
        ({ statements, fullText } = await extractFinancialStatementsFromDocx(match.filePath));
      } else {
        ({ statements, fullText } = await extractFinancialStatementsFromDoc(match.filePath));
      }

      const outputPath = join(scratchDir, `${filenameBase}.pdf`);
      await writeReportPdf({ stockCode: report.stockCode, companyName: report.companyName, title: report.title }, fullText, statements, outputPath);
      buffer = await readFile(outputPath);
    }

    const ext = kind === 'excel' ? '.xlsx' : '.pdf';
    const filename = `${filenameBase}${ext}`;
    await saveLocalCopy(buffer, filename);

    const contentType = kind === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
    return new Response(new Blob([new Uint8Array(buffer)]), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('report-file route error', filePath, error);
    return Response.json({ error: error instanceof Error ? error.message : 'Không xuất được file.' }, { status: 500 });
  }
}
