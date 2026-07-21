import { existsSync } from 'fs';
import { join } from 'path';
import { runFetchPipeline, clearResults } from '../lib/pipeline';
import { runCustomSourceCheck } from '../lib/custom-source';
import { parseOcrMode } from '../lib/ocr-mode';

// Khac voi `npm run dev`/`next start` (Next.js tu nap .env), chay thang qua
// tsx (`npm run fetch`, hoac tren GitHub Actions runner - xem
// .github/workflows/fetch-bctc.yml) khong tu nap .env - phai nap thu cong o
// day, khong thi se loi ngay tu buoc goi AI dau tien. Tren Actions, cac bien
// duoc truyen qua `env:` cua step nen `.env` khong ton tai - existsSync o
// duoi tranh loi khi khong co file nay.
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

// FETCH_MODE phan biet 3 luong dispatch: app/api/trigger-fetch (mode=term,
// mac dinh), app/api/custom-source (mode=custom), app/api/clear-results
// (mode=clear) - ca 3 deu goi tu CUNG 1 script nay tren GitHub Actions runner
// (.github/workflows/fetch-bctc.yml).
const mode = process.env.FETCH_MODE || 'term';
// Sync/batch (yeu cau nguoi dung 2026-07-21, xem lib/ocr-mode.ts) - truyen tu
// UI (app/FetchControls.tsx, app/CustomSourceForm.tsx) qua .github/workflows/
// fetch-bctc.yml. Khong hop le/khong co = DEFAULT_OCR_MODE (batch).
const ocrMode = parseOcrMode(process.env.FETCH_OCR_MODE);

async function main() {
  if (mode === 'clear') {
    // FETCH_CLEAR_FILE_PATHS: danh sach filePath can xoa RIENG (nut "Xoa bao
    // cao da chon" tren tung tab "Ket qua {ky}") - rong/khong co nghia xoa
    // TOAN BO nhu truoc (xem clearResults, lib/pipeline.ts).
    const filePaths = process.env.FETCH_CLEAR_FILE_PATHS
      ? process.env.FETCH_CLEAR_FILE_PATHS.split(',').filter(Boolean)
      : undefined;
    clearResults(filePaths);
    console.log(filePaths?.length ? `Da xoa ${filePaths.length} bao cao.` : 'Da xoa toan bo ket qua.');
    return;
  }

  if (mode === 'custom') {
    const url = process.env.FETCH_CUSTOM_URL;
    const requestId = process.env.FETCH_REQUEST_ID || '';
    if (!url) throw new Error('Thieu FETCH_CUSTOM_URL cho FETCH_MODE=custom');
    const status = await runCustomSourceCheck(url, requestId, ocrMode);
    console.log(`Nguon rieng ${url}: ${status.lastCustomSourceCheck?.found ? 'tim thay' : 'chua co'}`);
    return;
  }

  // mode === 'term' (mac dinh) - ky da chon tu dropdown that (app/FetchControls.tsx,
  // xem lib/vietstock-reports.ts fetchReportTerms) - reportTermID/yearPeriod/
  // description la 3 truong cua 1 ReportTerm that.
  const reportTermID = process.env.FETCH_REPORT_TERM_ID ? Number(process.env.FETCH_REPORT_TERM_ID) : undefined;
  const yearPeriod = process.env.FETCH_YEAR_PERIOD ? Number(process.env.FETCH_YEAR_PERIOD) : undefined;
  const description = process.env.FETCH_DESCRIPTION || undefined;
  const onlyMissing = process.env.FETCH_ONLY_MISSING === '1';
  const reportLimit = process.env.FETCH_REPORT_LIMIT ? Number(process.env.FETCH_REPORT_LIMIT) : undefined;
  const selectedFileInfoIds = process.env.FETCH_SELECTED_IDS
    ? process.env.FETCH_SELECTED_IDS.split(',').map(Number).filter((n) => Number.isFinite(n))
    : undefined;
  const term = reportTermID && yearPeriod && description ? { reportTermID, yearPeriod, description } : undefined;

  // FETCH_QUARTER/FETCH_YEAR: cach cu, chay tay 1 quy cu the (vd de test) khi
  // khong co san 1 ReportTerm day du - runFetchPipeline tu quy doi.
  const quarterOverride = process.env.FETCH_QUARTER ? Number(process.env.FETCH_QUARTER) : undefined;
  const yearOverride = process.env.FETCH_YEAR ? Number(process.env.FETCH_YEAR) : undefined;

  const status = await runFetchPipeline({ term, quarter: quarterOverride, year: yearOverride, onlyMissing, reportLimit, selectedFileInfoIds, ocrMode });
  console.log(
    `${status.periodLabel}: tim thay ${status.totalFound}, sau loc ${status.totalMatched}, da tai file ${status.downloaded} (${status.failed.length} loi, ${status.interruptedReports.length} do dang chua xu ly xong).`
  );
}

main().catch((error) => {
  console.error('fetch bao cao that bai', error);
  process.exitCode = 1;
});
