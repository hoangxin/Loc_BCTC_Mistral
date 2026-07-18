// Parse lai TOAN BO bao cao co markdown OCR THO da luu san (data/ocr-markdown/)
// bang parser HIEN TAI (sau khi gop nhieu fix: isCoverPageOrSummaryTable,
// anchor-weighted classification, convertJsonCaptionTablesToMarkdown...) -
// KHONG OCR that lan nao. Dung buildResultFromMarkdown (lib/export/financial-statements.ts)
// de dam bao dung y het logic production, khong hand-roll rieng (xem CLAUDE.md).
//
// Ten file quy uoc: {STOCK}__{YEAR}{Q1-4|6T|9T|Nam}{Chung|Hopnhat|Riengle}.md
// (xem lib/ocr-markdown-store.ts) - suy nguoc lai periodYear/periodSlug/statementScope
// tu ten file de khop dung report trong cache.
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { buildResultFromMarkdown } from '../lib/export/financial-statements';
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import { findAllGroupSumMismatches } from '../lib/export/validate-statements';
import { computeAnalysisRows } from '../lib/analysis';

const STATUS_PATH = 'data/latest-fetch.json';
const DIR = 'data/ocr-markdown';

const SCOPE_MAP: Record<string, string> = { Chung: 'Chung', Hopnhat: 'Hợp nhất', Riengle: 'Riêng lẻ' };

const files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
const status = JSON.parse(readFileSync(STATUS_PATH, 'utf-8'));

let updated = 0;
let skipped = 0;

for (const file of files.sort()) {
  const m = file.match(/^([A-Z0-9]+)__(\d{4})(Q[1-4]|6T|9T|Nam)(Chung|Hopnhat|Riengle)\.md$/);
  if (!m) {
    console.log(`!! Ten file khong khop mau, bo qua: ${file}`);
    skipped++;
    continue;
  }
  const [, stockCode, yearStr, periodSlug, scopeKey] = m;
  const statementScope = SCOPE_MAP[scopeKey];
  const periodYear = Number(yearStr);

  const idx = status.reports.findIndex(
    (r: any) => r.stockCode === stockCode && r.periodYear === periodYear && r.periodSlug === periodSlug && r.statementScope === statementScope
  );
  if (idx === -1) {
    console.log(`!! Khong tim thay ${stockCode} ${periodYear}-${periodSlug} ${statementScope} trong cache - bo qua`);
    skipped++;
    continue;
  }

  const markdown = readFileSync(`${DIR}/${file}`, 'utf-8');
  const statements = parseStatementsFromMarkdown(markdown);
  const mismatches = findAllGroupSumMismatches(statements);
  const result = buildResultFromMarkdown(markdown, statements, mismatches);
  const analysis = computeAnalysisRows(result.statements, result.businessType, result.unreliableCells);

  const old = status.reports[idx];
  const oldCounts = `bs${old.statements.balanceSheet.rows.length}/is${old.statements.incomeStatement.rows.length}/cf${old.statements.cashFlow.rows.length}/w${old.warnings.length}`;
  const newCounts = `bs${result.statements.balanceSheet.rows.length}/is${result.statements.incomeStatement.rows.length}/cf${result.statements.cashFlow.rows.length}/w${result.warnings.length}`;
  const changed = oldCounts !== newCounts;
  console.log(`${changed ? 'THAY DOI' : 'khong doi'}  ${stockCode.padEnd(5)} ${statementScope.padEnd(9)} ${oldCounts} -> ${newCounts}`);

  status.reports[idx] = {
    ...old,
    businessType: result.businessType,
    statements: result.statements,
    warnings: result.warnings,
    analysis,
  };
  updated++;
}

writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf-8');
console.log(`\nDa cap nhat ${updated} bao cao, bo qua ${skipped}.`);
