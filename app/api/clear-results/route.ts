// Nut "Xoa" o tab Ket qua (app/ClearResultsButton.tsx) - dispatch CUNG
// workflow voi trigger-fetch (mode=clear, xem scripts/run-fetch.ts) thay vi
// ghi truc tiep data/latest-fetch.json tai day: route nay chay tren Vercel
// serverless, ghi file cuc bo se KHONG persist/khong doi voi nguoi dung khac
// (xem README - ly do goc cua toan bo kien truc dispatch GitHub Actions).
// Phai di qua GitHub Actions (co quyen `contents: write`, commit lai
// data/latest-fetch.json) de thay doi thuc su "dinh" lai va trigger Vercel
// redeploy, giong het luong "Tai BCTC".
import { dispatchFetchWorkflow } from '@/lib/github-dispatch';

interface ClearResultsBody {
  // Danh sach filePath can xoa RIENG (nut "Xoa bao cao da chon" tren tung tab
  // "Ket qua {ky}") - rong/khong co nghia xoa TOAN BO nhu truoc (xem
  // clearResults, lib/pipeline.ts).
  filePaths?: string[];
}

export async function POST(request: Request) {
  let body: ClearResultsBody = {};
  try {
    body = (await request.json()) as ClearResultsBody;
  } catch {
    // Khong gui body - xoa toan bo (hanh vi cu).
  }

  const result = await dispatchFetchWorkflow({
    mode: 'clear',
    clearFilePaths: body.filePaths?.length ? body.filePaths.join(',') : '',
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 500 });
  }
  return Response.json({ ok: true, runId: result.runId });
}
