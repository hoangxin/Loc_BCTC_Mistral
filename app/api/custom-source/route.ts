import { fetchCustomSourceReport } from '@/lib/custom-source';
import { addCustomReport } from '@/lib/pipeline';

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

  try {
    const result = await fetchCustomSourceReport(url);
    if (!result.found) {
      return Response.json({ ok: false, message: result.message });
    }

    addCustomReport(result.report);
    return Response.json({ ok: true, report: result.report });
  } catch (error) {
    console.error('custom-source route error', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Có lỗi xảy ra.' }, { status: 500 });
  }
}
