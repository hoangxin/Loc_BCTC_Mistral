import { createWriteStream } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { BROWSER_DOWNLOAD_HEADERS, withTransientRetry } from './http';
import type { ReportFile } from './vietstock-reports';

export interface DownloadResult {
  report: ReportFile;
  filePath: string | null;
  error?: string;
}

// File goc tren static2.vietstock.vn da co ten ro rang (vd
// "CTD_Baocaotaichinh_Q3_2026_Hopnhat.pdf") - giu nguyen, chi doi thu muc dich.
//
// SUA 2026-07-31 (hang loat bao cao Q2/2026 loi "dinh dang file khong ho tro
// (.pdf?ver=xxxxxxxx)"): Vietstock bat dau gan query string cache-busting
// (?ver=...) vao fileUrl. `split('/').pop()` giu nguyen ca query string trong
// ten file luu tren dia, khien extname() sau nay doc ra ".pdf?ver=xxxxxxxx"
// thay vi ".pdf" va bi resolveReportSourceFiles (lib/report-source.ts) coi la
// dinh dang khong nhan dien duoc. Dung `new URL().pathname` de chi lay phan
// duong dan, bo query string/hash.
function buildFileName(report: ReportFile): string {
  let pathname: string;
  try {
    pathname = new URL(report.fileUrl).pathname;
  } catch {
    pathname = report.fileUrl.split('?')[0].split('#')[0];
  }
  const originalName = pathname.split('/').pop() || `${report.stockCode}${report.fileExt}`;
  return decodeURIComponent(originalName);
}

// SUA 2026-07-20 (yeu cau nguoi dung, sau su co 1 bao cao "treo" khong ro
// buoc nao): axios `timeout` KHONG bao het thoi gian tai voi responseType
// 'stream' - no chi tinh toi luc nhan duoc HEADER response, sau do promise da
// resolve va axios KHONG con giam sat gi nua, nen 1 stream tai nhoi tung chut
// (server Vietstock treo giua chung) van co the cho VO THOI HAN. Dung
// AbortController de gioi han CA header lan toan bo qua trinh ghi file.
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;

// SUA 2026-10-20 (6 bao cao Q3/2026 HVT/NNC/VLA/PMB/NTC/TCX bao "Request
// failed with status code 404" o CA 2 lan chay GitHub Actions 05:15 va 05:35,
// trong khi CUNG URL do mo tu may nguoi dung tra ve 200 OK):
//
//  1. UA: file nay van gui 'Mozilla/5.0' - dung cai UA da duoc ket luan la
//     "dau hieu bot voi WAF/anti-bot" va DA DOI trong lib/vietstock-reports.ts
//     tu 2026-07-31, nhung dot do BO QUEN file nay. static2.vietstock.vn nam
//     sau Cloudflare (header `server: cloudflare` trong log Actions) va
//     Cloudflare co the chan bang 404 chu khong phai 403. Dung header trinh
//     duyet day du dung chung tu lib/http.ts.
//  2. Retry: truoc day KHONG he co retry nao - 1 lan 404/503 la mat han bao
//     cao do cho ca lan chay. Bay gio retry co TRAN CUNG (3 lan, cho 3s roi
//     10s) va CO tinh ca 404/403/429 la tam thoi - RIENG cho buoc tai file:
//     file nay vua duoc CHINH API Vietstock liet ke ra nen 404 gan nhu luon
//     la bi chan/CDN chua propagate, khong phai "khong ton tai that". Buoc
//     goi API /data/* van KHONG retry 404 (xem API_RETRY o vietstock-reports.ts).
//     Tai file KHONG TON PHI (khac han OCR - xem CLAUDE.md) nen retry o day
//     khong co rui ro chi phi; tran cung 3 lan de khong thanh vong lap vo han.
const DOWNLOAD_RETRY_ATTEMPTS = 3;
const DOWNLOAD_RETRY_DELAYS_MS = [3000, 10000];

// Tai 1 bao cao - dung boi worker-pool "goi dau" tai->giai nen->OCR cua
// lib/pipeline.ts (2026-07-08, xem comment runFetchPipeline).
export async function downloadOne(report: ReportFile, destDir: string): Promise<string> {
  const filePath = join(destDir, buildFileName(report));

  return withTransientRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
      try {
        const response = await axios.get(report.fileUrl, {
          responseType: 'stream',
          headers: BROWSER_DOWNLOAD_HEADERS,
          signal: controller.signal,
        });

        await new Promise<void>((resolve, reject) => {
          const writer = createWriteStream(filePath);
          response.data.pipe(writer);
          writer.on('finish', () => resolve());
          writer.on('error', reject);
          response.data.on('error', reject);
        });

        return filePath;
      } finally {
        clearTimeout(timer);
      }
    },
    {
      attempts: DOWNLOAD_RETRY_ATTEMPTS,
      delaysMs: DOWNLOAD_RETRY_DELAYS_MS,
      retryNotFound: true,
      onRetry: (error, attempt) =>
        console.warn(
          `[download] ${report.stockCode} ${report.fileUrl}: that bai lan ${attempt}/${DOWNLOAD_RETRY_ATTEMPTS} (${
            error instanceof Error ? error.message : String(error)
          }) - thu lai...`
        ),
    }
  );
}
