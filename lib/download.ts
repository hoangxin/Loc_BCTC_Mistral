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
function buildFileName(report: ReportFile): string {
  const originalName = report.fileUrl.split('/').pop() || `${report.stockCode}${report.fileExt}`;
  return decodeURIComponent(originalName);
}

// Tai 1 bao cao - dung boi worker-pool "goi dau" tai->giai nen->OCR cua
// lib/pipeline.ts (2026-07-08, xem comment runFetchPipeline).
export async function downloadOne(report: ReportFile, destDir: string): Promise<string> {
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
