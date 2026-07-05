import { runFetchPipeline, type RunFetchPipelineOptions } from '@/lib/pipeline';
import type { ReportTerm } from '@/lib/vietstock-reports';

// Chi phu hop chay tren 1 tien trinh Node dai han (next dev / next start) -
// khong dung tren serverless (Vercel) vi ham chay nen sau khi response tra
// ve se bi kill giua chung. Neu sau nay deploy serverless, chuyen sang mo
// hinh dispatch GitHub Actions nhu 2 project loc_tin/loc_tin_qwen.
let isRunning = false;

interface TriggerFetchBody {
  // Ky da chon tu dropdown (app/FetchControls.tsx, lay tu app/api/report-terms) -
  // co the la Quy 1-4, "6T", "9T", hoac "Nam" (xem lib/period-label.ts).
  reportTermID?: number;
  yearPeriod?: number;
  description?: string;
  hoursWindow?: number;
  reportLimit?: number;
}

export async function POST(request: Request) {
  if (isRunning) {
    return Response.json({ error: 'Dang co 1 lan chay khac, doi no xong da.' }, { status: 409 });
  }

  let body: TriggerFetchBody = {};
  try {
    body = (await request.json()) as TriggerFetchBody;
  } catch {
    // Khong gui body (VD goi tu script cu/test) - dung mac dinh (quy vua qua,
    // khong gioi han) nhu hanh vi truoc day.
  }

  const term: ReportTerm | undefined =
    body.reportTermID && body.yearPeriod && body.description
      ? { reportTermID: body.reportTermID, yearPeriod: body.yearPeriod, description: body.description }
      : undefined;

  const options: RunFetchPipelineOptions = {
    term,
    hoursWindow: body.hoursWindow,
    reportLimit: body.reportLimit,
  };

  isRunning = true;
  runFetchPipeline(options)
    .catch((error) => {
      console.error('trigger-fetch pipeline error', error);
    })
    .finally(() => {
      isRunning = false;
    });

  return Response.json({ ok: true });
}
