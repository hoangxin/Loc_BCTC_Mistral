import { randomUUID } from 'crypto';
import { dispatchFetchWorkflow } from '@/lib/github-dispatch';

// "Them nguon rieng" - dispatch CUNG 1 workflow voi trigger-fetch
// (.github/workflows/fetch-bctc.yml, mode=custom) - khong con chay
// fetchCustomSourceReport truc tiep trong route (co buoc AI duyet trang + tai
// + OCR 3 bang, qua lau/ton dia cho Vercel serverless). Vi dispatch KHONG tra
// ket qua ngay, tra ve `requestId` de client (app/CustomSourceForm.tsx) tu
// poll app/api/fetch-status doi chieu FetchStatus.lastCustomSourceCheck.
export async function POST(request: Request) {
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
  const result = await dispatchFetchWorkflow({ mode: 'custom', customUrl: url, requestId });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 500 });
  }
  return Response.json({ ok: true, requestId });
}
