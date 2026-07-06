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
// Buoc nay goi Mistral OCR toan van (kind=pdf) - lau hon 1 request thuong,
// tang gioi han thoi gian chay (chi co hieu luc neu goi Vercel cho phep tang -
// Hobby mac dinh gioi han thap hon, xem README).
export const maxDuration = 60;

const REQUEST_TIMEOUT_MS = 30000;

// Xuat Excel/PDF THEO YEU CAU cho 1 bao cao cu the (nut "Excel"/"PDF" o moi
// hang, app/ReportsSummaryTable.tsx) - KHAC hoan toan cach cu (doc file da
// xuat san tren dia): gio TAI LAI file goc tu `report.fileUrl` (Vietstock/
// nguon rieng deu host lau dai) roi OCR TOAN VAN TU DAU (lib/export/full-
// document.ts cho pdf; mammoth/word-extractor cho docx/doc - deu KHONG dung
// lai `analysis`/3 bang da tinh luc "Tai BCTC", theo dung yeu cau user
// 2026-07-06: khong ghep 2 lan OCR doc lap lam 1).
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

  try {
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

    const filename = buildOutputFilename({
      stockCode: report.stockCode,
      periodYear: report.periodYear,
      periodSlug: report.periodSlug,
      statementScope: report.statementScope,
    });
    const ext = kind === 'excel' ? '.xlsx' : '.pdf';
    const outputPath = join(scratchDir, `${filename}${ext}`);

    if (kind === 'excel') {
      await writeFinancialStatementsExcel(statements, outputPath);
    } else {
      await writeReportPdf({ stockCode: report.stockCode, companyName: report.companyName, title: report.title }, fullText, statements, outputPath);
    }

    const buffer = await readFile(outputPath);

    // Luu ban sao cuc bo THEO YEU CAU user (mac dinh, khong can bat/tat) - vao
    // data/exports/ trong project, dung khi chay `npm run dev` local (file
    // nam lai, xem duoc tren may). Tren Vercel serverless, o dia ngoai /tmp la
    // READ-ONLY nen buoc nay se loi - KHONG de loi nay lam hong ca response
    // (nguoi dung van tai duoc file qua trinh duyet, chi la khong co ban sao
    // luu tren server nua - dung ca 2 truong hop deu OK).
    try {
      const exportsDir = join(process.cwd(), 'data', 'exports');
      await mkdir(exportsDir, { recursive: true });
      await writeFile(join(exportsDir, `${filename}${ext}`), buffer);
    } catch (error) {
      console.warn('report-file: khong luu duoc ban sao cuc bo (binh thuong tren Vercel, dia ngoai /tmp la read-only)', error);
    }

    const contentType = kind === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
    return new Response(new Blob([new Uint8Array(buffer)]), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}${ext}"`,
      },
    });
  } catch (error) {
    console.error('report-file route error', filePath, error);
    return Response.json({ error: error instanceof Error ? error.message : 'Không xuất được file.' }, { status: 500 });
  }
}
