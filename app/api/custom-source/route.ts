import { randomUUID } from 'crypto';
import { dispatchFetchWorkflow } from '@/lib/github-dispatch';
import { parseOcrMode } from '@/lib/ocr-mode';
import type { StatementScope } from '@/lib/statement-scope';

const VALID_SCOPES: StatementScope[] = ['Hợp nhất', 'Riêng lẻ', 'Chung'];

// "Them nguon rieng" - dispatch CUNG 1 workflow voi trigger-fetch
// (.github/workflows/fetch-bctc.yml, mode=custom) - khong con chay
// fetchCustomSourceReport truc tiep trong route (co buoc AI duyet trang + tai
// + OCR 3 bang, qua lau/ton dia cho Vercel serverless). Vi dispatch KHONG tra
// ket qua ngay, tra ve `requestId` de client (app/CustomSourceForm.tsx) tu
// poll app/api/fetch-status doi chieu FetchStatus.lastCustomSourceCheck.
//
// SUA 2026-07-29 (yeu cau nguoi dung: Ma CK/San GD/Quy/Loai BCTC cua bao cao
// qua nguon rieng luon bi de trong hoac doan sai - vd luon gan periodYear/
// periodSlug theo getPreviousQuarter() bat ke bao cao that su cua ky nao): bat
// buoc nguoi dung tu nhap du 5 truong (url + stockCode + exchange + quarter/
// year + statementScope) thay vi de app tu doan - website tung cong ty khong
// co quy uoc chung nhu Vietstock nen khong the tu suy dung chinh xac.
export async function POST(request: Request) {
  let url: string | undefined;
  let ocrMode = '';
  let stockCode: string | undefined;
  let exchange: string | undefined;
  let quarter: number | undefined;
  let year: number | undefined;
  let statementScope: string | undefined;
  try {
    const body = (await request.json()) as {
      url?: string;
      ocrMode?: string;
      stockCode?: string;
      exchange?: string;
      quarter?: number;
      year?: number;
      statementScope?: string;
    };
    url = body.url?.trim();
    ocrMode = parseOcrMode(body.ocrMode);
    stockCode = body.stockCode?.trim().toUpperCase();
    exchange = body.exchange?.trim();
    quarter = body.quarter;
    year = body.year;
    statementScope = body.statementScope;
  } catch {
    // bo qua, xu ly nhu thieu du lieu o duoi
  }

  if (!url) {
    return Response.json({ error: 'Thiếu URL.' }, { status: 400 });
  }
  if (!stockCode) {
    return Response.json({ error: 'Thiếu mã CK.' }, { status: 400 });
  }
  if (!exchange) {
    return Response.json({ error: 'Thiếu sàn giao dịch.' }, { status: 400 });
  }
  if (!quarter || quarter < 1 || quarter > 4) {
    return Response.json({ error: 'Thiếu/sai quý (1-4).' }, { status: 400 });
  }
  if (!year || year < 2000) {
    return Response.json({ error: 'Thiếu/sai năm.' }, { status: 400 });
  }
  if (!statementScope || !VALID_SCOPES.includes(statementScope as StatementScope)) {
    return Response.json({ error: 'Thiếu/sai loại báo cáo.' }, { status: 400 });
  }

  const requestId = randomUUID();
  const result = await dispatchFetchWorkflow({
    mode: 'custom',
    customUrl: url,
    customStockCode: stockCode,
    customExchange: exchange,
    customQuarter: String(quarter),
    customYear: String(year),
    customStatementScope: statementScope,
    requestId,
    ocrMode,
  });

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status ?? 500 });
  }
  return Response.json({ ok: true, requestId });
}
