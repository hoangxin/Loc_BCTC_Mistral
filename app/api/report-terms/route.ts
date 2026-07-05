import { fetchReportTerms } from '@/lib/vietstock-reports';

export const dynamic = 'force-dynamic';

// Danh sach ky bao cao THAT cua Vietstock (Quy 1-4, "6T", "9T", "Nam") - dung
// cho dropdown chon ky tren UI (app/FetchControls.tsx), tu "tinh tien" theo
// thoi gian hien tai vi day la du lieu song, khong phai danh sach tu sinh.
export async function GET() {
  try {
    const terms = await fetchReportTerms();
    return Response.json({ terms });
  } catch (error) {
    console.error('report-terms route error', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Có lỗi xảy ra.' }, { status: 500 });
  }
}
