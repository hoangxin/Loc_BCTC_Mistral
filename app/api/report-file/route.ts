import { readFile } from 'fs/promises';
import { basename } from 'path';
import { readStatus } from '@/lib/pipeline';

// Tra ve file da xuat SAN cho 1 bao cao (3 bang BCTC full - .xlsx/.clean.pdf,
// xem lib/export/index.ts writeReportExports) - dung cho nut "Excel"/"PDF"
// tren TUNG hang cua bang ket qua (app/ReportsSummaryTable.tsx).
//
// KHONG doc thang duong dan client gui len - chi nhan `filePath` lam KHOA de
// tra cuu lai trong status.reports (server tu quyet dinh doc file nao), tranh
// path traversal (doc bat ky file nao tren dia neu chi tin client).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('filePath');
  const kind = searchParams.get('kind');

  if (!filePath || (kind !== 'excel' && kind !== 'pdf')) {
    return Response.json({ error: 'Thiếu filePath hoặc kind không hợp lệ.' }, { status: 400 });
  }

  const status = readStatus();
  const report = status.reports.find((r) => r.filePath === filePath);
  if (!report) {
    return Response.json({ error: 'Không tìm thấy báo cáo.' }, { status: 404 });
  }

  const targetPath = kind === 'excel' ? report.excelPath : report.cleanPdfPath;
  if (!targetPath) {
    return Response.json({ error: 'Báo cáo này chưa có file xuất sẵn.' }, { status: 404 });
  }

  try {
    const buffer = await readFile(targetPath);
    const contentType =
      kind === 'excel' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf';
    return new Response(new Blob([new Uint8Array(buffer)]), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${basename(targetPath)}"`,
      },
    });
  } catch (error) {
    console.error('report-file route error', targetPath, error);
    return Response.json({ error: 'Không đọc được file.' }, { status: 500 });
  }
}
