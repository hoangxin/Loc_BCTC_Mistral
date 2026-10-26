// Parse lai 1 bao cao tu markdown OCR da luu roi in CAC DONG PHAN TICH %
// (computeAnalysisRows) + cot ky duoc chon cho KQKD - de kiem tra thay doi o
// tang parser co keo theo thay doi o tang phan tich hay khong. Khong OCR.
//   npx tsx scripts/_debug-analysis-from-markdown-2026-10-26.ts POS LSG
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import { classifyBusinessType } from '../lib/business-type';
import { computeAnalysisRows, incomeStatementPeriodColumns } from '../lib/analysis';

const codes = process.argv.slice(2);
if (codes.length === 0) throw new Error('Thieu ma CK');

const MARKDOWN_DIR = join(process.cwd(), 'data', 'ocr-markdown');
const files = readdirSync(MARKDOWN_DIR).filter((f) => codes.some((c) => f.startsWith(`${c}__`)));

for (const file of files) {
  const markdown = readFileSync(join(MARKDOWN_DIR, file), 'utf-8');
  const statements = parseStatementsFromMarkdown(markdown);
  const businessType = classifyBusinessType(markdown);
  const periods = incomeStatementPeriodColumns(statements.incomeStatement);
  console.log(`\n### ${file} (${businessType})`);
  console.log(
    'cot KQKD duoc chon:',
    periods
      ? `hien tai=[${periods.currentIndex}] "${statements.incomeStatement.columns[periods.currentIndex]}" | ky truoc=[${periods.priorIndex}] "${statements.incomeStatement.columns[periods.priorIndex]}"`
      : 'KHONG xac dinh duoc'
  );
  // Khong truyen unreliableCells (mac dinh rong): o day chi can doi chieu cot
  // ky va gia tri, khong can co che danh dau o nghi ngo.
  const rows = computeAnalysisRows(statements, businessType);
  for (const row of rows) {
    if (row.currentValue === null && row.priorValue === null) continue;
    console.log(`  ${row.label.padEnd(46)} ${String(row.currentValue).padStart(18)} ${String(row.priorValue).padStart(18)}  ${row.percentChange ?? ''}`);
  }
}
