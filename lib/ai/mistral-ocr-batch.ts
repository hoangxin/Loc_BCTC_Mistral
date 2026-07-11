import { readFile } from 'fs/promises';
import type { MistralOcrPage, MistralOcrResult } from './mistral-ocr';

// CHUA DUOC DUNG O DAU TRONG PIPELINE CHINH - viet theo yeu cau nguoi dung
// 2026-07-12 de san sang doi qua khi bat billing tren tai khoan Mistral (xem
// memory/reference_mistral_batch_api.md). Cung interface (filePath, options)
// => Promise<MistralOcrResult> nhu callMistralOcr (./mistral-ocr.ts) de co
// the doi TRUC TIEP o lib/export/financial-statements.ts sau nay (chi doi 1
// dong import callMistralOcr -> callMistralOcrBatch), khong can sua gi them.
//
// THIET KE "1 batch job = 1 bao cao" (KHONG gop nhieu bao cao vao 1 job lon)
// - da thao luan voi nguoi dung 2026-07-12: Batch API giam gia 50% FLAT theo
// so trang bat ke gop bao nhieu request/job (khong co uu dai gop nhieu), ma
// ket qua CHI tra ve khi TOAN BO job xong (khong co ket qua tung phan/streaming)
// - gop hang tram bao cao vao 1 job se phai doi bao cao CHAM NHAT xong moi
// thay duoc bao cao dau tien, pha vo UX cap nhat dan hien tai cua
// lib/pipeline.ts (moi bao cao hien ra ngay khi xong, khong doi ca lo). Tach
// "1 job/bao cao" giu dung UX do, cung gia, chi doi lai CACH GOI (bat dong
// bo: tao job -> cho -> tai ket qua, thay vi goi-cho-tra-loi ngay).
//
// XAC NHAN THAT qua test truc tiep (2026-07-08, xem memory): free tier
// KHONG dung duoc Batch API - tao job (POST /v1/batch/jobs) tra ve HTTP 402
// "You do not have access to this service. You can enable billing via the
// console." Chi kha dung SAU KHI tai khoan bat billing (cung 1 buoc can lam
// de dung OCR tra phi thuong - khong phai dang ky rieng).
//
// !!! CANH BAO QUAN TRONG: dinh dang TUNG DONG cua file ket qua (output_file)
// KHONG duoc Mistral cong bo chi tiet trong tai lieu chinh thuc (da kiem tra
// docs.mistral.ai/capabilities/batch, docs.mistral.ai/api/endpoint/batch, va
// cookbook OCR-batch rieng, 2026-07-12) - CHUA THE tao job that de xac nhan
// (free tier bi chan 402 ngay buoc tao job, chua bao gio thuc su chay duoc
// den buoc doc ket qua). parseResultLine() duoi day la SUY LUAN tot nhat
// theo quy uoc pho bien cua batch API (custom_id + response.body, kieu
// OpenAI/da so provider khac dung) - BAT BUOC kiem tra lai dinh dang THAT cua
// 1-2 dong ket qua dau tien ngay khi test lan dau voi tai khoan da bat
// billing (vd console.log(line) truoc khi goi parseResultLine), sua lai ham
// do neu khac thuc te.
const OCR_ENDPOINT = '/v1/ocr';
const POLL_INTERVAL_MS = 3000;
// BCTC 3 bang (~12 trang) qua duong dong bo hien tai chi mat vai chuc giay -
// 2 gio la du du phong lon so voi muc do can thiet that su, khong can dung
// mac dinh 24h cua Mistral (job ket thuc "TIMEOUT_EXCEEDED" som hon neu that
// su bi ket, thay vi cho ca ngay moi biet).
const JOB_TIMEOUT_HOURS = 2;

type MistralBatchJobStatus = 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT_EXCEEDED' | 'CANCELLATION_REQUESTED' | 'CANCELLED';

