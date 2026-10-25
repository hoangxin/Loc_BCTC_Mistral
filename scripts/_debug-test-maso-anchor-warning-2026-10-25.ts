// Kiem tra canh bao "nhan va ma so khong khop" (validateMaSoAnchors trong
// lib/export/validate-statements.ts) KEU dung luc: keu voi bang bi truot dong,
// IM voi bang binh thuong. Dung bang dung DUNG hinh dang that cua TPC Q3/2026
// truoc va sau khi sua.
//   npx tsx scripts/_debug-test-maso-anchor-warning-2026-10-25.ts
import { validateFinancialStatements } from '../lib/export/validate-statements';
import type { FinancialStatements, StatementTable } from '../lib/export/statement-shared';

const EMPTY: StatementTable = { columns: [], rows: [] };

function bs(rows: (string | number | null)[][]): FinancialStatements {
  return {
    balanceSheet: { columns: ['', '', '', ''], rows },
    incomeStatement: EMPTY,
    cashFlow: EMPTY,
    offBalanceSheet: EMPTY,
  } as FinancialStatements;
}

// Truoc khi sua: o legend "2" bi nhet vao, moi nhan an so lieu dong tren.
const truotDong = bs([
  ['C - NỢ PHẢI TRẢ', 2, 300, 247826025042],
  ['I. Nợ ngắn hạn', 300, 247826025042, 198095639568],
  ['1. Phải trả người bán ngắn hạn', 310, 247826025042, 198095639568],
  ['10. Vay nợ ngắn hạn', 319, 2668736340, 2919849221],
  ['11. Dự phòng phải trả ngắn hạn', 320, 217699366280, 156846591366],
  ['II. Nợ dài hạn', 324, '-', '-'],
  ['D- VỐN CHỦ SỞ HỮU', 400, 196927505487, 260932904635],
  ['TỔNG CỘNG NGUỒN VỐN', 440, 444753530529, 459028544203],
]);

// Sau khi sua: nhan va ma so khop lai.
const dungChuan = bs([
  ['C - NỢ PHẢI TRẢ', 300, 247826025042, 198095639568],
  ['I. Nợ ngắn hạn', 310, 247826025042, 198095639568],
  ['1. Phải trả người bán ngắn hạn', 311, 14245335405, 23650154992],
  ['9. Phải trả ngắn hạn khác', 319, 2668736340, 2919849221],
  ['10. Vay nợ ngắn hạn', 320, 217699366280, 156846591366],
  ['II. Nợ dài hạn', 330, '-', '-'],
  ['D- VỐN CHỦ SỞ HỮU', 400, 196927505487, 260932904635],
  ['TỔNG CỘNG NGUỒN VỐN', 440, 444753530529, 459028544203],
]);

// Lech DUNG 1 moc (OCR gop dong "D-" voi "I." von chu so huu) - lanh tinh,
// PHAI im de khong bao dong gia hang loat, xem MIN_ANCHOR_MISMATCHES_TO_WARN.
const lechMotMoc = bs([
  ['C - NỢ PHẢI TRẢ', 300, 247826025042, 198095639568],
  ['I. Nợ ngắn hạn', 310, 247826025042, 198095639568],
  ['II. Nợ dài hạn', 330, '-', '-'],
  ['D- VỐN CHỦ SỞ HỮU', 410, 196927505487, 260932904635],
  ['TỔNG CỘNG NGUỒN VỐN', 440, 444753530529, 459028544203],
]);

function anchorWarnings(statements: FinancialStatements): string[] {
  return validateFinancialStatements(statements, 'other')
    .map((i) => i.message)
    .filter((m) => m.includes('ma so KHONG khop'));
}

const cases: [string, FinancialStatements, boolean][] = [
  ['bang BI TRUOT DONG (TPC Q3 truoc khi sua)', truotDong, true],
  ['bang DUNG (TPC Q3 sau khi sua)', dungChuan, false],
  ['bang lech dung 1 moc (gop dong D/I von CSH)', lechMotMoc, false],
];

let failed = 0;
for (const [ten, statements, mongDoiKeu] of cases) {
  const warnings = anchorWarnings(statements);
  const keu = warnings.length > 0;
  const ok = keu === mongDoiKeu;
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'SAI '} ${ten}: ${keu ? 'CO keu' : 'im'} (mong doi: ${mongDoiKeu ? 'CO keu' : 'im'})`);
  for (const w of warnings) console.log(`        ${w}`);
}
console.log(failed === 0 ? '\n=> Dat ca 3 truong hop' : `\n=> HONG ${failed} truong hop`);
process.exitCode = failed === 0 ? 0 : 1;
