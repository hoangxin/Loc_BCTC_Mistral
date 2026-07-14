import { readFileSync } from 'fs';
import { findAllGroupSumMismatches } from '../lib/export/validate-statements';

const data = JSON.parse(readFileSync('data/latest-fetch.json', 'utf-8'));
for (const r of data.reports) {
  const mismatches = findAllGroupSumMismatches(r.statements);
  console.log(`${r.stockCode} (${r.businessType}): ${mismatches.length} mismatch(es)`);
  for (const m of mismatches) {
    console.log(`  -- [${m.table}] ${m.groupLabel} | col=${m.columnName} | sum=${m.sum} reported=${m.reported}`);
  }
}
