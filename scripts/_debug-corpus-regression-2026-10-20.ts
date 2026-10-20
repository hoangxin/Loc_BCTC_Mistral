// Kiem tra REGRESSION MIEN PHI tren toan bo kho markdown OCR da luu: parse
// lai bang parser HIEN TAI roi doi chieu voi ket qua dang nam trong cache
// (data/latest-fetch.json) - KHONG goi OCR lan nao.
//
// Dung: npx tsx scripts/_debug-corpus-regression-2026-10-20.ts <thu-muc-repo-doi-chieu>
// (thu muc do phai co data/ocr-markdown + data/latest-fetch.json cua ban dang
// chay that tren production).
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { buildResultFromMarkdown } from '../lib/export/financial-statements';
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import { findAllGroupSumMismatches } from '../lib/export/validate-statements';
import { computeAnalysisRows } from '../lib/analysis';

const root = process.argv[2];
const DIR = join(root, 'data', 'ocr-markdown');
const STATUS_PATH = join(root, 'data', 'latest-fetch.json');
const SCOPE_MAP: Record<string, string> = { Chung: 'Chung', Hopnhat: 'Hợp nhất', Riengle: 'Riêng lẻ' };

const status = JSON.parse(readFileSync(STATUS_PATH, 'utf-8'));
const files = readdirSync(DIR).filter((f) => f.endsWith('.md')).sort();

interface Row {
  file: string;
  oldCounts: [number, number, number];
  newCounts: [number, number, number];
  oldWarn: number;
  newWarn: number;
  oldLnst: [unknown, unknown];
  newLnst: [unknown, unknown];
}

const worse: Row[] = [];
const better: Row[] = [];
const lnstChanged: Row[] = [];
let checked = 0;
let noCache = 0;

for (const file of files) {
  const m = file.match(/^([A-Z0-9]+)__(\d{4})(Q[1-4]|6T|9T|Nam)(Chung|Hopnhat|Riengle)\.md$/);
  if (!m) continue;
  const [, stockCode, yearStr, periodSlug, scopeKey] = m;
  const old = status.reports.find(
    (r: any) =>
      r.stockCode === stockCode &&
      r.periodYear === Number(yearStr) &&
      r.periodSlug === periodSlug &&
      r.statementScope === SCOPE_MAP[scopeKey]
  );
  if (!old) {
    noCache++;
    continue;
  }

  const markdown = readFileSync(join(DIR, file), 'utf-8');
  const statements = parseStatementsFromMarkdown(markdown);
  const result = buildResultFromMarkdown(markdown, statements, findAllGroupSumMismatches(statements));
  const analysis = computeAnalysisRows(result.statements, result.businessType, result.unreliableCells);

  const pick = (rows: any[], label: string): [unknown, unknown] => {
    const r = rows.find((x) => x.label === label);
    return [r?.currentValue ?? null, r?.priorValue ?? null];
  };

  const row: Row = {
    file,
    oldCounts: [
      old.statements.balanceSheet.rows.length,
      old.statements.incomeStatement.rows.length,
      old.statements.cashFlow.rows.length,
    ],
    newCounts: [
      result.statements.balanceSheet.rows.length,
      result.statements.incomeStatement.rows.length,
      result.statements.cashFlow.rows.length,
    ],
    oldWarn: old.warnings.length,
    newWarn: result.warnings.length,
    oldLnst: pick(old.analysis ?? [], 'LNST'),
    newLnst: pick(analysis, 'LNST'),
  };
  checked++;

  // "Xau di" = 1 bang bi MAT dong so voi truoc, HOAC LNST dang co so gio ve null.
  const lostRows = row.newCounts.some((n, i) => n < row.oldCounts[i]);
  const lostLnst = row.oldLnst[0] !== null && row.newLnst[0] === null;
  const gainedRows = row.newCounts.some((n, i) => n > row.oldCounts[i]);
  if (lostRows || lostLnst) worse.push(row);
  else if (gainedRows) better.push(row);
  if (JSON.stringify(row.oldLnst) !== JSON.stringify(row.newLnst)) lnstChanged.push(row);
}

const fmt = (r: Row) =>
  `${r.file.padEnd(30)} bs/is/cf ${r.oldCounts.join('/')} -> ${r.newCounts.join('/')}  w${r.oldWarn}->${r.newWarn}  LNST ${JSON.stringify(r.oldLnst)} -> ${JSON.stringify(r.newLnst)}`;

console.log(`Da doi chieu ${checked} bao cao (bo qua ${noCache} file khong co trong cache).\n`);
console.log(`=== XAU DI (${worse.length}) ===`);
worse.forEach((r) => console.log('  ' + fmt(r)));
console.log(`\n=== TOT LEN / them dong (${better.length}) ===`);
better.forEach((r) => console.log('  ' + fmt(r)));
console.log(`\n=== LNST THAY DOI (${lnstChanged.length}) ===`);
lnstChanged.forEach((r) => console.log('  ' + fmt(r)));
