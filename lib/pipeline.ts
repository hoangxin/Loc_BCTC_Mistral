import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getPreviousQuarter } from './quarter';
import { resolveQuarterTerm, fetchReportFilesForTerm, type ReportTerm, type ReportFile } from './vietstock-reports';
import { periodDisplayLabel, periodFolderSlug } from './period-label';
import { filterReports } from './filter';
import { downloadOne } from './download';
import { resolveReportSourceFiles, cleanupDownloadedFile, type ResolvedReportFile } from './report-source';
import { extractReportContent } from './report-extract';
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

// Nut "Xoa" o tab Ket qua (app/ClearResultsButton.tsx, dispatch qua
// app/api/clear-results, mode=clear) - xoa TOAN BO ket qua da tich luy tu
// truoc den nay (nguoc lai voi runFetchPipeline moi lan chi BO SUNG, khong tu
// xoa - xem comment o duoi), tra ve trang thai rong nhu chua tung chay lan
// nao.
export function clearResults(): FetchStatus {
  const status: FetchStatus = {
    running: false,
    generatedAt: new Date().toISOString(),
    periodLabel: null,
    year: null,
    totalFound: 0,
    totalMatched: 0,
    downloaded: 0,
    failed: [],
    reports: [],
    lastCustomSourceCheck: null,
  };
  writeStatus(status);
  return status;
}

