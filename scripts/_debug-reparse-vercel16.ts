// Re-parse 16 markdown THO (goc, chua qua code cu) bang parseStatementsFromMarkdown
// CUA CODE HIEN TAI (co het cac fix anchor/token-AND hom nay) - tai dung DUNG
// ham production (khong tu che lai), dam bao test THAT su tren fix moi thay vi
// cache statements da parse san boi code CU. So sanh voi statements cu (tu
// data/latest-fetch.json ban ghi tren origin/main) de biet fix hom nay co doi
// gi khong; roi chay findAllGroupSumMismatches tren ket qua parse MOI.
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import { findAllGroupSumMismatches } from '../lib/export/validate-statements';

const mdDir = process.argv[2];
const oldJsonFile = process.argv[3];

const oldData = oldJsonFile ? JSON.parse(readFileSync(oldJsonFile, 'utf-8')) : null;
const oldByCode = new Map<string, any>();
if (oldData) for (const r of oldData.reports) oldByCode.set(r.stockCode, r);

const files = readdirSync(mdDir).filter((f) => f.endsWith('.md'));
let totalMismatchNew = 0;
let reportsWithMismatchNew = 0;

for (const f of files) {
  const code = f.split('__')[0];
  const md = readFileSync(join(mdDir, f), 'utf-8');
  const fresh = parseStatementsFromMarkdown(md);
  const old = oldByCode.get(code);

  const shapeNew = `BS=${fresh.balanceSheet.rows.length} IS=${fresh.incomeStatement.rows.length} CF=${fresh.cashFlow.rows.length} OB=${fresh.offBalanceSheet.rows.length}`;
  const shapeOld = old ? `BS=${old.statements.balanceSheet.rows.length} IS=${old.statements.incomeStatement.rows.length} CF=${old.statements.cashFlow.rows.length} OB=${old.statements.offBalanceSheet.rows.length}` : 'n/a';
  const shapeChanged = shapeNew !== shapeOld;

  const mm = findAllGroupSumMismatches(fresh);
  totalMismatchNew += mm.length;
  if (mm.length) reportsWithMismatchNew++;

  console.log(`${code.padEnd(6)} NEW[${shapeNew}] OLD[${shapeOld}] ${shapeChanged ? '<<< SHAPE KHAC' : ''}  mismatch=${mm.length}`);
  for (const m of mm) console.log(`   [${m.table}] ${m.groupLabel} | ${m.columnName} | sum=${m.sum} reported=${m.reported}`);
}
console.log(`\n=== ${files.length} bao cao re-parse bang code MOI | ${reportsWithMismatchNew} co mismatch | ${totalMismatchNew} mismatch tong ===`);
