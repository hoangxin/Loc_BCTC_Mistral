import { readFileSync } from 'fs';
import { computeAnalysisRows } from '../lib/analysis';

const data = JSON.parse(readFileSync('data/latest-fetch.json', 'utf-8'));
for (const r of data.reports) {
  const rows = computeAnalysisRows(r.statements, r.businessType, { balanceSheet: new Set(), incomeStatement: new Set() });
  console.log(`\n=== ${r.stockCode} (${r.businessType}) ===`);
  for (const row of rows) console.log(` ${row.label} = ${row.percentChange === null ? 'null' : row.percentChange.toFixed(2) + '%'}`);
}
