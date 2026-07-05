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
      const response = await fetch('https://api.mistral.ai/v1/ocr', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body,
      });

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
