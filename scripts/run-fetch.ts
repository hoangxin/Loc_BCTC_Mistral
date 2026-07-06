import { existsSync } from 'fs';
import { join } from 'path';
import { runFetchPipeline } from '../lib/pipeline';
import { runCustomSourceCheck } from '../lib/custom-source';

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

// FETCH_MODE phan biet 2 luong dispatch tu app/api/trigger-fetch (mode=term,
// mac dinh) va app/api/custom-source (mode=custom) - ca 2 deu goi tu CUNG 1
// script nay tren GitHub Actions runner (.github/workflows/fetch-bctc.yml).
const mode = process.env.FETCH_MODE || 'term';

async function main() {
  if (mode === 'custom') {
    const url = process.env.FETCH_CUSTOM_URL;
    const requestId = process.env.FETCH_REQUEST_ID || '';
    if (!url) throw new Error('Thieu FETCH_CUSTOM_URL cho FETCH_MODE=custom');
    const status = await runCustomSourceCheck(url, requestId);
    console.log(`Nguon rieng ${url}: ${status.lastCustomSourceCheck?.found ? 'tim thay' : 'chua co'}`);
    return;
  }

  // mode === 'term' (mac dinh) - ky da chon tu dropdown that (app/FetchControls.tsx,
  // xem lib/vietstock-reports.ts fetchReportTerms) - reportTermID/yearPeriod/
  // description la 3 truong cua 1 ReportTerm that.
  const reportTermID = process.env.FETCH_REPORT_TERM_ID ? Number(process.env.FETCH_REPORT_TERM_ID) : undefined;
  const yearPeriod = process.env.FETCH_YEAR_PERIOD ? Number(process.env.FETCH_YEAR_PERIOD) : undefined;
  const description = process.env.FETCH_DESCRIPTION || undefined;
  const hoursWindow = process.env.FETCH_HOURS_WINDOW ? Number(process.env.FETCH_HOURS_WINDOW) : undefined;
  const reportLimit = process.env.FETCH_REPORT_LIMIT ? Number(process.env.FETCH_REPORT_LIMIT) : undefined;
  const term = reportTermID && yearPeriod && description ? { reportTermID, yearPeriod, description } : undefined;

  // FETCH_QUARTER/FETCH_YEAR: cach cu, chay tay 1 quy cu the (vd de test) khi
  // khong co san 1 ReportTerm day du - runFetchPipeline tu quy doi.
  const quarterOverride = process.env.FETCH_QUARTER ? Number(process.env.FETCH_QUARTER) : undefined;
  const yearOverride = process.env.FETCH_YEAR ? Number(process.env.FETCH_YEAR) : undefined;

  const status = await runFetchPipeline({ term, quarter: quarterOverride, year: yearOverride, hoursWindow, reportLimit });
  console.log(
    `${status.periodLabel}: tim thay ${status.totalFound}, sau loc ${status.totalMatched}, tai thanh cong ${status.downloaded} (${status.failed.length} loi).`
  );
}

main().catch((error) => {
  console.error('fetch bao cao that bai', error);
  process.exitCode = 1;
});
