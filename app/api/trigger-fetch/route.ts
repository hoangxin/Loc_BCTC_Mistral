import { runFetchPipeline, type RunFetchPipelineOptions } from '@/lib/pipeline';

// Chi phu hop chay tren 1 tien trinh Node dai han (next dev / next start) -
// khong dung tren serverless (Vercel) vi ham chay nen sau khi response tra
// ve se bi kill giua chung. Neu sau nay deploy serverless, chuyen sang mo
// hinh dispatch GitHub Actions nhu 2 project loc_tin/loc_tin_qwen.
let isRunning = false;

interface TriggerFetchBody {
  quarter?: number;
  year?: number;
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

  const options: RunFetchPipelineOptions = {
    quarter: body.quarter,
    year: body.year,
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
