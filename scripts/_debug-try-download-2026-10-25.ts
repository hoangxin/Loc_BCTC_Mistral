// Thu TAI (chi tai, TUYET DOI khong OCR - khong ton phi) cac bao cao theo ma
// CK, bang CHINH ham production downloadOne, de kiem chung ban sua retry
// 2026-10-25 tren URL THAT cua static2.vietstock.vn.
//   npx tsx scripts/_debug-try-download-2026-10-25.ts <thu-muc-dich> KKC SPB ...
import { statSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { resolveQuarterTerm, fetchReportFilesForTerm } from '../lib/vietstock-reports';
import { filterReports } from '../lib/filter';
import { downloadOne } from '../lib/download';

const [destDir, ...codes] = process.argv.slice(2);
if (!destDir || codes.length === 0) throw new Error('Cach dung: <thu-muc-dich> <ma CK...>');

async function main() {
  const term = await resolveQuarterTerm(3, 2026);
  if (!term) throw new Error('Khong tim thay ky Quy 3/2026');
  const reports = filterReports((await fetchReportFilesForTerm(term)).filter((r) => codes.includes(r.stockCode)));
  await mkdir(destDir, { recursive: true });

  let ok = 0;
  for (const report of reports) {
    const started = Date.now();
    try {
      const filePath = await downloadOne(report, destDir);
      const size = statSync(filePath).size;
      ok++;
      console.log(`OK   ${report.stockCode.padEnd(4)} ${(size / 1024).toFixed(0).padStart(6)} KB  ${Math.round((Date.now() - started) / 1000)}s`);
      await rm(filePath, { force: true }); // khong giu file - chi kiem chung buoc tai
    } catch (error) {
      console.log(`LOI  ${report.stockCode.padEnd(4)} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`\n${ok}/${reports.length} tai thanh cong`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
