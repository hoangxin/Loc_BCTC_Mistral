import { readFile } from 'fs/promises';
import type { MistralOcrPage, MistralOcrResult } from './mistral-ocr';
import { slicePdfPages } from './pdf-slice';

// DA DUOC DUNG THAT trong pipeline chinh tu sau khi bat billing (xem
// lib/export/financial-statements.ts - import callMistralOcrBatch, ban dong
// bo callMistralOcr chi con la fallback DA COMMENT LAI). Dong comment nay
// TUNG ghi "chua dung o dau" luc file moi viet (2026-07-12, truoc khi doi
// qua that) - GIU LAI SAI qua nhieu lan sua sau do, khien 1 phien debug rieng
// (2026-07-14) doc nham la batch van chi la du phong chua active, di sua
// nham sang goi callMistralOcr (sync) thay vi tim dung nguyen nhan that (loi
// tai output_file /v1/files/{id}/content tra ve 404 - xem downloadFileContent
// duoi day). BAI HOC: LUON grep toan bo codebase tim noi THAT SU import ham
// (khong chi doc 1 comment o dau file) truoc khi ket luan 1 duong code
// dang/khong dang duoc dung.
//
// Cung interface (filePath, options) => Promise<MistralOcrResult> nhu
// callMistralOcr (./mistral-ocr.ts) - giup doi qua lai bang 1 dong import
// khi can (xem memory/reference_mistral_batch_api.md).
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
// CAP NHAT 2026-07-12 (sau khi bat billing, test that voi 5 bao cao Q1/2026):
// Ban dau viet theo huong "1 dong request INLINE" (truong `requests` ngay
// trong body tao job) de don gian, nhung 4/5 bao cao that (SHS/TCB/PVS/ANT)
// bi tu choi HTTP 400 ngay o tang GATEWAY (tra ve trang loi Werkzeug generic,
// khong phai JSON loi cua Mistral) - nguyen nhan: gui NGUYEN VAN file PDF goc
// (base64 hoa CA file 6-24MB, xem lib/ai/pdf-slice.ts) nhung nhet thang vao
// body JSON cua POST /v1/batch/jobs vuot qua gioi han kich thuoc cua endpoint
// nay (endpoint /v1/ocr dong bo chiu duoc size nay, /v1/batch/jobs voi
// inline `requests` thi khong). PVI (bao cao con lai) lot qua co le vi file
// nho hon nguong do.
//
// 2 thay doi de sua (2026-07-12): (1) cat truoc CHI cac trang can OCR bang
// pdf-lib (xem lib/ai/pdf-slice.ts) truoc khi base64 - giam payload tu
// vai chuc MB xuong con duoi 1-2MB cho 12-16 trang; (2) doi tu inline
// `requests` sang dung flow FILE UPLOAD chuan cua Mistral (xac nhan qua
// docs.mistral.ai/api/endpoint/files + api/endpoint/batch + cookbook
// OCR-batch, 2026-07-12): POST /v1/files (multipart, purpose=batch) de lay
// file_id, roi POST /v1/batch/jobs voi `input_files: [file_id]` (KHONG con
// `requests` inline nua).
//
// !!! CON LAI CHUA XAC NHAN: dinh dang TUNG DONG cua file ket qua
// (output_file) - da tim ca 3 trang docs chinh thuc + cookbook nhung khong
// trang nao show vi du cu the. parseResultLine() duoi day van la SUY LUAN
// tot nhat theo quy uoc pho bien (custom_id + response.body, kieu OpenAI) -
// se bao loi RO RANG kem du lieu tho neu sai dinh dang, KHONG am tham tra ve
// rong.
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
  const rawText = await response.text();
  const data = (() => {
    try {
      return JSON.parse(rawText);
    } catch {
      return null;
    }
  })();
  if (!response.ok) {
    // In ca rawText (khong chi data?.error?.message) - vai loi 400 cua Mistral
    // tra ve body khong theo dung dinh dang {error:{message}} nhu ky vong, che
    // mat ly do that neu chi doc field do (xem debug 2026-07-12: 400 tai
    // /v1/batch/jobs khong ro nguyen nhan cho toi khi in rawText).
    const message = data?.error?.message || data?.message || `Mistral API loi (${response.status}) tai ${path}: ${rawText.slice(0, 500)}`;
    throw new Error(message);
  }
  return data as T;
}

