import { randomUUID } from 'crypto';

// "Them nguon rieng" - dispatch CUNG 1 workflow voi trigger-fetch
// (.github/workflows/fetch-bctc.yml, mode=custom) - khong con chay
// fetchCustomSourceReport truc tiep trong route (co buoc AI duyet trang + tai
// + OCR 3 bang, qua lau/ton dia cho Vercel serverless). Vi dispatch KHONG tra
// ket qua ngay, tra ve `requestId` de client (app/CustomSourceForm.tsx) tu
// poll app/api/fetch-status doi chieu FetchStatus.lastCustomSourceCheck.
const OWNER = 'hoangxin';
const REPO = 'Loc_BCTC_Mistral';
const WORKFLOW_FILE = 'fetch-bctc.yml';

function githubHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function POST(request: Request) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) {
    return Response.json({ error: 'Thiếu GITHUB_DISPATCH_TOKEN trên server.' }, { status: 500 });
  }

  let url: string | undefined;
  try {
    const body = (await request.json()) as { url?: string };
    url = body.url?.trim();
  } catch {
    // bo qua, xu ly nhu thieu url o duoi
  }

  if (!url) {
    return Response.json({ error: 'Thiếu URL.' }, { status: 400 });
  }

  const requestId = randomUUID();

  const dispatchResponse = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: 'POST',
    headers: { ...githubHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { mode: 'custom', customUrl: url, requestId } }),
  });

  if (!dispatchResponse.ok) {
    const text = await dispatchResponse.text();
    console.error('custom-source dispatch error', dispatchResponse.status, text);
    return Response.json({ error: `Không kích hoạt được workflow (${dispatchResponse.status}).` }, { status: 500 });
  }

  return Response.json({ ok: true, requestId });
}
