import { readStatus } from '@/lib/pipeline';
import { buildSummaryExcelBuffer } from '@/lib/export/summary-excel';
import { buildSummaryPdfBuffer } from '@/lib/export/summary-pdf';
import type { SummaryRow } from '@/lib/summary-row';

interface ExportSummaryBody {
  filePaths?: string[];
  format?: 'xlsx' | 'pdf';
}

export async function POST(request: Request) {
  let body: ExportSummaryBody;
  try {
    body = (await request.json()) as ExportSummaryBody;
  } catch {
    return Response.json({ error: 'Body không hợp lệ.' }, { status: 400 });
  }

  const filePaths = body.filePaths ?? [];
  const format = body.format;
  if (filePaths.length === 0) {
    return Response.json({ error: 'Chưa chọn dòng nào để xuất.' }, { status: 400 });
  }
  if (format !== 'xlsx' && format !== 'pdf') {
    return Response.json({ error: 'Định dạng xuất không hợp lệ.' }, { status: 400 });
  }

  const status = readStatus();
  const selected = new Set(filePaths);
  const rows: SummaryRow[] = status.reports
    .filter((report) => selected.has(report.filePath))
    .map((report, index) => ({
      stt: index + 1,
      stockCode: report.stockCode ?? '',
      companyName: report.companyName ?? '',
      exchange: report.exchange ?? '',
      title: report.title ?? '',
      // Fallback 'Chung' cho du lieu cu tu ban truoc (chua co truong nay) -
      // du lieu moi tu lib/pipeline.ts/lib/custom-source.ts luon co san.
      statementScope: report.statementScope ?? 'Chung',
      businessType: report.businessType ?? 'other',
      analysis: report.analysis ?? [],
    }));

  try {
    if (format === 'xlsx') {
      const buffer = await buildSummaryExcelBuffer(rows);
      return new Response(new Blob([new Uint8Array(buffer)]), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="bang-tong-hop.xlsx"',
        },
      });
    }

    const buffer = await buildSummaryPdfBuffer(rows);
    return new Response(new Blob([new Uint8Array(buffer)]), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="bang-tong-hop.pdf"',
      },
    });
  } catch (error) {
    console.error('export-summary route error', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Có lỗi xảy ra.' }, { status: 500 });
  }
}