interface MistralBatchJob {
  id: string;
  status: MistralBatchJobStatus;
  output_file: string | null;
  error_file: string | null;
  total_requests: number;
  succeeded_requests: number;
  failed_requests: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mistralRequest<T>(path: string, apiKey: string, init: RequestInit): Promise<T> {
  const response = await fetch(`https://api.mistral.ai${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, ...(init.headers ?? {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `Mistral API loi (${response.status}) tai ${path}`;
    throw new Error(message);
  }
  return data as T;
}

async function downloadFileContent(fileId: string, apiKey: string): Promise<string> {
  // Duong dan tai noi dung file (/v1/files/{id}/content) suy theo quy uoc
  // REST chuan cua Mistral (giong /v1/files/{id} de lay metadata) - cung
  // CHUA duoc xac nhan qua test that (cung ly do 402 o tren), kiem tra lai
  // cung luc voi parseResultLine() neu gap loi 404 luc test that.
  const response = await fetch(`https://api.mistral.ai/v1/files/${fileId}/content`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`Tai output_file that bai (HTTP ${response.status})`);
  return response.text();
}

// Xem CANH BAO QUAN TRONG o dau file - thu ca 2 kha nang hinh dang pho bien
// nhat cho 1 dong ket qua batch: (a) { custom_id, response: { body: {...} } }
// (kieu OpenAI va da so provider khac) hoac (b) { custom_id, body: {...} }
// (mot so provider dung lai chinh dinh dang cua REQUEST). Neu ca 2 deu khong
// khop, nem loi RO RANG kem theo du lieu tho thay vi am tham doan bua/tra ve
// ket qua rong - de nguoi goi biet NGAY can sua ham nay theo dung dinh dang
// that, khong bi che giau boi 1 loi "khong co trang nao" khong ro nguyen nhan.
function parseResultLine(line: string, jobId: string): MistralOcrResult {
  const parsed = JSON.parse(line);
  const body = parsed?.response?.body ?? parsed?.body ?? parsed?.response ?? null;
  if (!body || !Array.isArray(body.pages)) {
    throw new Error(
      `Mistral batch job ${jobId}: khong doc duoc dinh dang dong ket qua (dinh dang chua duoc kiem chung that - xem canh bao dau file lib/ai/mistral-ocr-batch.ts, can sua parseResultLine()). Du lieu tho (500 ky tu dau): ${line.slice(0, 500)}`
    );
  }
  const pages = body.pages as MistralOcrPage[];
  return { pages, usage: body.usage_info ?? body.usage };
}

export interface CallMistralOcrBatchOptions {
  // So trang can OCR (0-based) - giong het CallMistralOcrOptions cua
  // callMistralOcr (mistral-ocr.ts), giu nguyen dinh dang de doi qua lai de
  // dang.
  pages?: number[];
}

// Drop-in thay callMistralOcr (./mistral-ocr.ts) khi da bat billing tren tai
// khoan Mistral - hien CHUA duoc goi o dau trong pipeline chinh
// (lib/export/financial-statements.ts van dung callMistralOcr dong bo nhu
// cu), chi ton tai san sang de doi 1 dong import sau nay.
//
// KHAC callMistralOcr: khong can "paced()" (gioi han 1 request/giay cua free
// tier, xem mistral-ocr.ts) - tai khoan da bat billing co gioi han rate cao
// hon han (chua do dac chinh xac, kiem tra lai neu gap 429 khi dung that).
// Cung khong retry loi mang tam thoi kieu MAX_NETWORK_RETRIES nhu ban dong
// bo - moi buoc (tao job/poll/tai file) deu la request rieng, that bai o
// buoc nao se nem loi ngay, nguoi goi (financial-statements.ts, khi noi vao
// that) da co san retry o tang cao hon (extractWithGroupCheckRetry) de xu ly.
export async function callMistralOcrBatch(filePath: string, options?: CallMistralOcrBatchOptions): Promise<MistralOcrResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('Thieu MISTRAL_API_KEY');

  const buffer = await readFile(filePath);
  const base64Pdf = buffer.toString('base64');
  const model = process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest';

  // "1 job = 1 bao cao" nen CHI 1 dong request duy nhat - gui INLINE
  // (requests[], khong can upload file JSONL rieng qua POST /v1/files nhu
  // khi gop nhieu request/job - Mistral cho phep inline toi 10k request, 1
  // la qua du) - don gian hoa dang ke, khong can buoc upload+quan ly file
  // rieng cho PHIA REQUEST (van can tai file cho PHIA KET QUA, xem duoi).
  const ocrRequestBody = {
    model,
    document: { type: 'document_url', document_url: `data:application/pdf;base64,${base64Pdf}` },
    ...(options?.pages ? { pages: options.pages } : {}),
    include_image_base64: false,
  };

  const job = await mistralRequest<MistralBatchJob>('/v1/batch/jobs', apiKey, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: OCR_ENDPOINT,
      model,
      timeout_hours: JOB_TIMEOUT_HOURS,
      requests: [{ custom_id: '0', body: ocrRequestBody }],
    }),
  });

  let current = job;
  while (current.status === 'QUEUED' || current.status === 'RUNNING') {
    await sleep(POLL_INTERVAL_MS);
    current = await mistralRequest<MistralBatchJob>(`/v1/batch/jobs/${job.id}`, apiKey, { method: 'GET' });
  }

  if (current.status !== 'SUCCESS' || !current.output_file) {
    throw new Error(
      `Mistral batch job ${job.id} ket thuc voi trang thai ${current.status} (${current.failed_requests}/${current.total_requests} request loi) - khong co output_file de doc.`
    );
  }

  const outputText = await downloadFileContent(current.output_file, apiKey);
  const firstLine = outputText.trim().split('\n')[0]; // "1 job = 1 request" nen chi co dung 1 dong ket qua
  if (!firstLine) throw new Error(`Mistral batch job ${job.id} tra ve output_file rong.`);

  return parseResultLine(firstLine, job.id);
}
