import { writeFileSync, renameSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getPreviousQuarter } from './quarter';
import { resolveQuarterTerm, fetchReportFilesForTerm, type ReportTerm, type ReportFile } from './vietstock-reports';
import { periodDisplayLabel, periodFolderSlug } from './period-label';
import { filterReports } from './filter';
import { downloadOne } from './download';
import { resolveReportSourceFiles, cleanupDownloadedFile, type ResolvedReportFile } from './report-source';
import { extractReportContent, type ReportContentResult } from './report-extract';
import { isEmptyParse } from './export/financial-statements';
import { computeAnalysisRows } from './analysis';
import { classifyStatementScope } from './statement-scope';
import { saveProductionOcrMarkdown } from './ocr-markdown-store';
import type { FetchStatus, DownloadedReport, FailedReport } from './status';
import { reportIdentityKey } from './report-identity';

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
      interruptedReports: [],
      reports: [],
      lastCustomSourceCheck: null,
    };
  }
  const parsed = JSON.parse(readFileSync(STATUS_PATH, 'utf-8')) as Partial<FetchStatus>;
  // SUA 2026-07-20: backfill field them SAU nay (interruptedReports) khi doc
  // 1 file data/latest-fetch.json cu da ghi TRUOC khi field nay ton tai -
  // tranh phai sua tay file data (rui ro xung dot rebase voi 1 job dang chay
  // dong thoi tren GitHub Actions, xem lib/status.ts InterruptedReport).
  return { interruptedReports: [], ...parsed } as FetchStatus;
}

