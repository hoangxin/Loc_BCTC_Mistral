// Chay code analysis HIEN TAI tren statements DA CACHE (khong OCR, khong doi
// cache) roi so voi gia tri analysis dang luu - de phat hien truong hop cache
// dung nhung CODE BAY GIO sai (hoac nguoc lai), vi cache khong tu tinh lai khi
// code doi (xem CLAUDE.md muc "Cache ket qua").
//   npx tsx scripts/_debug-recompute-analysis-2026-10-25.ts TPC [MA2 ...]
import { readFileSync } from 'node:fs';
import { computeAnalysisRows } from '../lib/analysis';

const codes = process.argv.slice(2);
if (codes.length === 0) throw new Error('Thieu ma CK');

const data = JSON.parse(readFileSync('data/latest-fetch.json', 'utf8'));

for (const code of codes) {
  const reports = data.reports.filter((x: any) => x.stockCode === code);
  if (reports.length === 0) {
    console.log(`${code}: khong co trong cache\n`);
    continue;
  }
  for (const r of reports) {
    const fresh = computeAnalysisRows(r.statements, r.businessType);
    const cached = new Map<string, any>((r.analysis || []).map((a: any) => [a.label, a]));
    console.log(`=== ${code} ${r.periodYear} ${r.periodSlug} (${r.businessType}) - ${r.title}`);
    console.log('    ' + 'nhan'.padEnd(22) + 'cache'.padStart(20) + 'code hien tai'.padStart(20));
    for (const f of fresh) {
      const c = cached.get(f.label);
      const same = (c?.currentValue ?? null) === (f.currentValue ?? null);
      console.log(
        (same ? '    ' : '>>> ') + f.label.padEnd(22),
        String(c?.currentValue ?? '-').padStart(18),
        String(f.currentValue ?? '-').padStart(18)
      );
    }
    console.log();
  }
}
