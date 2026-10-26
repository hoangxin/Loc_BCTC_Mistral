// Tai 1 bao cao (KHONG OCR, khong ton phi) roi in BAN DO TRANG tu TEXT LAYER:
// moi trang 1 dong, kem dau hieu bang chinh (BCDKT/KQKD/LCTT/Thuyet minh) tim
// thay trong trang do. Dung de biet 3 bang chinh nam o trang nao khi 1 bao cao
// ra rong - vd ho so xep Thuyet minh LEN TRUOC (SD6, INC).
//   npx tsx scripts/_debug-page-map-2026-10-26.ts <quy> <thu-muc-tai-ve> <ma CK...>
// Import 'pdf-parse/worker' TRUOC 'pdf-parse' - cung thu tu bat buoc nhu
// lib/pdf-text.ts (xem comment dau file do).
import { CanvasFactory } from 'pdf-parse/worker';
import { PDFParse } from 'pdf-parse';
import { readFile, mkdir } from 'fs/promises';
import { resolveQuarterTerm, fetchReportFilesForTerm } from '../lib/vietstock-reports';
import { filterReports } from '../lib/filter';
import { downloadOne } from '../lib/download';
import { resolveReportSourceFiles } from '../lib/report-source';

const [quarterArg, destDir, ...codes] = process.argv.slice(2);
if (!quarterArg || !destDir || codes.length === 0) throw new Error('Cach dung: <quy> <thu-muc> <ma CK...>');

const MARKERS: { label: string; test: RegExp }[] = [
  { label: 'BCDKT', test: /BẢNG\s+CÂN\s+ĐỐI\s+KẾ\s+TOÁN|CÂN\s+ĐỐI\s+KẾ\s+TOÁN/i },
  { label: 'KQKD', test: /KẾT\s+QUẢ\s+(HOẠT\s+ĐỘNG\s+)?KINH\s+DOANH/i },
  { label: 'LCTT', test: /LƯU\s+CHUYỂN\s+TIỀN\s+TỆ/i },
  { label: 'ThuyetMinh', test: /THUYẾT\s+MINH\s+BÁO\s+CÁO/i },
];

async function main() {
  const term = await resolveQuarterTerm(Number(quarterArg), 2026);
  if (!term) throw new Error(`Khong tim thay ky Quy ${quarterArg}/2026`);
  const reports = filterReports((await fetchReportFilesForTerm(term)).filter((r) => codes.includes(r.stockCode)));
  await mkdir(destDir, { recursive: true });

  for (const report of reports) {
    const filePath = await downloadOne(report, destDir);
    const { resolved } = await resolveReportSourceFiles({ report, filePath });
    for (const entry of resolved) {
      if (!entry.filePath.toLowerCase().endsWith('.pdf')) continue;
      const parser = new PDFParse({ data: await readFile(entry.filePath), CanvasFactory });
      try {
        const { pages } = await parser.getText();
        console.log(`\n### ${report.stockCode} ${entry.filePath.split(/[\\/]/).pop()} - ${pages.length} trang`);
        pages.forEach((page, idx) => {
          const text = page.text.replace(/\s+/g, ' ').trim();
          const hits = MARKERS.filter((m) => m.test.test(text)).map((m) => m.label);
          console.log(`  tr${String(idx + 1).padStart(3)} ${String(text.length).padStart(5)} ky tu ${hits.length ? '[' + hits.join(',') + ']' : ''} ${text.slice(0, 90)}`);
        });
      } finally {
        await parser.destroy();
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
