// Xuat Excel BCTC tu statements DA CACHE (khong OCR) roi doc nguoc lai cac
// dong khop tu khoa - de kiem tra chinh FILE nguoi dung tai ve, thay vi chi
// kiem du lieu trong cache.
//   npx tsx scripts/_debug-excel-rows-2026-10-25.ts TPC "Vay|Dự phòng|khác"
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { writeFinancialStatementsExcel } from '../lib/export/excel';

const code = process.argv[2];
const pattern = new RegExp(process.argv[3] || 'Vay|Dự phòng phải trả|phải trả ngắn hạn khác', 'i');
if (!code) throw new Error('Thieu ma CK');

async function main() {
  const data = JSON.parse(readFileSync('data/latest-fetch.json', 'utf8'));
  const r = data.reports.find((x: any) => x.stockCode === code);
  if (!r) throw new Error('khong co ' + code + ' trong cache');

  const dest = join(tmpdir(), `${code}-check.xlsx`);
  await writeFinancialStatementsExcel(r.statements, dest, r.businessType);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(dest);
  console.log(`${code} ${r.periodYear} ${r.periodSlug} - sheet: ${wb.worksheets.map((w) => w.name).join(', ')}\n`);
  for (const ws of wb.worksheets) {
    const hits: string[] = [];
    ws.eachRow((row, n) => {
      const cells = (row.values as any[]).slice(1).map((v) => (v === null || v === undefined ? '' : String(v)));
      if (pattern.test(cells[0] || '')) hits.push(`  dong ${String(n).padStart(3)} | ${cells.map((c) => c.slice(0, 28)).join(' | ')}`);
    });
    if (hits.length) {
      console.log(`--- ${ws.name} ---`);
      for (const h of hits) console.log(h);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
