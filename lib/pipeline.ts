import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getPreviousQuarter } from './quarter';
import { resolveQuarterTerm, fetchReportFilesForTerm, type ReportTerm } from './vietstock-reports';
import { periodDisplayLabel, periodFolderSlug } from './period-label';
import { filterReports } from './filter';
import { downloadReports } from './download';
import { resolveReportSourceFiles, cleanupDownloadedFile, type ResolvedReportFile } from './report-source';
import { extractReportContentForResolvedFiles } from './report-extract';
import { computeAnalysisRows } from './analysis';
import { classifyStatementScope } from './statement-scope';
import type { FetchStatus, DownloadedReport, FailedReport } from './status';

const DATA_DIR = join(process.cwd(), 'data');
const STATUS_PATH = join(DATA_DIR, 'latest-fetch.json');

export function readStatus(): FetchStatus {
  if (!existsSync(STATUS_PATH)) {
    return {
      running: false,
      generatedAt: '',
      periodLabel: null,
      year: null,
      totalFound: 0,
      totalMatched: 0,
      downloaded: 0,
      failed: [],
      reports: [],
      lastCustomSourceCheck: null,
    };
  }
  return JSON.parse(readFileSync(STATUS_PATH, 'utf-8')) as FetchStatus;
}

function writeStatus(status: FetchStatus) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf-8');
}

// Dung cho lib/custom-source.ts - them 1 bao cao tim duoc qua "nguon rieng"
// vao CUNG danh sach voi bao cao Vietstock, khong tao trang thai rieng (giu 1
// nguon du lieu duy nhat cho UI).
export function addCustomReport(report: DownloadedReport): FetchStatus {
  const status = readStatus();
  status.reports = [...status.reports, report];
  status.generatedAt = new Date().toISOString();
  writeStatus(status);
  return status;
}

// Dung cho lib/custom-source.ts - ghi ket qua "tim/khong tim thay" (xem
// FetchStatus.lastCustomSourceCheck) - LUON goi (ke ca found:false) de
// app/CustomSourceForm.tsx (polling) phan biet duoc "chua xong" voi "xong
// nhung khong thay".
export function writeCustomSourceCheck(check: NonNullable<FetchStatus['lastCustomSourceCheck']>): FetchStatus {
  const status = readStatus();
  status.lastCustomSourceCheck = check;
  status.generatedAt = new Date().toISOString();
  writeStatus(status);
  return status;
}

function buildStatementScopeInput(
  resolved: ResolvedReportFile,
  contentText: string | undefined
): { metadataText: string; contentText?: string } {
  const metadataText = [resolved.report.title, resolved.report.fullName, resolved.entryName].filter(Boolean).join(' ');
  return { metadataText, contentText };
}

export interface RunFetchPipelineOptions {
  // Luong MOI (web UI, xem app/FetchControls.tsx): 1 ky da chon TU DANH SACH
  // THAT cua Vietstock (app/api/report-terms, lib/vietstock-reports.ts
  // fetchReportTerms) - co the la Quy 1-4, "6T", "9T", hoac "Nam", KHONG chi
  // Quy nhu truoc (xem lib/period-label.ts).
  term?: ReportTerm;
  // Luong CU (CLI, scripts/run-fetch.ts qua FETCH_QUARTER/FETCH_YEAR) - chi
  // ho tro Quy 1-4, se tu quy doi sang ReportTerm o duoi.
  quarter?: number;
  year?: number;
  // Loc theo thoi gian - lay bao cao co lastUpdate trong vong X gio gan nhat
  // (bao cao quy vua ket thuc tiep tuc trickle-in trong nhieu tuan, xem
  // lib/vietstock-reports.ts). UI (app/FetchControls.tsx) chi cho chon lua
  // chon nay khi ky la Quy "vua qua" (2 ky khac deu da nop du tu lau, "gio gan
  // nhat" khong co y nghia) - nhung pipeline o day KHONG tu gate theo quy,
  // chi ap dung dung tham so nao duoc truyen vao.
  hoursWindow?: number;
  // Loc theo so luong - gioi han lay N bao cao moi cap nhat gan nhat. Luon co
  // the chon (moi ky), rieng Quy "vua qua" UI cho chon giua day va hoursWindow.
  reportLimit?: number;
}

