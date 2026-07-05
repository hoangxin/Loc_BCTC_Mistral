import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import axios from 'axios';
import type { ReportFile } from './vietstock-reports';

const DOWNLOAD_CONCURRENCY = 5;

export interface DownloadResult {
  report: ReportFile;
  filePath: string | null;
  error?: string;
}

// File goc tren static2.vietstock.vn da co ten ro rang (vd
// "CTD_Baocaotaichinh_Q3_2026_Hopnhat.pdf") - giu nguyen, chi doi thu muc dich.
function buildFileName(report: ReportFile): string {
  const originalName = report.fileUrl.split('/').pop() || `${report.stockCode}${report.fileExt}`;
  return decodeURIComponent(originalName);
}

async function downloadOne(report: ReportFile, destDir: string): Promise<string> {
  const filePath = join(destDir, buildFileName(report));

  const response = await axios.get(report.fileUrl, {
    responseType: 'stream',
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  await new Promise<void>((resolve, reject) => {
    const writer = createWriteStream(filePath);
    response.data.pipe(writer);
    writer.on('finish', () => resolve());
    writer.on('error', reject);
  });

  return filePath;
}

export async function downloadReports(reports: ReportFile[], destDir: string): Promise<DownloadResult[]> {
  await mkdir(destDir, { recursive: true });

  const results: DownloadResult[] = new Array(reports.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < reports.length) {
      const index = nextIndex++;
      const report = reports[index];
      try {
        const filePath = await downloadOne(report, destDir);
        results[index] = { report, filePath };
      } catch (error) {
        console.error('download error', report.stockCode, report.fileUrl, error);
        results[index] = { report, filePath: null, error: error instanceof Error ? error.message : String(error) };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, reports.length) }, worker));
  return results;
}
