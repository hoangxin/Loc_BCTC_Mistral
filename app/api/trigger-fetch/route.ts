// "Tai BCTC" - dispatch GitHub Actions (.github/workflows/fetch-bctc.yml)
// thay vi chay pipeline truc tiep trong route nay (Vercel serverless se
// timeout/mat du lieu dia giua cac lan goi - xem README). Theo dung khung
// app/api/trigger-digest/route.ts cua loc_tin/Loc_Tin_Mistral/loc_tin_qwen
// (da xac nhan qua doc code that: raw fetch, khong Octokit, cung ten bien
// GITHUB_DISPATCH_TOKEN).
const OWNER = 'hoangxin';
const REPO = 'Loc_BCTC_Mistral';
const WORKFLOW_FILE = 'fetch-bctc.yml';
const RUN_LOOKUP_ATTEMPTS = 8;
const RUN_LOOKUP_DELAY_MS = 500;

interface TriggerFetchBody {
  // Ky da chon tu dropdown (app/FetchControls.tsx, lay tu app/api/report-terms) -
  // co the la Quy 1-4, "6T", "9T", hoac "Nam" (xem lib/period-label.ts).
  reportTermID?: number;
  yearPeriod?: number;
  description?: string;
  hoursWindow?: number;
  reportLimit?: number;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

interface WorkflowRun {
  id: number;
  created_at: string;
}

// workflow_dispatch tra ve 204 khong co run id - phai poll danh sach run gan
// nhat de tim dung lan vua kich hoat (dung cho tinh nang Huy sau nay, chua co
// UI goi toi ngay bay gio).
async function findDispatchedRunId(token: string, dispatchedAt: number): Promise<number | null> {
  for (let attempt = 0; attempt < RUN_LOOKUP_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, RUN_LOOKUP_DELAY_MS));
    try {
      const response = await fetch(
        `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?event=workflow_dispatch&per_page=5`,
        { headers: githubHeaders(token) }
      );
      if (!response.ok) continue;
      const data = (await response.json()) as { workflow_runs?: WorkflowRun[] };
      const run = (data.workflow_runs ?? []).find((r) => new Date(r.created_at).getTime() >= dispatchedAt - 5000);
      if (run) return run.id;
    } catch {
      // loi tam thoi khi poll danh sach run - thu lai vong sau
    }
  }
  return null;
}

export async function POST(request: Request) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return Response.json({ error: 'Thiếu GITHUB_DISPATCH_TOKEN trên server.' }, { status: 500 });
  }

  let body: TriggerFetchBody = {};
  try {
    body = (await request.json()) as TriggerFetchBody;
  } catch {
    // Khong gui body - dispatch voi input rong (script tu dung mac dinh).
  }

  const inputs = {
    mode: 'term',
    reportTermID: body.reportTermID ? String(body.reportTermID) : '',
    yearPeriod: body.yearPeriod ? String(body.yearPeriod) : '',
    description: body.description ?? '',
    hoursWindow: body.hoursWindow ? String(body.hoursWindow) : '',
    reportLimit: body.reportLimit ? String(body.reportLimit) : '',
  };

  const dispatchedAt = Date.now();
  const dispatchResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: 'POST',
    headers: { ...githubHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs }),
  });

  if (!dispatchResponse.ok) {
    const text = await dispatchResponse.text();
    console.error('trigger-fetch dispatch error', dispatchResponse.status, text);
    return Response.json({ error: `Không kích hoạt được workflow (${dispatchResponse.status}).` }, { status: 500 });
  }

  const runId = await findDispatchedRunId(token, dispatchedAt);
  return Response.json({ ok: true, runId });
}
