// In danh sach file MA PIPELINE THAT SU se dua vao OCR cho 1 bao cao da tai
// ve san (khong tai lai, khong OCR): ket qua cua resolveReportSourceFiles -
// gom ca cac file bi LOAI va ly do. Dung khi 1 bao cao ra rong de biet file
// chua 3 bang co bi loai truoc khi toi OCR hay khong.
//   npx tsx scripts/_debug-resolve-files-2026-10-26.ts <duong-dan-file-da-tai> <ma CK>
import { resolveReportSourceFiles } from '../lib/report-source';
import type { ReportFile } from '../lib/vietstock-reports';

const [filePath, stockCode] = process.argv.slice(2);
if (!filePath || !stockCode) throw new Error('Cach dung: <duong-dan-file> <ma CK>');

const report = {
  stockCode,
  title: 'debug',
  fileUrl: `https://static2.vietstock.vn/debug/${stockCode}.zip`,
  fileExt: '.zip',
} as unknown as ReportFile;

async function main() {
  const { resolved, errors, filingStructureWarnings } = await resolveReportSourceFiles({ report, filePath });
  console.log(`resolved (${resolved.length} file se duoc thu OCR, theo thu tu):`);
  for (const r of resolved) console.log(`  ${r.format.padEnd(5)} ${r.entryName ?? '(file don)'} -> ${r.filePath}`);
  if (errors.length) console.log('errors:', errors);
  if (filingStructureWarnings.length) console.log('canh bao cau truc ho so:', filingStructureWarnings);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
