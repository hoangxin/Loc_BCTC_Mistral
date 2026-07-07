// "Tai BCTC" - dispatch GitHub Actions (.github/workflows/fetch-bctc.yml)
// thay vi chay pipeline truc tiep trong route nay (Vercel serverless se
// timeout/mat du lieu dia giua cac lan goi - xem README). Theo dung khung
// app/api/trigger-digest/route.ts cua loc_tin/Loc_Tin_Mistral/loc_tin_qwen
// (da xac nhan qua doc code that: raw fetch, khong Octokit, cung ten bien
// GITHUB_DISPATCH_TOKEN).
import { dispatchFetchWorkflow } from '@/lib/github-dispatch';

interface TriggerFetchBody {
  // Ky da chon tu dropdown (app/FetchControls.tsx, lay tu app/api/report-terms) -
  // co the la Quy 1-4, "6T", "9T", hoac "Nam" (xem lib/period-label.ts).
  reportTermID?: number;
  yearPeriod?: number;
  description?: string;
  hoursWindow?: number;
  reportLimit?: number;
  // Tick chon tay tung bao cao trong bang preview (app/FetchControls.tsx,
  // mode 'select') - danh sach ReportFile.fileInfoID. Khi co mat (khong
  // rong), ghi de hoan toan hoursWindow/reportLimit (xem lib/pipeline.ts).
  selectedFileInfoIds?: number[];
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
    hoursWindow: body.hoursWindow ? String(body.hoursWindow) : '',
    reportLimit: body.reportLimit ? String(body.reportLimit) : '',
    selectedIds: body.selectedFileInfoIds?.length ? body.selectedFileInfoIds.join(',') : '',
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 500 });
  }
  return Response.json({ ok: true, runId: result.runId });
}