// SUA 2026-07-20 (yeu cau nguoi dung, sau su co Mistral nghen hang doi lam
// batch chay ~30 phut nhung ket qua CHI ghi 1 LAN DUY NHAT o cuoi
// runFetchPipeline): ghi qua file tam roi rename - rename cung thu muc la
// atomic (POSIX lan NTFS), tranh JSON bi ghi do neu process bi kill dung luc
// dang writeFileSync (vd GitHub Actions huy job giua chung khi cham
// timeout-minutes).
function writeStatus(status: FetchStatus) {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmpPath = `${STATUS_PATH}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(status, null, 2), 'utf-8');
  renameSync(tmpPath, STATUS_PATH);
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
// app/api/clear-results, mode=clear) - xoa ket qua da tich luy tu truoc den
// nay (nguoc lai voi runFetchPipeline moi lan chi BO SUNG, khong tu xoa - xem
// comment o duoi).
//
// SUA 2026-07-17 (yeu cau nguoi dung - moi tab "Ket qua {ky}" can nut "Xoa
// ket qua" rieng, co the xoa CHI vai bao cao da tick thay vi luon xoa het):
// them tham so filePaths TUY CHON. Khong truyen (hoac mang rong) = giu nguyen
// hanh vi cu (xoa TOAN BO, ve trang thai rong nhu chua tung chay lan nao).
// Co truyen = CHI loai cac report co filePath khop khoi status.reports, giu
// nguyen totalFound/totalMatched/downloaded/failed (cac so nay mo ta 1 LAN
// CHAY cu the trong qua khu, khong phai dem song theo reports.length hien
// tai - xoa vai report cu KHONG lam sai lech y nghia cua chung).
export function clearResults(filePaths?: string[]): FetchStatus {
  if (!filePaths || filePaths.length === 0) {
    const status: FetchStatus = {
      running: false,
      generatedAt: new Date().toISOString(),
      periodLabel: null,
      year: null,
      totalFound: 0,
      totalMatched: 0,
      downloaded: 0,
      failed: [],
      interruptedReports: [],
      reports: [],
      lastCustomSourceCheck: null,
    };
    writeStatus(status);
    return status;
  }

  const toRemove = new Set(filePaths);
  const status = readStatus();
  status.reports = status.reports.filter((report) => !toRemove.has(report.filePath));
  status.generatedAt = new Date().toISOString();
  writeStatus(status);
  return status;
}

// Khoa nhan dien "cung 1 bao cao" khi cong don ket qua qua nhieu lan "Tai
// BCTC" (xem runFetchPipeline duoi) - ma CK + ky (nam+hau to) + tieu de (da
// phan biet Hop nhat/Rieng le vi title Vietstock luon ghi ro, vd "BCTC Hợp
// nhất quý 2 năm 2026" khac "BCTC Công ty mẹ quý 2 năm 2026"). Dinh nghia
// dung chung o lib/report-identity.ts (khong co import Node-only) de
// app/FetchControls.tsx (client) tinh truoc cung 1 khoa nay khi tu tick sẵn
// cac bao cao con thieu luc bam "Tu lan tai cuoi".

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
  // "Tu lan tai cuoi" (app/FetchControls.tsx) - CHI tai bu nhung bao cao CHUA
  // co san trong ket qua da tich luy cua CHINH ky nay (so khop qua
  // reportIdentityKey), BAT KE bao cao do xuat hien tren Vietstock truoc hay
  // sau lan tai gan nhat.
  //
  // SUA 2026-07-20 (yeu cau nguoi dung, thay the hoan toan ban cu loc theo
  // THOI GIAN "lastUpdate >= X gio truoc"): ban cu bo sot dung truong hop
  // nguoi dung mo ta - 1 bao cao (B/C) da xuat hien tren Vietstock TRUOC lan
  // tai gan nhat (lastUpdate < moc gio) nhung CHUA tung tai duoc (vd bi
  // timeout Mistral giua chung o 1 lan chay truoc, hoac lan do chi chon tay
  // vai bao cao thay vi tai het) - ban cu se KHONG BAO GIO tai lai duoc B/C vi
  // lastUpdate cua chung da qua cu so voi moc gio, du chung van con thieu that
  // su. Loc theo SU HIEN DIEN (co/chua co trong reports) thay vi THOI GIAN
  // giai quyet dung goc van de nay - xem scopedReports duoi.
  onlyMissing?: boolean;
  // Loc theo so luong - gioi han lay N bao cao moi cap nhat gan nhat. Luon co
  // the chon (moi ky), rieng Quy "vua qua" UI cho chon giua day va onlyMissing.
  reportLimit?: number;
  // Tick chon tay tung bao cao (app/FetchControls.tsx, mode 'select') - danh
  // sach ReportFile.fileInfoID. Khi co mat (mang khong rong), UU TIEN CAO
  // NHAT - ghi de hoan toan onlyMissing/reportLimit, CHI tai dung cac bao cao
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

    // Doc TRUOC khi loc scopedReports (can cho nhanh onlyMissing duoi day) va
    // dung lam nen cho MOI lan flushProgress o cuoi ham, xem comment tai do.
    const previousStatus = readStatus();
    const periodSlug = periodFolderSlug(term);

    // Loc theo dung tham so caller truyen (xem comment RunFetchPipelineOptions
    // o tren) - KHONG tu gate theo loai ky o day, UI (app/FetchControls.tsx)
    // da quyet dinh lua chon nao duoc phep hien cho tung loai ky.
    let scopedReports = allReports;
    if (options.selectedFileInfoIds && options.selectedFileInfoIds.length > 0) {
      const idSet = new Set(options.selectedFileInfoIds);
      scopedReports = allReports.filter((r) => idSet.has(r.fileInfoID));
    } else if (options.onlyMissing) {
      const existingKeys = new Set(
        previousStatus.reports
          .filter((r) => r.periodYear === term.yearPeriod && r.periodSlug === periodSlug)
          .map(reportIdentityKey)
      );
      scopedReports = allReports.filter((r) => !existingKeys.has(`${r.stockCode}::${term.yearPeriod}-${periodSlug}::${r.title}`));
    } else if (options.reportLimit) {
      scopedReports = [...allReports]
        .sort((a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime())
        .slice(0, options.reportLimit);
    }

    // Loc so bo theo metadata (san GD, "Rieng le"/Cong ty me trong title/fullName...)
    // TRUOC khi tai - xem lib/filter.ts. Rieng, khong lien quan toi tieu chi
    // loc theo noi dung so lieu.
    const matched = filterReports(scopedReports);

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

    // Danh dau 1 index trong `matched` la DA XU LY XONG (du ket qua la them
    // vao reportEntries, failedEntries, hay bo qua co chu dich - vd file
    // khong phai tieng Viet) - xem InterruptedReport (lib/status.ts). Khac voi
    // downloadedCount (chi bao "da TAI file", chua chac da OCR xong), tap hop
    // nay chi nhan 1 index SAU KHI ca vong lap worker cho index do chay xong
    // toan bo (qua het buoc tai + giai nen + trich + cleanup). Neu tien trinh
    // bi GitHub Actions giet giua chung (cham timeout-minutes), cac index CHUA
    // kip vao day se lo ra qua buildStatus() duoi - phat hien dung bao cao nao
    // bi bo do, thay vi im lang bien mat (xem downloaded).
    const processedIndices = new Set<number>();

    // Dung chung boi flushProgress (sau MOI bao cao) va khoi ket thuc ham (sau
    // Promise.all) - CHI khac o `running`. BO SUNG vao previousStatus.reports/
    // failed giong het logic cu (khong tao dong trung lap - xem
    // reportIdentityKey), chi khac la duoc goi NHIEU LAN thay vi 1 lan duy
    // nhat o cuoi.
    function buildStatus(running: boolean): FetchStatus {
      const newReports = reportEntries.sort((a, b) => a.idx - b.idx).map((e) => e.report);
      const newFailed = failedEntries.sort((a, b) => a.idx - b.idx).map((e) => e.failed);
      const newKeys = new Set(newReports.map(reportIdentityKey));
      const keptReports = previousStatus.reports.filter((r) => !newKeys.has(reportIdentityKey(r)));
      const interruptedReports = matched
        .filter((_, idx) => !processedIndices.has(idx))
        .map((report) => ({ stockCode: report.stockCode, title: report.title }));
      return {
        running,
        generatedAt: new Date().toISOString(),
        periodLabel: periodDisplayLabel(term),
        year: term.yearPeriod,
        totalFound: allReports.length,
        totalMatched: matched.length,
        downloaded: downloadedCount,
        failed: [...previousStatus.failed, ...newFailed],
        interruptedReports,
        reports: [...keptReports, ...newReports],
        lastCustomSourceCheck: previousStatus.lastCustomSourceCheck,
      };
    }

    // SUA 2026-07-20 (yeu cau nguoi dung, sau su co Mistral nghen hang doi
    // lam ca batch chay ~30 phut ma KET QUA CHI duoc ghi 1 LAN DUY NHAT sau
    // Promise.all - neu job bi GitHub Actions huy giua chung vi cham
    // timeout-minutes, MAT SACH ca cac bao cao da OCR xong tu truoc): ghi
    // data/latest-fetch.json ra dia NGAY sau moi bao cao (thanh cong hay that
    // bai deu flush), khong doi het toan bo Promise.all. Neu process bi kill
    // giua chung, file tren dia van la ban gan nhat co the, khong phai rong.
    // Day chi la NUA sau cua fix - nua con lai la workflow (.github/workflows/
    // fetch-bctc.yml) phai co `if: always()` o buoc commit de buoc do VAN
    // chay ke ca khi job bi huy vi timeout (mac dinh GitHub SKIP cac buoc sau
    // buoc bi huy, xem comment tai workflow).
    function flushProgress() {
      writeStatus(buildStatus(true));
    }

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
          processedIndices.add(index);
          flushProgress();
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
        //
        // SUA 2026-07-15 (theo yeu cau nguoi dung: "lọc trước khi chuyển cho
        // OCR", KHONG duoc OCR het roi moi loc - ton tien that): xu ly TUAN
        // TU tung file trong `resolved`, DUNG NGAY khi gap 1 file cho ra du
        // lieu THAT (Vietnamese + >=1 dong o it nhat 1 trong 3 bang) - KHONG
        // OCR tiep cac file con lai trong nhom nay nua. Van ban phu (cong
        // van/giai trinh...) da bi loai TRUOC KHI toi day qua SO TRANG (lib/
        // report-source.ts dropShortAncillaryPdfs, mien phi, khong OCR) trong
        // da so truong hop - vong lap tuan tu o day CHI la luoi an toan cho
        // truong hop hiem van ban phu dai bat thuong lot qua loc so trang,
        // hoac ban dich tieng Anh co ten file khong khop isEnglishVariantEntry
        // (vd CTS "m88_...financial_statements...", cung kich thuoc voi ban
        // that nen khong bi loc boi so trang) - resolved.length van > 1 trong
        // 2 truong hop nay. Neu file DAU TIEN da tot, cac file sau KHONG BAO
        // GIO duoc goi OCR (khong ton tien); chi thu file tiep theo neu file
        // truoc do that bai (null = sai ngon ngu, phat hien MIEN PHI/re qua
        // text layer hoac dung sau 12 trang dau - xem NonVietnameseContentError -
        // hoac rong hoan toan).
        const extracted: { resolvedFile: ResolvedReportFile; content: ReportContentResult }[] = [];
        let foundUsable = false;
        for (const resolvedFile of resolved) {
          if (foundUsable) break; // da co du lieu THAT tu 1 file truoc do trong nhom nay - KHONG OCR them file nao nua
          try {
            const content = await extractReportContent(resolvedFile);
            // null = file bi loai co chu dich (vd ban dich tieng Anh cua
            // CHINH bao cao nay, xem lib/report-extract.ts) - khong phai loi,
            // bo qua im lang, khong day vao reportEntries lan failedEntries.
            if (!content) {
              console.log('bo qua file khong phai tieng Viet', resolvedFile.filePath);
              continue;
            }
            extracted.push({ resolvedFile, content });
            if (!isEmptyParse(content.statements)) foundUsable = true;
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

        // Neu da tim duoc du lieu THAT, chi giu (cac) file do - loai am tham
        // (khong can bao "xem tay") (cac) file rong da lo OCR TRUOC no trong
        // CHINH vong lap nay (vd file dau la van ban phu rong, file thu 2 moi
        // la BCTC that). Neu KHONG file nao cho du lieu that (foundUsable van
        // false sau khi thu HET resolved) - GIU NGUYEN tat ca ket qua rong da
        // co, de canh bao "CANH BAO: ca 3 bang...rong" (financial-statements.ts)
        // tu nhien noi len, vi day co the la loi OCR/scan that tren chinh
        // BCTC, khong phai van ban phu - khong the tu dong ket luan an toan.
        const usable = foundUsable ? extracted.filter(({ content }) => !isEmptyParse(content.statements)) : extracted;
        if (foundUsable) {
          for (const { resolvedFile, content } of extracted) {
            if (isEmptyParse(content.statements)) console.log('bo qua file rong (van ban phu, da co nguon khac cho du lieu that)', resolvedFile.filePath);
          }
        }

        for (const { resolvedFile, content } of usable) {
          if (content.warnings.length > 0) {
            console.warn('bang so lieu con lech sau khi cau truc hoa', resolvedFile.filePath, content.warnings);
          }
          const statementScope = classifyStatementScope(buildStatementScopeInput(resolvedFile, content.fullText ?? undefined));
          // Luu markdown OCR THO (2026-07-16, theo yeu cau nguoi dung sau su
          // co MCH/ABB/TPB: LCTT rong tren live nhung khong co markdown nao
          // de dieu tra ma khong ton OCR that lan 2) - GHI DE theo ma+ky+pham
          // vi, cung duoc commit lai voi data/latest-fetch.json (xem
          // .github/workflows/fetch-bctc.yml). content.markdown la null khi
          // extractReportContent doc qua nhanh full-text (khong phai nhanh
          // OCR probe) - khong co gi de luu trong truong hop do.
          if (content.markdown) {
            saveProductionOcrMarkdown(resolvedFile.report.stockCode, `${term.yearPeriod}-${periodSlug}-${statementScope}`, content.markdown);
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
              statementScope,
              businessType: content.businessType,
              analysis: computeAnalysisRows(content.statements, content.businessType, content.unreliableCells),
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
        }

        // Da OCR xong (thanh cong hay that bai deu vay) - file goc khong con
        // can nua, xoa NGAY (khong doi het batch nhu truoc) de data/reports/
        // khong phinh dan qua giua chung khi chay batch lon.
        await cleanupDownloadedFile(filePath);
        processedIndices.add(index);
        flushProgress();
      }
    }

    await Promise.all(Array.from({ length: Math.min(PIPELINE_CONCURRENCY, matched.length) }, worker));
    console.timeEnd('[perf] downloadResolveExtract');

    // BO SUNG vao ket qua da co (khong tu xoa) - yeu cau user 2026-07-08: moi
    // lan bam "Tai BCTC" truoc day GHI DE toan bo status.reports, xoa mat ket
    // qua cac lan chay truoc. Trung "ma CK + ky + tieu de" (vd tai lai DUNG
    // bao cao cua 1 cong ty trong CUNG ky) -> CHI giu 1 ban (ban MOI thay the
    // ban cu, du lieu moi hon), khong tao dong trung lap - theo dung yeu cau
    // user. Xoa het qua nut "Xoa" rieng (xem clearResults o tren), khong tu
    // dong xoa o day. (previousStatus da doc 1 lan truoc vong lap - xem
    // buildStatus - dung chung cho ca cac lan flushProgress giua chung lan
    // lan ghi cuoi nay.)
    const status = buildStatus(false);
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
