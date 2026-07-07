import { readFile } from 'fs/promises';

// Client Mistral OCR (API rieng cua Mistral, endpoint /v1/ocr - KHONG qua
// OpenRouter) - thay the hoan toan Qwen vision (lib/ai/qwen-vision.ts, van con
// giu file nhung khong con noi nao goi) tu 2026-07-05, sau khi test that cho
// thay ket qua chinh xac hon nhieu (0 loi kiem tra cheo tren 2/2 bao cao that
// da test, xem README/memory) va re hon.

// Tu dong thu lai khi gap loi MANG/TAM THOI (mat ket noi giua chung, response
// bi cat cut khong con la JSON hop le, rate limit, loi server 5xx) - GIONG HET
// pattern da dung cho Qwen vision (lib/ai/qwen-vision.ts), ap dung lai o day
// theo yeu cau user 2026-07-05 khi clone project nay: chay hang loat khong
// giam sat thi mat mang tam thoi khong duoc lam mat ca 1 bao cao. KHONG retry
// loi 4xx khac (vd sai API key, request sai dinh dang) vi thu lai cung se loi
// y het, chi ton thoi gian - fail ngay cho cac loi do.
const MAX_NETWORK_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mistral OCR free tier: toi da 1 request/GIAY theo API key (xac nhan tu
// user 2026-07-08) - vi pham la bi 429 (xem isRetryableStatus duoi), roi lai
// cham vao RETRY_DELAY_MS o tren, TON THOI GIAN hon la cu gian cach dung tu
// dau. Hang doi FIFO nay dam bao MOI request (moi worker cua
// EXTRACT_CONCURRENCY, lib/report-extract.ts, ke ca cac vong "OCR probe" goi
// lien tiep cho 1 bao cao - lib/export/financial-statements.ts) deu di qua
// DUNG 1 diem nghen nay truoc khi bam ra ngoai, khong phu thuoc so luong
// worker/goi dong thoi tu ben ngoai.
const MIN_DISPATCH_INTERVAL_MS = 1000;
let lastDispatchAt = 0;
let dispatchQueue: Promise<void> = Promise.resolve();

function paced<T>(fn: () => Promise<T>): Promise<T> {
  const turn = dispatchQueue.then(async () => {
    const wait = Math.max(0, lastDispatchAt + MIN_DISPATCH_INTERVAL_MS - Date.now());
    if (wait > 0) await sleep(wait);
    lastDispatchAt = Date.now();
  });
  // Giu hang doi song ke ca khi luot truoc loi (turn tu no khong bao gio
  // reject - chi cong doan sleep/gan lastDispatchAt) - "catch" o day chi de
  // phong ngua, khong che loi that su cua fn (duoc tra qua turn.then(fn)).
  dispatchQueue = turn.catch(() => {});
  return turn.then(fn);
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

// Danh dau rieng loi KHONG nen retry (vd 400/401/403 - request/key sai, thu
// lai cung se loi y het) de outer catch phia duoi biet DUNG lai ngay, khong
// nham lan voi loi mang/loi tam thoi (nen retry).
class NonRetryableError extends Error {}

export interface MistralOcrPage {
  index: number;
  markdown: string;
}

export interface MistralOcrResult {
  pages: MistralOcrPage[];
  usage: unknown;
}

export interface CallMistralOcrOptions {
  // So trang can OCR (0-based, dung dinh dang cua Mistral API) - bo qua neu
  // muon OCR toan bo tai lieu.
  pages?: number[];
}

// filePath: duong dan file PDF that tren dia - doc va tu encode base64, goi
// truc tiep den api.mistral.ai (KHONG qua OpenRouter, khac voi qwen-vision.ts).
export async function callMistralOcr(filePath: string, options?: CallMistralOcrOptions): Promise<MistralOcrResult> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('Thieu MISTRAL_API_KEY');
  }

  const buffer = await readFile(filePath);
  const base64Pdf = buffer.toString('base64');

  const body = JSON.stringify({
    model: process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest',
    document: { type: 'document_url', document_url: `data:application/pdf;base64,${base64Pdf}` },
    ...(options?.pages ? { pages: options.pages } : {}),
    include_image_base64: false,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_NETWORK_RETRIES; attempt++) {
    try {
      const response = await paced(() =>
        fetch('https://api.mistral.ai/v1/ocr', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
          body,
        })
      );

      // response.json() co the tu nem loi neu ket noi bi cat giua chung (body
      // khong con la JSON hop le) - cung duoc coi la loi mang, thu lai.
      const data = await response.json();

      if (!response.ok) {
        const message = data?.error?.message || `Mistral OCR request failed (${response.status})`;
        if (!isRetryableStatus(response.status)) {
          throw new NonRetryableError(message);
        }
        throw new Error(message);
      }

      const pages = (data.pages ?? []) as MistralOcrPage[];
      if (pages.length === 0) {
        throw new Error('Mistral OCR tra ve khong co trang nao');
      }

      return { pages, usage: data.usage_info ?? data.usage };
    } catch (error) {
      if (error instanceof NonRetryableError) throw error;
      lastError = error;
      if (attempt < MAX_NETWORK_RETRIES - 1) {
        console.warn(`Mistral OCR loi mang/tam thoi (thu ${attempt + 1}/${MAX_NETWORK_RETRIES}), thu lai sau ${RETRY_DELAY_MS}ms:`, error);
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}
