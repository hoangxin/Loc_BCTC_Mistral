import { readFileSync } from 'fs';
import { findIncomeStatementFormulaMismatches } from '../lib/export/statement-shared';

const data = JSON.parse(readFileSync('data/latest-fetch.json', 'utf-8'));
for (const code of ['VND', 'BVS']) {
  const r = data.reports.find((x: any) => x.stockCode === code);
  const table = r.statements.incomeStatement;
  console.log(`\n=== ${code} ===`);
  const mismatches = findIncomeStatementFormulaMismatches(table, r.businessType);
  for (const m of mismatches) {
    console.log(`-- ${m.groupLabel} | col=${m.columnName} | sum=${m.sum} reported=${m.reported}`);
    for (const idx of m.memberRowIndexes) {
      console.log(`   row ${idx}: ${JSON.stringify(table.rows[idx][1])} = ${table.rows[idx][m.columnIndex]}`);
    }
    console.log(`   target row ${m.subtotalRowIndex}: ${JSON.stringify(table.rows[m.subtotalRowIndex][1])}`);
  }
}
