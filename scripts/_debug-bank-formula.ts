import { readFileSync } from 'fs';
import { findIncomeStatementFormulaMismatches } from '../lib/export/statement-shared';

const data = JSON.parse(readFileSync('data/latest-fetch.json', 'utf-8'));
for (const code of ['CTG', 'ABB']) {
  const r = data.reports.find((x: any) => x.stockCode === code);
  if (!r) { console.log(`${code}: khong co trong cache`); continue; }
  const table = r.statements.incomeStatement;
  console.log(`\n=== ${code} (${r.businessType}) ===`);
  const mismatches = findIncomeStatementFormulaMismatches(table, r.businessType);
  if (mismatches.length === 0) console.log('  (khong co mismatch nao)');
  for (const m of mismatches) {
    console.log(`-- ${m.groupLabel} | col=${m.columnName} | sum=${m.sum} reported=${m.reported}`);
  }
}
