import { createWriteStream } from 'fs';
import { join } from 'path';
import axios from 'axios';
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

// Tai 1 bao cao - dung boi worker-pool "goi dau" tai->giai nen->OCR cua
// lib/pipeline.ts (2026-07-08, xem comment runFetchPipeline).
export async function downloadOne(report: ReportFile, destDir: string): Promise<string> {
  const filePath = join(destDir, buildFileName(report));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await axios.get(report.fileUrl, {
      responseType: 'stream',
      headers: { 'User-Agent': 'Mozilla/5.0' },
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
}
