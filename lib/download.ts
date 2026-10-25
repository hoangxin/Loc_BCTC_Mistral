import { createWriteStream } from 'fs';
import { rm } from 'fs/promises';
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

// Loi "da tai qua DOWNLOAD_TIMEOUT_MS" - tach thanh lop rieng (2026-10-25) de
// VONG TAI BU cuoi lan chay (lib/pipeline.ts) nhan ra va KHONG thu lai: moi
// lan thu lai loai nay ton them tron 30 phut cho dung 1 bao cao, trong khi cac
// loi tai khac (520/522/525/aborted) hong trong vai giay nen thu lai rat re.
export class DownloadTimeoutError extends Error {}

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
//
// SUA 2026-10-25 (8 bao cao Q3/2026 KKC/SPB/TOP/THS/PJC/HAH/PV2/SMT mat trong
// lan chay 24/10): lan nay retry DA chay dung (log co du "that bai lan 1/3",
// "lan 2/3"), nhung HET 3 lan ma CDN van hong - suot ~25 phut lien tuc
// (08:49-09:13) static2.vietstock.vn tra ve xen ke 520/522/525 va cat ket noi
// giua chung ("aborted") cho RAT NHIEU ma, phan lon qua duoc o lan 2-3. Day
// la Cloudflare bao origin Vietstock dang qua tai/chet tam thoi (520 = origin
// tra ve phan hoi khong hop le, 522 = het thoi gian bat tay, 525 = bat tay
// SSL hong) chu khong phai file khong ton tai. 3 lan thu don trong ~30 giay
// deu roi tron ven vao cung 1 cua so nghen.
//
// Doi sang backoff DAI HON HAN (6 lan, cho 3s/10s/30s/60s/120s + jitter) de
// lan thu cuoi cach lan dau ~4 phut - du de vuot qua mot nhip nghen ngan ma
// VAN an toan voi timeout-minutes: 120 cua workflow (lan chay 24/10 het 32
// phut; chi cac bao cao LOI moi phai cho, va 5 worker van chay song song).
// Tai file khong ton phi nen dai hon o day khong co rui ro chi phi. Truong
// hop nghen keo dai han ca so lan nay da co them 1 VONG TAI BU cuoi lan chay
// (lib/pipeline.ts, retryDownloadFailures).
//
// Export de lib/custom-source.ts (cung tai tu CHINH CDN do, cung chay trong
// GitHub Actions qua scripts/run-fetch.ts) dung CHUNG 1 bo tham so - truoc day
// no lang le an theo mac dinh 3 lan cua withTransientRetry, dung kieu "sua 1
// noi, bo quen noi con lai" da gay su co 404 hang loat 2026-10-20.
export const DOWNLOAD_RETRY_ATTEMPTS = 6;
export const DOWNLOAD_RETRY_DELAYS_MS = [3000, 10000, 30000, 60000, 120000];

// Tai 1 bao cao - dung boi worker-pool "goi dau" tai->giai nen->OCR cua
// lib/pipeline.ts (2026-07-08, xem comment runFetchPipeline).
export async function downloadOne(report: ReportFile, destDir: string): Promise<string> {
  const filePath = join(destDir, buildFileName(report));

  return withTransientRetry(
    async () => {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, DOWNLOAD_TIMEOUT_MS);
      try {
        const response = await axios.get(report.fileUrl, {
          responseType: 'stream',
          headers: BROWSER_DOWNLOAD_HEADERS,
          signal: controller.signal,
        });

        const bytesWritten = await new Promise<number>((resolve, reject) => {
          const writer = createWriteStream(filePath);
          // Dong ca 2 dau khi 1 dau loi - truoc day stream nao con lai van mo
          // (ro ri file handle + ket noi) moi lan retry.
          const fail = (error: unknown) => {
            response.data.destroy();
            writer.destroy();
            reject(error);
          };
          response.data.pipe(writer);
          writer.on('finish', () => resolve(writer.bytesWritten));
          writer.on('error', fail);
          response.data.on('error', fail);
        });

        // Luoi an toan (lop thu 2) chong file ZIP/PDF CUT DOI duoc nhan nham
        // la tai xong - khi do loi chi lo ra o buoc giai nen/OCR voi thong bao
        // chang lien quan gi toi mang. Thuc nghiem (scripts/_debug-download-
        // retry-2026-10-25.ts) cho thay Node THUONG tu phat hien va nem
        // 'aborted' khi body ngan hon Content-Length, nen lop nay hiem khi
        // phai ra tay - giu lai vi no re va bat duoc ca truong hop stream ket
        // thuc "sach" ma Node khong than phien.
        // Doi chieu voi Content-Length - bo qua khi khong co header do hoac
        // khi body da bi nen (axios tu giai nen nen so byte ghi ra se LON hon
        // Content-Length, khong so sanh duoc).
        const declaredLength = Number(response.headers['content-length']);
        if (
          !response.headers['content-encoding'] &&
          Number.isFinite(declaredLength) &&
          declaredLength > 0 &&
          bytesWritten < declaredLength
        ) {
          const error: NodeJS.ErrnoException = new Error(
            `Tai thieu du lieu: chi nhan ${bytesWritten}/${declaredLength} byte (${report.fileUrl})`
          );
          error.code = 'ECONNRESET'; // de isTransientNetworkError cho thu lai
          throw error;
        }

        return filePath;
      } catch (error) {
        // Xoa phan file da ghi dang do - lan thu sau ghi de tu dau nen khong
        // bat buoc, nhung neu HET luot thu thi file cut doi nay con nam lai
        // trong data/reports va co the bi buoc sau nhat nham (resolveReport
        // SourceFiles quet thu muc) hoac lam phinh thu muc lam viec.
        await rm(filePath, { force: true }).catch(() => {});
        // Qua han DOWNLOAD_TIMEOUT_MS thi loi nem ra cung mang hinh dang "loi
        // mang tam thoi" (axios CanceledError, hoac `Error: aborted` tu stream
        // khi controller.abort() cat giua chung) - neu de nguyen, isTransient*
        // se cho retry 3 lan x 30 phut = 90 phut, vuot han timeout-minutes: 60
        // cua GitHub Actions. Doi thanh loi RO RANG, KHONG retry.
        if (timedOut) {
          throw new DownloadTimeoutError(
            `Tai file qua ${Math.round(DOWNLOAD_TIMEOUT_MS / 60000)} phut chua xong (${report.fileUrl}) - dung tai, khong thu lai.`
          );
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
    {
      attempts: DOWNLOAD_RETRY_ATTEMPTS,
      delaysMs: DOWNLOAD_RETRY_DELAYS_MS,
      retryNotFound: true,
      onRetry: (error, attempt, delayMs) =>
        console.warn(
          `[download] ${report.stockCode} ${report.fileUrl}: that bai lan ${attempt}/${DOWNLOAD_RETRY_ATTEMPTS} (${
            error instanceof Error ? error.message : String(error)
          }) - cho ${Math.round(delayMs / 1000)}s roi thu lai...`
        ),
    }
  );
}
