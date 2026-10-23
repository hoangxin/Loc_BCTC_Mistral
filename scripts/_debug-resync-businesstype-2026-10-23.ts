// Tinh lai businessType cho cac bao cao trong data/latest-fetch.json tu chinh
// markdown OCR da luu (data/ocr-markdown/) - KHONG OCR lai, KHONG dung toi
// `statements` da cache.
//
// Can rieng script nay vi scripts/resync-cache.ts dung THANG r.businessType
// co san trong cache (no chi dong bo warnings/analysis), nen khi sua luat phan
// loai trong lib/business-type.ts thi cache van giu phan loai CU.
//
// Mac dinh chi IN ra cho xem; them --apply de ghi vao cache (dong thoi tinh
// lai warnings + analysis cho dung cac bao cao doi phan loai, vi ca 2 deu phu
// thuoc businessType).
//   npx tsx scripts/_debug-resync-businesstype-2026-10-23.ts
//   npx tsx scripts/_debug-resync-businesstype-2026-10-23.ts --apply
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { classifyBusinessType } from '../lib/business-type';
import { validateFinancialStatements, findAllGroupSumMismatches } from '../lib/export/validate-statements';
import { unreliableCellKeysFromMismatches } from '../lib/export/statement-shared';
import { computeAnalysisRows } from '../lib/analysis';

const STATUS_PATH = 'data/latest-fetch.json';
const DIR = 'data/ocr-markdown';
const SCOPE_MAP: Record<string, string> = { Chung: 'Chung', Hopnhat: 'Hợp nhất', Riengle: 'Riêng lẻ' };

const apply = process.argv.includes('--apply');
const status = JSON.parse(readFileSync(STATUS_PATH, 'utf-8'));
const changed: string[] = [];
let matched = 0;

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.md')).sort()) {
  const m = file.match(/^([A-Z0-9]+)__(\d{4})(Q[1-4]|6T|9T|Nam)(Chung|Hopnhat|Riengle)\.md$/);
  if (!m) continue;
  const [, stockCode, yearStr, periodSlug, scopeKey] = m;
  const report = status.reports.find(
    (r: any) =>
      r.stockCode === stockCode && r.periodYear === Number(yearStr) && r.periodSlug === periodSlug && r.statementScope === SCOPE_MAP[scopeKey]
  );
  if (!report) continue;
  matched++;

  const next = classifyBusinessType(readFileSync(join(DIR, file), 'utf-8'));
  if (next === report.businessType) continue;
  changed.push(`${stockCode} ${yearStr}-${periodSlug} ${SCOPE_MAP[scopeKey]}: ${report.businessType} -> ${next}`);
  if (!apply) continue;

  report.businessType = next;
  const oldCanhBao = (report.warnings ?? []).filter((w: string) => w.startsWith('CANH BAO:'));
  const issues = validateFinancialStatements(report.statements, next);
  report.warnings = [...oldCanhBao, ...issues.map((i: { message: string }) => i.message)];
  const mismatches = findAllGroupSumMismatches(report.statements);
  report.analysis = computeAnalysisRows(report.statements, next, {
    balanceSheet: unreliableCellKeysFromMismatches(mismatches.filter((x) => x.table === 'balanceSheet')),
    incomeStatement: unreliableCellKeysFromMismatches(mismatches.filter((x) => x.table === 'incomeStatement')),
  });
}

console.log(`doi chieu duoc ${matched}/${status.reports.length} bao cao co markdown da luu`);
console.log(`doi phan loai: ${changed.length}`);
for (const c of changed) console.log('  ' + c);

if (apply && changed.length) {
  writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf-8');
  console.log(`DA GHI ${STATUS_PATH}`);
} else if (!apply) {
  console.log('(chay lai voi --apply de ghi vao cache)');
}
