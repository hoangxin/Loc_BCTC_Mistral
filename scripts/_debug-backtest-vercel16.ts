// Backtest 16 bao cao MOI (Q2/2026) nguoi dung vua chay tren Vercel
// (https://hoangxin-bctc.vercel.app), lay qua GET /api/fetch-status, luu tam
// o scratchpad (KHONG commit - du lieu chua qua kiem duyet/la ban nhap chay
// thu). Doc truc tiep tu FetchStatus.reports[].statements (da OCR/parse san,
// khong OCR lai) - chay findAllGroupSumMismatches CUA CODE HIEN TAI de kiem
// tra hoi quy/loi phan loai tren du lieu THAT MOI, tach biet voi union corpus
// Q1 cu (scripts/_debug-backtest-union.ts).
import { readFileSync } from 'fs';
import { findAllGroupSumMismatches } from '../lib/export/validate-statements';

const SCRATCH_FILE = process.argv[2];
if (!SCRATCH_FILE) {
  console.error('Usage: tsx scripts/_debug-backtest-vercel16.ts <path-to-fetch-status.json>');
  process.exit(1);
}
const data = JSON.parse(readFileSync(SCRATCH_FILE, 'utf-8'));
// Chi lay cac bao cao ky Q2 (16 bao cao moi) - loai 9 bao cao Q1 cu con luu
// trong bo nho Vercel tu lan chay truoc, tranh dem trung voi union corpus.
const NEW_CODES = new Set(['ABW','VRG','TRC','TMG','IFS','EVS','UDJ','MES','KGM','TTS','VPD','NTC','CSV','AGP','BSL','BRC']);
const reports = data.reports.filter((r: any) => NEW_CODES.has(r.stockCode));

let total = 0;
let withMismatch = 0;
for (const r of reports) {
  const bs = r.statements.balanceSheet, is = r.statements.incomeStatement, cf = r.statements.cashFlow, ob = r.statements.offBalanceSheet;
  const shape = `BS=${bs.rows.length} IS=${is.rows.length} CF=${cf.rows.length} OB=${ob.rows.length}`;
  const mm = findAllGroupSumMismatches(r.statements);
  total += mm.length;
  if (mm.length) withMismatch++;
  console.log(`${r.stockCode.padEnd(6)} ${String(r.businessType ?? '').padEnd(11)} ${shape.padEnd(28)} ${mm.length ? mm.length + ' mismatch' : 'ok'}  warnings=${(r.warnings ?? []).length}`);
  for (const m of mm) {
    console.log(`   [${m.table}] ${m.groupLabel} | ${m.columnName} | sum=${m.sum} reported=${m.reported}`);
  }
  for (const w of r.warnings ?? []) console.log(`   WARN: ${w}`);
}
console.log(`\n=== ${reports.length} bao cao (Q2, moi) | ${withMismatch} co mismatch | ${total} mismatch tong ===`);
