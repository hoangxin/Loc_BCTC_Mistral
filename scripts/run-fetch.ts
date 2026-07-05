import { existsSync } from 'fs';
import { join } from 'path';
import { runFetchPipeline } from '../lib/pipeline';

// Khac voi `npm run dev`/`next start` (Next.js tu nap .env), chay thang qua
// tsx (`npm run fetch`) khong tu nap .env - buoc xuat Excel (lib/export) can
// OPENROUTER_API_KEY nen phai nap thu cong o day, khong thi CLI se loi ngay
// tu buoc goi AI dau tien.
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

// FETCH_QUARTER/FETCH_YEAR cho phep chay lai cho 1 quy cu the (vd de test)
// thay vi luon mac dinh "quy vua qua" tinh theo ngay hien tai.
const quarterOverride = process.env.FETCH_QUARTER ? Number(process.env.FETCH_QUARTER) : undefined;
const yearOverride = process.env.FETCH_YEAR ? Number(process.env.FETCH_YEAR) : undefined;

runFetchPipeline({ quarter: quarterOverride, year: yearOverride })
  .then((status) => {
    console.log(
      `Quy ${status.quarter}/${status.year}: tim thay ${status.totalFound}, sau loc ${status.totalMatched}, tai thanh cong ${status.downloaded} (${status.failed.length} loi).`
    );
  })
  .catch((error) => {
    console.error('fetch bao cao that bai', error);
    process.exitCode = 1;
  });
