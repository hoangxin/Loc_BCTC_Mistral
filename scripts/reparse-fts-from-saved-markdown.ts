// Parse lai FTS Q1/2026 tu markdown DA CO SAN tren dia (data/debug-empty-parse/
// refetch-FTS-1784136734608.md - "full adaptive probe" 83 trang, luu 2026-07-15)
// bang code parser/validate/analysis HIEN TAI - KHONG OCR that lan nao. Dung
// buildResultFromMarkdown (moi tach ra tu extractFinancialStatementsWithOcrProbe,
// lib/export/financial-statements.ts) de dam bao DUNG y het logic production,
// khong hand-roll rieng (xem CLAUDE.md).
import { readFileSync, writeFileSync } from 'fs';
import { buildResultFromMarkdown } from '../lib/export/financial-statements';
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import { findAllGroupSumMismatches } from '../lib/export/validate-statements';
import { computeAnalysisRows } from '../lib/analysis';

const STATUS_PATH = 'data/latest-fetch.json';
const MARKDOWN_PATH = 'data/debug-empty-parse/refetch-FTS-1784136734608.md';

const markdown = readFileSync(MARKDOWN_PATH, 'utf-8');
const statements = parseStatementsFromMarkdown(markdown);
const mismatches = findAllGroupSumMismatches(statements);
const result = buildResultFromMarkdown(markdown, statements, mismatches);
const analysis = computeAnalysisRows(result.statements, result.businessType, result.unreliableCells);

const status = JSON.parse(readFileSync(STATUS_PATH, 'utf-8'));
const idx = status.reports.findIndex((r: any) => r.stockCode === 'FTS');
if (idx === -1) throw new Error('Khong tim thay FTS trong cache');

const old = status.reports[idx];
console.log('TRUOC: bsRows=%d isRows=%d cfRows=%d warnings=%d', old.statements.balanceSheet.rows.length, old.statements.incomeStatement.rows.length, old.statements.cashFlow.rows.length, old.warnings.length);
console.log('SAU:   bsRows=%d isRows=%d cfRows=%d warnings=%d', result.statements.balanceSheet.rows.length, result.statements.incomeStatement.rows.length, result.statements.cashFlow.rows.length, result.warnings.length);
console.log('warnings moi:', JSON.stringify(result.warnings, null, 2));

status.reports[idx] = {
  ...old,
  businessType: result.businessType,
  statements: result.statements,
  warnings: result.warnings,
  analysis,
};

writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf-8');
console.log('Da cap nhat data/latest-fetch.json cho FTS');
