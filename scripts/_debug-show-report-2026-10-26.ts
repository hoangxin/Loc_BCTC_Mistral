// In nhanh 1 bang da parse cua 1 (hoac nhieu) ma CK - tu CACHE hien tai
// (mac dinh) hoac PARSE LAI tu markdown OCR da luu (--reparse). Chi doc dia,
// khong goi mang/OCR.
//   npx tsx scripts/_debug-show-report-2026-10-26.ts POS LSG [--table=is|bs|cf] [--reparse]
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { readStatus } from '../lib/status-store';
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import type { FinancialStatements, StatementTable } from '../lib/export/statement-shared';

const args = process.argv.slice(2);
const table = (args.find((a) => a.startsWith('--table='))?.split('=')[1] ?? 'is') as 'is' | 'bs' | 'cf';
const reparse = args.includes('--reparse');
const codes = args.filter((a) => !a.startsWith('--'));
if (codes.length === 0) throw new Error('Thieu ma CK');

const key = table === 'is' ? 'incomeStatement' : table === 'bs' ? 'balanceSheet' : 'cashFlow';

function dump(title: string, statements: FinancialStatements, warnings?: string[]) {
  const chosen: StatementTable = statements[key];
  console.log(`\n### ${title}`);
  console.log('columns:', JSON.stringify(chosen.columns));
  for (const row of chosen.rows) console.log(JSON.stringify(row));
  if (warnings?.length) console.log('warnings:', warnings.join(' | '));
}

const MARKDOWN_DIR = join(process.cwd(), 'data', 'ocr-markdown');

if (reparse) {
  const files = readdirSync(MARKDOWN_DIR).filter((f) => codes.some((c) => f.startsWith(`${c}__`)));
  if (files.length === 0) throw new Error(`Khong tim thay markdown cho ${codes.join(', ')} trong ${MARKDOWN_DIR}`);
  for (const file of files) {
    dump(`${file} (parse lai)`, parseStatementsFromMarkdown(readFileSync(join(MARKDOWN_DIR, file), 'utf-8')));
  }
} else {
  const status = readStatus();
  for (const code of codes) {
    const reports = status.reports.filter((r) => r.stockCode === code);
    if (reports.length === 0) console.log(`\n### ${code}: KHONG co trong cache`);
    for (const report of reports) {
      dump(`${code} | ${report.title} | ${report.periodYear}-${report.periodSlug} | ${report.businessType}`, report.statements, report.warnings);
    }
  }
}
