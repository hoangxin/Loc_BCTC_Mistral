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
// TRAN CHO PHIA CLIENT rieng, THAP HON HAN JOB_TIMEOUT_HOURS (2h) - su co that
// FUEVN100 Q2/2026 (2026-07-18): batch queue cua Mistral bi nghen tam thoi,
// 1 job OCR (12 trang, thuong chi vai chuc giay-vai phut) treo o RUNNING toi
// 58 phut. Vuot tran nay chi nem loi cho DUNG 1 bao cao dang xu ly (lib/
// pipeline.ts da co try/catch rieng tung file, day vao failed[] - KHONG lam
// hong cac worker/bao cao khac dang chay song song, va (2026-07-20) KHONG
// con lam mat tien do cac bao cao ĐÃ xong truoc do nua - xem flushProgress
// trong lib/pipeline.ts + `if: always()` o buoc commit trong .github/
// workflows/fetch-bctc.yml), de worker ranh tay xu ly bao cao tiep theo.
//
// NANG tu 10 len 45 phut (2026-07-20, yeu cau nguoi dung): doi chieu that
// qua Mistral batch-jobs API cho thay trong 1 dot Mistral nghen (cung ngay),
// 14 job bi client bo cuoc o phut thu 10 deu THAT RA van chay tiep va
// SUCCESS sau 23-34 phut tren server Mistral - nghia la da bi TINH PHI nhung
// ket qua bi vut bo hoan toan (khong ai quay lai lay), roi con phai OCR LAI
// (tra tien lan 2) khi user tai lai. 45 phut du du de bat duoc phan lon cac
// truong hop nghen tam thoi kieu nay ma van nam duoi han GH Actions
// timeout-minutes: 60 (co margin ~15 phut cho cac buoc con lai + cac bao cao
// KHAC con lai trong hang doi cua CUNG worker do) - danh doi: neu 1 worker
// gap NHIEU hon 1 bao cao bi nghen trong cung 1 lan chay, van co the vuot
// tran 60 phut cua ca job (xem giai thich rui ro nay da trao doi voi nguoi
// dung), nhung phan tien do cac bao cao/worker KHAC van duoc giu lai nho co
// che flushProgress + if: always() o tren, khong con mat trang nhu truoc.
const MAX_POLL_DURATION_MS = 45 * 60 * 1000;

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

// SUA 2026-07-20 (su co that: 1 bao cao (PSD) bi nem loi ngay lap tuc trong
// luc poll vi Mistral tra ve "503 upstream connect error / reset before
// headers" - 1 lan reset ket noi tam thoi lam mat trang HET job dang OCR do
// (phai OCR lai tu dau, ton tien lan 2), du job thuc te co the van dang chay
// binh thuong ben Mistral. Retry NGAN ngay tai request GET nay (khong tao
// job moi - giong het pattern downloadFileContent o tren), CHI cho loi ro
// rang la tam thoi (5xx hoac fetch/ket noi that bai truoc khi co response) -
// KHONG retry loi khac (vd 400/401) vi do la loi that, retry vo ich.
const POLL_TRANSIENT_RETRY_ATTEMPTS = 3;
const POLL_TRANSIENT_RETRY_DELAY_MS = 5000;
const TRANSIENT_ERROR_PATTERN = /Mistral API loi \(5\d\d\)|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN/;

async function pollJobStatus(jobId: string, apiKey: string): Promise<MistralBatchJob> {
  let lastError: unknown;
  for (let attempt = 0; attempt < POLL_TRANSIENT_RETRY_ATTEMPTS; attempt++) {
    try {
      return await mistralRequest<MistralBatchJob>(`/v1/batch/jobs/${jobId}`, apiKey, { method: 'GET' });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!TRANSIENT_ERROR_PATTERN.test(message)) throw error;
      if (attempt < POLL_TRANSIENT_RETRY_ATTEMPTS - 1) await sleep(POLL_TRANSIENT_RETRY_DELAY_MS);
    }
  }
  throw lastError;
}

// SUA 2026-07-20 (yeu cau nguoi dung, sau su co nghen hang doi keo dai ca
// buoi chieu): khi vuot MAX_POLL_DURATION_MS, HUY LUON job do ben Mistral
// (POST .../cancel - da xac nhan endpoint nay hoat dong dung qua test that
// tay hom nay, tra ve status CANCELLED) thay vi bo mac no chay tiep ngam toi
// khi tu het han JOB_TIMEOUT_HOURS - truoc day 5 job bi bo cuoc kieu nay van
// tiep tuc chay/co the SUCCESS ma khong ai quay lai lay, co nguy co bi tinh
// phi cho ket qua khong bao gio dung den. Best-effort: goi huy that bai
// (vd job vua xong dung luc goi huy) KHONG duoc che mat loi timeout goc -
// chi log rieng, van nem loi timeout nhu binh thuong cho nguoi goi xu ly.
async function cancelJob(jobId: string, apiKey: string): Promise<void> {
  try {
    await mistralRequest(`/v1/batch/jobs/${jobId}/cancel`, apiKey, { method: 'POST' });
  } catch (error) {
    console.error(`Huy job ${jobId} that bai sau khi vuot MAX_POLL_DURATION_MS (bo qua, khong anh huong loi timeout goc)`, error);
  }
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

// Drop-in thay callMistralOcr (./mistral-ocr.ts) - DA la duong OCR chinh
// trong production tu 2026-07-12 (lib/export/financial-statements.ts import
// va goi truc tiep o day; ban dong bo callMistralOcr chi con comment lai lam
// fallback du phong, xem comment dau file financial-statements.ts).
//
// KHAC callMistralOcr: khong can "paced()" (gioi han 1 request/giay cua free
// tier, xem mistral-ocr.ts) - tai khoan da bat billing co gioi han rate cao
// hon han (chua do dac chinh xac, kiem tra lai neu gap 429 khi dung that).
// Tao job/tai output_file da co retry rieng (uploadBatchFile khong, nhung
// downloadFileContent va pollJobStatus co - xem 2 ham do); nguoi goi
// (financial-statements.ts) van co them 1 lop retry o tang cao hon
// (extractWithGroupCheckRetry) cho truong hop that su can OCR lai tu dau.
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
  const pollStartedAt = Date.now();
  while (current.status === 'QUEUED' || current.status === 'RUNNING') {
    if (Date.now() - pollStartedAt > MAX_POLL_DURATION_MS) {
      await cancelJob(job.id, apiKey);
      throw new Error(
        `Mistral batch job ${job.id} qua ${Math.round(MAX_POLL_DURATION_MS / 60000)} phut van con trang thai ${current.status} - dung cho (co the do hang doi batch cua Mistral bi nghen tam thoi), da huy job de tranh bi tinh phi cho ket qua se khong lay ve, coi la loi tam thoi cho bao cao nay.`
      );
    }
    await sleep(POLL_INTERVAL_MS);
    current = await pollJobStatus(job.id, apiKey);
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
