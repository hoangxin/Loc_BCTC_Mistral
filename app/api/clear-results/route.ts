// Nut "Xoa" o tab Ket qua (app/ClearResultsButton.tsx) - dispatch CUNG
// workflow voi trigger-fetch (mode=clear, xem scripts/run-fetch.ts) thay vi
// ghi truc tiep data/latest-fetch.json tai day: route nay chay tren Vercel
// serverless, ghi file cuc bo se KHONG persist/khong doi voi nguoi dung khac
// (xem README - ly do goc cua toan bo kien truc dispatch GitHub Actions).
// Phai di qua GitHub Actions (co quyen `contents: write`, commit lai
// data/latest-fetch.json) de thay doi thuc su "dinh" lai va trigger Vercel
// redeploy, giong het luong "Tai BCTC".
import { dispatchFetchWorkflow } from '@/lib/github-dispatch';

export async function POST() {
  const result = await dispatchFetchWorkflow({ mode: 'clear' });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 500 });
  }
  return Response.json({ ok: true, runId: result.runId });
}
