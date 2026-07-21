import { readFile } from 'fs/promises';
import { slicePdfPages } from './pdf-slice';

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

// SUA 2026-07-21 (yeu cau nguoi dung, sau khi tu tra admin console Mistral):
// gioi han THAT cua "Document OCR rate limits" la 1.250 TRANG/PHUT (theo SO
// TRANG tieu thu, khong phai so request) - khac han gia dinh cu "1 request/
// giay" (ghi 2026-07-08, TRUOC khi bat billing 2026-07-12, chua bao gio kiem
// chung lai). Gia dinh cu vua SAI LOAI gioi han vua LANG PHI ngan sach that:
// 1 request/giay voi lo 10-12 trang chi dat ~600-720 trang/phut (~50-58%
// ngan sach that), lo mo rong 2 trang/lan con te hon (~120 trang/phut).
//
// Doi sang dieu tiet theo TONG SO TRANG trong CUA SO TRUOT 60 GIAY, dat duoi
// nguong that 1 chut (1.100, chua margin ~12%) - van dung 1 hang doi FIFO
// dung chung (dispatchQueue) nhu co che cu de dam bao MOI request (moi worker
// cua PIPELINE_CONCURRENCY, lib/pipeline.ts) deu di qua DUNG 1 diem nghen
// nay - nhung gio cho phep NHIEU request lien tiep khong can cho neu ngan
// sach con du (khac han "1 request/giay" ep TUAN TU tuyet doi ke ca khi ngan
// sach con thua), tan dung dung ngan sach that thay vi ep cham 1 cach vo co.
const PAGE_RATE_LIMIT_PER_MINUTE = 1100;
const PAGE_RATE_WINDOW_MS = 60_000;

// Nhat ky (thoi diem, so trang) cua tung lan da duoc "cho phep gui" trong cua
// so 60s gan nhat - dung de tinh TONG so trang dang tinh vao gioi han, thay
// vi chi 1 bien lastDispatchAt nhu co che cu (khong the bieu dien "ngan sach
// con lai" theo kieu cu).
let dispatchLog: { at: number; pages: number }[] = [];
let dispatchQueue: Promise<void> = Promise.resolve();

function sumPagesInWindow(now: number): number {
  dispatchLog = dispatchLog.filter((entry) => now - entry.at < PAGE_RATE_WINDOW_MS);
  return dispatchLog.reduce((sum, entry) => sum + entry.pages, 0);
}

async function waitForPageBudget(pageCount: number): Promise<void> {
  for (;;) {
    const now = Date.now();
    const used = sumPagesInWindow(now);
    if (used + pageCount <= PAGE_RATE_LIMIT_PER_MINUTE || dispatchLog.length === 0) {
      // Truong hop dispatchLog rong nhung pageCount MOT MINH da vuot ngan
      // sach (vd 1 tai lieu can OCR hon 1.100 trang cung luc, chua tung gap
      // that nhung phong truoc de khong bao gio treo vo han cho) - van cho
      // qua NGAY (khong the cho "du" duoc), Mistral se tu tra 429 neu that su
      // vuot, retry mang o callMistralOcr se xu ly tiep.
      dispatchLog.push({ at: now, pages: pageCount });
      return;
    }
    const oldest = dispatchLog[0];
    const waitMs = Math.max(50, PAGE_RATE_WINDOW_MS - (now - oldest.at) + 50);
    await sleep(waitMs);
  }
}

function paced<T>(pageCount: number, fn: () => Promise<T>): Promise<T> {
  const turn = dispatchQueue.then(() => waitForPageBudget(pageCount));
  // Giu hang doi song ke ca khi luot truoc loi (turn tu no khong bao gio
  // reject - chi cong doan cho ngan sach) - "catch" o day chi de phong ngua,
  // khong che loi that su cua fn (duoc tra qua turn.then(fn)).
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

  const originalBuffer = await readFile(filePath);
  // Cat truoc con dung cac trang can OCR (xem lib/ai/pdf-slice.ts) - KHONG con
  // truyen `pages` cho Mistral nua vi tai lieu gui di gio da CHI chua dung cac
  // trang do, dinh so lai tu 0.
  const pdfBuffer = options?.pages ? await slicePdfPages(originalBuffer, options.pages) : originalBuffer;
  const base64Pdf = pdfBuffer.toString('base64');

  // So trang THAT SU se OCR - dung de tru vao ngan sach 1.100 trang/phut
  // (paced() o tren). CHUA xu ly truong hop khong truyen `options.pages` (OCR
  // toan van) - hien CHI co lib/export/full-document.ts goi kieu nay, va ham
  // do la DEAD CODE (khong noi nao trong production goi, xem comment dau file
  // do) nen khong can tinh dung ngay bay gio (theo yeu cau nguoi dung
  // 2026-07-21: chua dung toi thi chua lam). Neu sau nay kich hoat lai
  // full-document.ts, PHAI doc so trang that cua file goc (vd qua pdf-lib
  // PDFDocument.load(originalBuffer).getPageCount()) truoc dong nay, khong
  // duoc de nguyen 0 - de 0 se lam paced() coi lan goi OCR TOAN VAN (co the
  // hang chuc/tram trang) nhu khong ton ngan sach nao, pha vo dung muc dich
  // gioi han 1.100 trang/phut.
  const pageCount = options?.pages ? options.pages.length : 0;

  const body = JSON.stringify({
    model: process.env.MISTRAL_OCR_MODEL || 'mistral-ocr-latest',
    document: { type: 'document_url', document_url: `data:application/pdf;base64,${base64Pdf}` },
    include_image_base64: false,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_NETWORK_RETRIES; attempt++) {
    try {
      const response = await paced(pageCount, () =>
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