interface MistralFileUploadResponse {
  id: string;
}

// Upload 1 file JSONL (noi dung: 1 dong "{custom_id, body}") qua POST
// /v1/files, purpose=batch - THAY the cho truong `requests` inline truoc day
// (xem CAP NHAT 2026-07-12 o dau file). Dung multipart/form-data (KHONG tu
// dat header content-type - de fetch tu sinh boundary dung khi body la
// FormData/Blob) theo dung dinh dang xac nhan tu docs.mistral.ai/api/endpoint/files.
async function uploadBatchFile(jsonlContent: string, apiKey: string): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([jsonlContent], { type: 'application/jsonl' }), 'batch.jsonl');
  form.append('purpose', 'batch');
  const uploaded = await mistralRequest<MistralFileUploadResponse>('/v1/files', apiKey, {
    method: 'POST',
    body: form,
  });
  return uploaded.id;
}

// Duong dan tai noi dung file (/v1/files/{id}/content) - da XAC NHAN dung
// dinh dang qua test that (2026-07-14). NHUNG: job vua chuyen status=SUCCESS
// (output_file da co id) KHONG dam bao noi dung file do da san sang tai NGAY
// - gap that 1 lan HTTP 404 ngay sau khi poll thay SUCCESS, roi thu lai
// (khong tao job moi, chi goi lai endpoint nay) vai giay sau thi tai duoc
// binh thuong (co ve la do tre lan truyen giua 2 he thong noi bo cua Mistral).
// Retry NGAN o day (khong tao job moi - chi lap lai chinh request GET nay,
// khong ton them phi) de tranh nem loi oan cho 1 job THAT SU da OCR xong.
const DOWNLOAD_RETRY_ATTEMPTS = 4;
const DOWNLOAD_RETRY_DELAY_MS = 3000;

async function downloadFileContent(fileId: string, apiKey: string): Promise<string> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < DOWNLOAD_RETRY_ATTEMPTS; attempt++) {
    const response = await fetch(`https://api.mistral.ai/v1/files/${fileId}/content`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (response.ok) return response.text();
    lastStatus = response.status;
    if (attempt < DOWNLOAD_RETRY_ATTEMPTS - 1) await sleep(DOWNLOAD_RETRY_DELAY_MS);
  }
  throw new Error(`Tai output_file that bai (HTTP ${lastStatus}) sau ${DOWNLOAD_RETRY_ATTEMPTS} lan thu`);
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

  const originalBuffer = await readFile(filePath);
  // Cat truoc CHI cac trang can OCR (xem lib/ai/pdf-slice.ts va CAP NHAT
  // 2026-07-12 o dau file) - giam payload tu vai chuc MB xuong con
  // duoi 1-2MB, tranh bi gateway Mistral tu choi HTTP 400 nhu 4/5 bao cao
  // test that ngay 2026-07-12 khi con gui nguyen file goc.
  const pdfBuffer = options?.pages ? await slicePdfPages(originalBuffer, options.pages) : originalBuffer;
  const base64Pdf = pdfBuffer.toString('base64');
  const model = process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest';

  // Tai lieu gui di gio CHI chua dung cac trang can OCR (da cat o tren) nen
  // KHONG con truyen `pages` cho Mistral nua.
  const ocrRequestBody = {
    model,
    document: { type: 'document_url', document_url: `data:application/pdf;base64,${base64Pdf}` },
    include_image_base64: false,
  };

  // "1 job = 1 bao cao" (xem thiet ke o tren) nhung GUI QUA FILE UPLOAD
  // (input_files), khong con inline `requests` nua - xem CAP NHAT 2026-07-12.
  const jsonlContent = JSON.stringify({ custom_id: '0', body: ocrRequestBody });
  const fileId = await uploadBatchFile(jsonlContent, apiKey);

  const job = await mistralRequest<MistralBatchJob>('/v1/batch/jobs', apiKey, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: OCR_ENDPOINT,
      model,
      timeout_hours: JOB_TIMEOUT_HOURS,
      input_files: [fileId],
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
