// Backtest tren UNION cac bao cao da cache trong git history (nhieu snapshot
// latest-fetch.json khac nhau) - dedupe theo stockCode+periodYear+periodSlug,
// chay findAllGroupSumMismatches CUA CODE HIEN TAI. Dung so sanh BEFORE/AFTER
// (checkout lib tu commit truoc) de thay tac dong 1 thay doi tren toan bo ~40
// bao cao ma KHONG can OCR lai.
import { execSync } from 'child_process';
import { findAllGroupSumMismatches } from '../lib/export/validate-statements';

const COMMITS = [
  '22d82d3', '16ac172d', '4a629c2', 'b7ec9d5', 'e892664',
  'df854f9', '48c5e9f', '47b3041', '1d4cc89', 'HEAD',
];

const byKey = new Map<string, any>();
for (const c of COMMITS) {
  let raw: string;
  try {
    raw = execSync(`git show ${c}:data/latest-fetch.json`, { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 });
  } catch {
    continue;
  }
  const data = JSON.parse(raw);
  for (const r of data.reports ?? []) {
    const key = `${r.stockCode}|${r.periodYear ?? ''}|${r.periodSlug ?? ''}`;
    // Uu tien snapshot CU HON trong danh sach (COMMITS[0] la 28-report) neu
    // trung key - moi report chi can 1 ban statements de test tang validate.
    if (!byKey.has(key)) byKey.set(key, r);
  }
}

const reports = [...byKey.values()].sort((a, b) => a.stockCode.localeCompare(b.stockCode));
let total = 0;
let withMismatch = 0;
for (const r of reports) {
  const mm = findAllGroupSumMismatches(r.statements);
  total += mm.length;
  if (mm.length) withMismatch++;
  const tag = mm.length ? `${mm.length} mismatch` : 'ok';
  console.log(`${r.stockCode.padEnd(6)} ${String(r.businessType ?? '').padEnd(11)} ${tag}`);
  for (const m of mm) {
    console.log(`   [${m.table}] ${m.groupLabel} | ${m.columnName} | sum=${m.sum} reported=${m.reported}`);
  }
}
console.log(`\n=== ${reports.length} bao cao distinct | ${withMismatch} co mismatch | ${total} mismatch tong ===`);
