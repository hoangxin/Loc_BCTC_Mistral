// Parse lai 1 markdown da luu bang parser HIEN TAI va in cac dong no ngan han
// de doi chieu voi PDF goc - dung kiem tra phep sua lech dong (xem
// repairLabelValueRowShift trong lib/export/markdown-tables.ts).
//   npx tsx scripts/_debug-check-tpc-fix-2026-10-25.ts TPC__2026Q3Hopnhat.md
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import { computeAnalysisRows } from '../lib/analysis';
import { classifyBusinessType } from '../lib/business-type';

const file = process.argv[2] || 'TPC__2026Q3Hopnhat.md';
const markdown = readFileSync(join('data', 'ocr-markdown', file), 'utf8');
const statements = parseStatementsFromMarkdown(markdown);
const businessType = classifyBusinessType(markdown);

console.log(`${file} (${businessType})`);
console.log('cols:', JSON.stringify(statements.balanceSheet.columns), '| so dong:', statements.balanceSheet.rows.length);
console.log('\n--- khoi no ngan han ---');
for (const row of statements.balanceSheet.rows as any[]) {
  const label = String(row[0] ?? '').trim();
  if (/NỢ PHẢI TRẢ|Nợ ngắn hạn|Phải trả|Vay|Dự phòng phải trả|Nợ dài hạn|Người mua/i.test(label)) {
    console.log('  ', label.slice(0, 44).padEnd(46), JSON.stringify(row.slice(1)));
  }
}

console.log('\n--- analysis ---');
for (const a of computeAnalysisRows(statements, businessType)) {
  if (['Vay', 'Dự phòng phải trả', 'Phải trả khác', 'Phải trả người bán'].includes(a.label)) {
    console.log('  ', a.label.padEnd(22), String(a.currentValue).padStart(18));
  }
}