// Dung chung boi ca CLI (scripts/run-fetch.ts) va GitHub Actions
// (.github/workflows/fetch-bctc.yml, dispatch tu app/api/trigger-fetch) - ca
// hai deu chi la caller cua cung 1 pipeline.
//
// Flow (chot 2026-07-06, don gian hoa lai theo dung y dinh goc cua user: OCR
// 3 bang la buoc RE luc "Tai BCTC", OCR TOAN VAN la buoc RIENG, TON KEM hon,
// CHI lam khi user chon xuat 1 bao cao cu the - xem lib/export/full-document.ts,
// app/api/report-file/route.ts): tai TAT CA bao cao trong ky -> chuan hoa
// dinh dang (pdf/docx/doc, giai nen zip/rar neu can - lib/report-source.ts) ->
// trich 3 bang (Mistral OCR pham vi truoc "Thuyet minh" cho pdf, doc truc
// tiep cho docx/doc - lib/report-extract.ts) -> ap tieu chi doc BCTC
// (lib/analysis.ts, hien TODO) -> phan loai Hop nhat/Rieng le/Chung
// (lib/statement-scope.ts) cho TAT CA bao cao trich thanh cong -> ghi
// data/latest-fetch.json (CHI file nay, KHONG con ghi .xlsx/.clean.pdf o day
// nua - buoc do dua sang luc user bam "Xuat", tai lai file goc tu fileUrl).
export async function runFetchPipeline(options: RunFetchPipelineOptions = {}): Promise<FetchStatus> {
  const term: ReportTerm =
    options.term ??
    (await (async () => {
      const { quarter, year } = options.quarter && options.year ? { quarter: options.quarter, year: options.year } : getPreviousQuarter();
      const resolved = await resolveQuarterTerm(quarter, year);
      if (!resolved) throw new Error(`vietstock: khong tim thay ky bao cao "Quý ${quarter}" nam ${year}`);
      return resolved;
    })());

  writeStatus({ ...readStatus(), running: true, error: undefined });

  try {
    console.time('[perf] fetchReportFilesForTerm');
    const allReports = await fetchReportFilesForTerm(term);
    console.timeEnd('[perf] fetchReportFilesForTerm');

    // Loc theo dung tham so caller truyen (xem comment RunFetchPipelineOptions
    // o tren) - KHONG tu gate theo loai ky o day, UI (app/FetchControls.tsx)
    // da quyet dinh lua chon nao duoc phep hien cho tung loai ky.
    let scopedReports = allReports;
    if (options.hoursWindow) {
      const cutoff = Date.now() - options.hoursWindow * 60 * 60 * 1000;
      scopedReports = allReports.filter((r) => r.lastUpdate.getTime() >= cutoff);
    } else if (options.reportLimit) {
      scopedReports = [...allReports]
        .sort((a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime())
        .slice(0, options.reportLimit);
    }

    // Loc so bo theo metadata (ma CP, ten cong ty, tieu de...) TRUOC khi tai -
    // rieng, khong lien quan toi tieu chi loc theo noi dung so lieu. Hien dang
    // pass-through vi tieu chi metadata chua duoc chot.
    const matched = filterReports(scopedReports);

    const periodSlug = periodFolderSlug(term);
    const destDir = join(DATA_DIR, 'reports', `${term.yearPeriod}-${periodSlug}`);
    console.time('[perf] downloadReports');
    const downloadResults = await downloadReports(matched, destDir);
    console.timeEnd('[perf] downloadReports');
    const downloadSucceeded = downloadResults.filter((r) => r.filePath);
    const downloadFailed: FailedReport[] = downloadResults
      .filter((r) => !r.filePath)
      .map((r) => ({ stockCode: r.report.stockCode, title: r.report.title, error: r.error }));

    // Chuan hoa dinh dang (pdf/docx/doc giu nguyen 1-1; zip/rar giai nen ->
    // co the ra NHIEU file/1 lan tai, VD vua co ban Hop nhat vua Rieng le
    // trong cung 1 zip) - xem lib/report-source.ts.
    console.time('[perf] resolveReportSourceFiles');
    const resolvedGroups = await Promise.all(downloadSucceeded.map((r) => resolveReportSourceFiles(r)));
    console.timeEnd('[perf] resolveReportSourceFiles');
    const resolvedFiles: ResolvedReportFile[] = resolvedGroups.flatMap((g) => g.resolved);
    const resolveErrors: FailedReport[] = resolvedGroups.flatMap((g, i) =>
      g.errors.map((error) => ({ stockCode: downloadSucceeded[i].report.stockCode, title: downloadSucceeded[i].report.title, error }))
    );

    // Trich 3 bang cho TAT CA file da chuan hoa - dung lam dau vao cho buoc
    // phan tich % (lib/analysis.ts). KHONG con buoc "chep toan van"/"ghi
    // .xlsx/.clean.pdf" o day nua (xem comment ham o tren).
    console.time('[perf] extractReportContentForResolvedFiles');
    const contentResults = await extractReportContentForResolvedFiles(resolvedFiles);
    console.timeEnd('[perf] extractReportContentForResolvedFiles');

    // Da OCR xong (thanh cong hay that bai deu vay) - file goc khong con can
    // nua, xoa ngay de data/reports/ khong phinh dan qua moi lan chay local
    // (xem lib/report-source.ts cleanupDownloadedFile).
    await Promise.all(downloadSucceeded.map((r) => (r.filePath ? cleanupDownloadedFile(r.filePath) : Promise.resolve())));

    const contentErrors: FailedReport[] = resolvedFiles
      .map((resolved): FailedReport | null => {
        const entry = contentResults.get(resolved.filePath);
        return entry && !entry.content
          ? { stockCode: resolved.report.stockCode, title: resolved.report.title, error: entry.error }
          : null;
      })
      .filter((f): f is FailedReport => f !== null);

    const reports: DownloadedReport[] = resolvedFiles
      .map((resolved): DownloadedReport | null => {
        const content = contentResults.get(resolved.filePath)?.content;
        if (!content) return null; // that bai trich 3 bang - da nam trong contentErrors, khong hien trong bang

        return {
          source: 'vietstock',
          stockCode: resolved.report.stockCode,
          exchange: resolved.report.exchange,
          companyName: resolved.report.companyName,
          title: resolved.report.title,
          lastUpdate: resolved.report.lastUpdate.toISOString(),
          statementScope: classifyStatementScope(buildStatementScopeInput(resolved, content.fullText ?? undefined)),
          businessType: content.businessType,
          analysis: computeAnalysisRows(content.statements),
          statements: content.statements,
          financeUrl: resolved.report.financeUrl,
          fileUrl: resolved.report.fileUrl,
          filePath: resolved.filePath,
          format: resolved.format,
          entryName: resolved.entryName ?? null,
          periodYear: term.yearPeriod,
          periodSlug,
          warnings: content.warnings,
        };
      })
      .filter((r): r is DownloadedReport => r !== null);

    const status: FetchStatus = {
      running: false,
      generatedAt: new Date().toISOString(),
      periodLabel: periodDisplayLabel(term),
      year: term.yearPeriod,
      totalFound: allReports.length,
      totalMatched: matched.length,
      downloaded: downloadSucceeded.length,
      failed: [...downloadFailed, ...resolveErrors, ...contentErrors],
      reports,
      lastCustomSourceCheck: readStatus().lastCustomSourceCheck,
    };

    writeStatus(status);
    return status;
  } catch (error) {
    const status: FetchStatus = {
      ...readStatus(),
      running: false,
      error: error instanceof Error ? error.message : String(error),
    };
    writeStatus(status);
    throw error;
  }
}
