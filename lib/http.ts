import axios from 'axios';

// NOI DUY NHAT dinh nghia User-Agent + retry loi tam thoi cho MOI request di
// ra ngoai cua du an (Vietstock API, tai file tu static2.vietstock.vn, nguon
// rieng do nguoi dung dan link).
//
// LY DO TACH RA FILE RIENG (2026-10-20, sau su co 6 bao cao Q3/2026 HVT/NNC/
// VLA/PMB/NTC/TCX bi 404 LIEN TIEP 2 lan chay tren GitHub Actions trong khi
// CUNG URL do mo tu may nguoi dung tra ve 200): ngay 2026-07-31 da sua dung
// loi nay mot lan roi - "UA 'Mozilla/5.0' qua ngan/chung chung la dau hieu
// bot pho bien voi WAF/anti-bot" - NHUNG CHI sua trong lib/vietstock-reports.ts,
// con lib/download.ts (buoc TAI FILE THAT) va lib/custom-source.ts van giu
// nguyen UA cu. static2.vietstock.vn nam sau Cloudflare (xac nhan qua header
// `server: cloudflare` trong log GitHub Actions) va Cloudflare co the chan
// bang 404 (khong phai 403) - dung hien tuong da gap. Hang so/logic dung
// chung o day de lan sau sua 1 lan la ap dung cho TAT CA, khong con canh
// "sua 1 noi, bo quen noi con lai".
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Header kem theo cho request TAI FILE tu static2.vietstock.vn - trinh duyet
// that luon gui kem Accept/Accept-Language/Referer; thieu chung la 1 tin hieu
// bot nua ben canh UA.
export const BROWSER_DOWNLOAD_HEADERS: Record<string, string> = {
  'User-Agent': BROWSER_USER_AGENT,
  Accept: '*/*',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: 'https://finance.vietstock.vn/',
};

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface TransientRetryOptions {
  attempts?: number;
  // Cho giua cac lan thu - 1 phan tu cho MOI lan cho (do dai >= attempts-1,
  // thieu thi lay gia tri cuoi cung). Tang dan de vua chiu duoc loi nhay
  // (502/503 thoang qua) vua cho duoc truong hop file vua len Vietstock chua
  // kip day ra het cac node CDN.
  delaysMs?: number[];
  // Xe dich moi thoi gian cho +/- JITTER_RATIO mot cach ngau nhien. MAC DINH
  // BAT (2026-10-25): pipeline chay PIPELINE_CONCURRENCY=5 worker song song
  // vao CUNG 1 CDN; khi CDN nghen, ca 5 worker cung that bai gan nhu cung
  // luc, roi cung ngu dung 3s/10s va cung dap lai 1 luot - tu minh tao ra
  // dung kieu tai dong bo ma CDN dang khong chiu noi. Jitter pha vo dong bo
  // do. Tat (false) chi khi can thoi gian cho tien doan duoc trong test.
  jitter?: boolean;
  // Coi ca 404/403/429 la loi TAM THOI. CHI bat cho buoc TAI FILE tu CDN:
  // 1 file da duoc chinh API Vietstock liet ke ma tra 404 gan nhu luon la
  // chan/chua propagate, khong phai "khong ton tai that". KHONG bat cho cac
  // endpoint API (404 o do la loi that, retry chi ton thoi gian).
  retryNotFound?: boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_DELAYS_MS = [3000, 10000];
const JITTER_RATIO = 0.4; // thoi gian cho that = delay * (0.8 .. 1.2)

// SUA 2026-10-23 (su co that: 9 bao cao Q3/2026 - VOS/HUG/THT/HVX/MCH/PAT/NBP
// va truoc do OIL/SD2/TA9 Q2 - that bai voi loi tron loc "aborted", KHONG he
// co dong log "that bai lan 1/3 - thu lai..." nao, tuc la retry CHUA TUNG
// chay): khi tai file bang responseType 'stream', axios da resolve NGAY luc
// nhan duoc header; moi su co SAU do (ket noi bi CDN cat giua chung) duoc Node
// nem ra tu CHINH STREAM response duoi dang `Error: aborted` (code ECONNRESET)
// - mot Error THUONG, KHONG phai AxiosError. Ham nay truoc day
// `if (!axios.isAxiosError(error)) return false` nen coi day la loi vinh vien,
// bo luon bao cao do du chi can thu lai la duoc.
//
// Nhan them cac loi MANG thuan tuy khong qua axios: nhan dien theo `code`
// (ECONNRESET/ECONNABORTED/EPIPE/ETIMEDOUT/EAI_AGAIN/UND_ERR_*) hoac theo
// message rat dac trung cua Node ('aborted', 'socket hang up', 'terminated',
// 'fetch failed', 'Premature close'). KHONG bat tat ca Error (vd loi ghi dia,
// loi logic) - nhung loi do thu lai cung vo ich.
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNABORTED',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ERR_STREAM_PREMATURE_CLOSE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);
const TRANSIENT_NETWORK_MESSAGE = /^(aborted|socket hang up|terminated|fetch failed|Premature close)$/i;

export function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code && TRANSIENT_NETWORK_CODES.has(code)) return true;
  return TRANSIENT_NETWORK_MESSAGE.test(error.message.trim());
}

export function isTransientAxiosError(error: unknown, retryNotFound = false): boolean {
  if (!axios.isAxiosError(error)) return isTransientNetworkError(error);
  if (error.response) {
    const status = error.response.status;
    if (status >= 500 && status < 600) return true;
    if (retryNotFound && (status === 403 || status === 404 || status === 429)) return true;
    return false;
  }
  return true; // loi mang/timeout/reset truoc khi co response - cung coi la tam thoi
}

// Retry NGAN, CO TRAN CUNG cho loi tam thoi. Khong bao gio retry vo han: so
// lan toi da = attempts (mac dinh 3), ke ca khi onRetry nem loi.
export async function withTransientRetry<T>(fn: () => Promise<T>, options: TransientRetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  const delays = options.delaysMs ?? DEFAULT_DELAYS_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientAxiosError(error, options.retryNotFound)) throw error;
      if (attempt >= attempts - 1) break;
      const baseDelay = delays[Math.min(attempt, delays.length - 1)];
      const delayMs =
        options.jitter === false ? baseDelay : Math.round(baseDelay * (1 - JITTER_RATIO / 2 + Math.random() * JITTER_RATIO));
      options.onRetry?.(error, attempt + 1, delayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
