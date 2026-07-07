import { fetchReportFilesForTerm, type ReportTerm } from '@/lib/vietstock-reports';

export const dynamic = 'force-dynamic';

// Xem truoc danh muc bao cao THAT cua 1 ky da chon tren dropdown
// (app/FetchControls.tsx) - dung lai fetchReportFilesForTerm (da co san, cung
// ham pipeline that su dung khi "Tai BCTC") nen danh sach hien ra dung 100%
// khop voi danh muc that ben Vietstock cho ky do, KHONG rieng logic hien thi.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reportTermID = Number(searchParams.get('reportTermID'));
  const yearPeriod = Number(searchParams.get('yearPeriod'));
  const description = searchParams.get('description') ?? '';

  if (!reportTermID || !yearPeriod || !description) {
    return Response.json({ error: 'Thiếu reportTermID/yearPeriod/description.' }, { status: 400 });
  }

  const term: ReportTerm = { reportTermID, yearPeriod, description };

  try {
    const reports = await fetchReportFilesForTerm(term);
    return Response.json({ reports });
  } catch (error) {
    console.error('report-list route error', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Có lỗi xảy ra.' }, { status: 500 });
  }
}