// Khoa nhan dien "cung 1 bao cao" khi cong don ket qua qua nhieu lan "Tai
// BCTC" (xem runFetchPipeline duoi) - ma CK + ky (nam+hau to) + tieu de (da
// phan biet Hop nhat/Rieng le vi title Vietstock luon ghi ro, vd "BCTC Hợp
// nhất quý 2 năm 2026" khac "BCTC Công ty mẹ quý 2 năm 2026").
function reportIdentityKey(report: DownloadedReport): string {
  return `${report.stockCode}::${report.periodYear}-${report.periodSlug}::${report.title}`;
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
  // Tick chon tay tung bao cao (app/FetchControls.tsx, mode 'select') - danh
  // sach ReportFile.fileInfoID. Khi co mat (mang khong rong), UU TIEN CAO
  // NHAT - ghi de hoan toan hoursWindow/reportLimit, CHI tai dung cac bao cao
  // nay (xem scopedReports duoi).
  selectedFileInfoIds?: number[];
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
    if (options.selectedFileInfoIds && options.selectedFileInfoIds.length > 0) {
      const idSet = new Set(options.selectedFileInfoIds);
      scopedReports = allReports.filter((r) => idSet.has(r.fileInfoID));
    } else if (options.hoursWindow) {
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
    mkdirSync(destDir, { recursive: true });

    // Goi dau tai -> giai nen -> OCR theo TUNG bao cao (2026-07-08, thay cho 3
    // giai doan tuan tu theo batch truoc day: tai HET -> giai nen HET -> OCR
    // HET) - moi worker xu ly TRON 1 bao cao qua ca 3 buoc truoc khi lay bao
    // cao tiep theo, thay vi bat bao cao dau tien phai cho bao cao cuoi cung
    // tai xong moi duoc OCR. So worker uu tien cho buoc tai (huong loi nhieu
    // nhat tu concurrency, giong DOWNLOAD_CONCURRENCY cu); buoc OCR ben trong
    // moi worker da tu bi dieu tiet ve 1 request/giay o lib/ai/mistral-ocr.ts
    // (gioi han Mistral free tier, xac nhan tu user 2026-07-08) nen khong lo
    // nhieu worker OCR dong thoi gay 429.
    const PIPELINE_CONCURRENCY = 5;
    // Gan idx theo thu tu trong `matched` de sap xep lai reports/failed o
    // cuoi - cac worker hoan thanh khong theo thu tu (concurrency), nhung UI
    // (STT o app/ReportsSummaryTable.tsx) van muon thu tu on dinh, de doi
    // chieu voi danh muc goc.
    const reportEntries: { idx: number; report: DownloadedReport }[] = [];
    const failedEntries: { idx: number; failed: FailedReport }[] = [];
    let downloadedCount = 0;
    let nextIndex = 0;

    console.time('[perf] downloadResolveExtract');
    async function worker() {
      while (nextIndex < matched.length) {
        const index = nextIndex++;
        const report: ReportFile = matched[index];

        let filePath: string;
        try {
          filePath = await downloadOne(report, destDir);
          downloadedCount++;
        } catch (error) {
          console.error('download error', report.stockCode, report.fileUrl, error);
          failedEntries.push({
            idx: index,
            failed: { stockCode: report.stockCode, title: report.title, error: error instanceof Error ? error.message : String(error) },
          });
          continue;
        }

        // Chuan hoa dinh dang (pdf/docx/doc giu nguyen 1-1; zip/rar giai nen ->
        // co the ra NHIEU file/1 lan tai, VD vua co ban Hop nhat vua Rieng le
        // trong cung 1 zip) - xem lib/report-source.ts.
        const { resolved, errors } = await resolveReportSourceFiles({ report, filePath });
        for (const error of errors) {
          failedEntries.push({ idx: index, failed: { stockCode: report.stockCode, title: report.title, error } });
        }

        // Trich 3 bang cho tung file da chuan hoa - dung lam dau vao cho buoc
        // phan tich % (lib/analysis.ts). KHONG con buoc "chep toan van"/"ghi
        // .xlsx/.clean.pdf" o day nua (xem comment ham runFetchPipeline).
        for (const resolvedFile of resolved) {
          try {
            const content = await extractReportContent(resolvedFile);
            if (content.warnings.length > 0) {
              console.warn('bang so lieu con lech sau khi cau truc hoa', resolvedFile.filePath, content.warnings);
            }
            reportEntries.push({
              idx: index,
              report: {
                source: 'vietstock',
                stockCode: resolvedFile.report.stockCode,
                exchange: resolvedFile.report.exchange,
                companyName: resolvedFile.report.companyName,
                title: resolvedFile.report.title,
                lastUpdate: resolvedFile.report.lastUpdate.toISOString(),
                statementScope: classifyStatementScope(buildStatementScopeInput(resolvedFile, content.fullText ?? undefined)),
                businessType: content.businessType,
                analysis: computeAnalysisRows(content.statements, content.businessType),
                statements: content.statements,
                financeUrl: resolvedFile.report.financeUrl,
                fileUrl: resolvedFile.report.fileUrl,
                filePath: resolvedFile.filePath,
                format: resolvedFile.format,
                entryName: resolvedFile.entryName ?? null,
                periodYear: term.yearPeriod,
                periodSlug,
                warnings: content.warnings,
              },
            });
          } catch (error) {
            console.error('extract report content error', resolvedFile.filePath, error);
            failedEntries.push({
              idx: index,
              failed: {
                stockCode: resolvedFile.report.stockCode,
                title: resolvedFile.report.title,
                error: error instanceof Error ? error.message : String(error),
              },
            });
          }
        }

        // Da OCR xong (thanh cong hay that bai deu vay) - file goc khong con
        // can nua, xoa NGAY (khong doi het batch nhu truoc) de data/reports/
        // khong phinh dan qua giua chung khi chay batch lon.
        await cleanupDownloadedFile(filePath);
      }
    }

    await Promise.all(Array.from({ length: Math.min(PIPELINE_CONCURRENCY, matched.length) }, worker));
    console.timeEnd('[perf] downloadResolveExtract');

    const newReports = reportEntries.sort((a, b) => a.idx - b.idx).map((e) => e.report);
    const newFailed = failedEntries.sort((a, b) => a.idx - b.idx).map((e) => e.failed);

    // BO SUNG vao ket qua da co (khong tu xoa) - yeu cau user 2026-07-08: moi
    // lan bam "Tai BCTC" truoc day GHI DE toan bo status.reports, xoa mat ket
    // qua cac lan chay truoc. Trung "ma CK + ky + tieu de" (vd tai lai DUNG
    // bao cao cua 1 cong ty trong CUNG ky) -> CHI giu 1 ban (ban MOI thay the
    // ban cu, du lieu moi hon), khong tao dong trung lap - theo dung yeu cau
    // user. Xoa het qua nut "Xoa" rieng (xem clearResults o tren), khong tu
    // dong xoa o day.
    const previousStatus = readStatus();
    const newKeys = new Set(newReports.map(reportIdentityKey));
    const keptReports = previousStatus.reports.filter((r) => !newKeys.has(reportIdentityKey(r)));
    const reports = [...keptReports, ...newReports];
    const failed = [...previousStatus.failed, ...newFailed];

    const status: FetchStatus = {
      running: false,
      generatedAt: new Date().toISOString(),
      periodLabel: periodDisplayLabel(term),
      year: term.yearPeriod,
      totalFound: allReports.length,
      totalMatched: matched.length,
      downloaded: downloadedCount,
      failed,
      reports,
      lastCustomSourceCheck: previousStatus.lastCustomSourceCheck,
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
