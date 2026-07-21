// "Tai BCTC" - dispatch GitHub Actions (.github/workflows/fetch-bctc.yml)
// thay vi chay pipeline truc tiep trong route nay (Vercel serverless se
// timeout/mat du lieu dia giua cac lan goi - xem README). Theo dung khung
// app/api/trigger-digest/route.ts cua loc_tin/Loc_Tin_Mistral/loc_tin_qwen
// (da xac nhan qua doc code that: raw fetch, khong Octokit, cung ten bien
// GITHUB_DISPATCH_TOKEN).
import { dispatchFetchWorkflow } from '@/lib/github-dispatch';
import { parseOcrMode } from '@/lib/ocr-mode';

interface TriggerFetchBody {
  // Ky da chon tu dropdown (app/FetchControls.tsx, lay tu app/api/report-terms) -
  // co the la Quy 1-4, "6T", "9T", hoac "Nam" (xem lib/period-label.ts).
  reportTermID?: number;
  yearPeriod?: number;
  description?: string;
  // "Tu lan tai cuoi" - xem lib/pipeline.ts RunFetchPipelineOptions.onlyMissing
  // (thay the hoan toan ban cu loc theo gio 2026-07-20).
  onlyMissing?: boolean;
  reportLimit?: number;
  // Tick chon tay tung bao cao trong bang preview (app/FetchControls.tsx,
  // mode 'select') - danh sach ReportFile.fileInfoID. Khi co mat (khong
  // rong), ghi de hoan toan onlyMissing/reportLimit (xem lib/pipeline.ts).
  selectedFileInfoIds?: number[];
  // Sync/batch (yeu cau nguoi dung 2026-07-21, xem lib/ocr-mode.ts).
  ocrMode?: string;
}

export async function POST(request: Request) {
  let body: TriggerFetchBody = {};
  try {
    body = (await request.json()) as TriggerFetchBody;
  } catch {
    // Khong gui body - dispatch voi input rong (script tu dung mac dinh).
  }

  const result = await dispatchFetchWorkflow({
    mode: 'term',
    reportTermID: body.reportTermID ? String(body.reportTermID) : '',
    yearPeriod: body.yearPeriod ? String(body.yearPeriod) : '',
    description: body.description ?? '',
    onlyMissing: body.onlyMissing ? '1' : '',
    reportLimit: body.reportLimit ? String(body.reportLimit) : '',
    selectedIds: body.selectedFileInfoIds?.length ? body.selectedFileInfoIds.join(',') : '',
    ocrMode: parseOcrMode(body.ocrMode),
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 500 });
  }
  return Response.json({ ok: true, runId: result.runId });
}
