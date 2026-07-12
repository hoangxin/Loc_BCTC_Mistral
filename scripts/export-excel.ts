import { mkdir } from 'fs/promises';
import { join } from 'path';
import { readStatus } from '../lib/pipeline';
import { writeFinancialStatementsExcel } from '../lib/export/excel';
import { buildOutputFilename } from '../lib/export/output-filename';

// Xuat Excel cho cac bao cao da co san trong data/latest-fetch.json (dung
// LUON report.statements da OCR san, giong het logic app/api/report-file/route.ts
// kind=excel) - khong tai lai/OCR gi them, chi ghi ra .xlsx cuc bo de nguoi
// dung xem.
const STOCK_CODES = (process.argv[2] || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

async function main() {
  const status = readStatus();
  const targets = STOCK_CODES.length > 0 ? status.reports.filter((r) => STOCK_CODES.includes(r.stockCode.toUpperCase())) : status.reports;

  if (targets.length === 0) {
    console.log('Khong tim thay bao cao nao khop.');
    return;
  }

  const outDir = join(process.cwd(), 'data', 'exports');
  await mkdir(outDir, { recursive: true });

  for (const report of targets) {
    const filenameBase = buildOutputFilename({
      stockCode: report.stockCode,
      periodYear: report.periodYear,
      periodSlug: report.periodSlug,
      statementScope: report.statementScope,
    });
    const outputPath = join(outDir, `${filenameBase}.xlsx`);
    await writeFinancialStatementsExcel(report.statements, outputPath, report.businessType);
    console.log(`Da xuat: ${outputPath}`);
  }
}

main().catch((err) => {
  console.error('Xuat Excel that bai:', err);
  process.exit(1);
});
