import { readFileSync } from 'fs';
import { computeAnalysisRows } from '../lib/analysis';

const data = JSON.parse(readFileSync('data/latest-fetch.json', 'utf-8'));
const r = data.reports.find((x: any) => x.stockCode === 'MCH');
const rows = computeAnalysisRows(r.statements, r.businessType, { balanceSheet: new Set(), incomeStatement: new Set() });
for (const row of rows) console.log(row.label, '=', row.percentChange);
