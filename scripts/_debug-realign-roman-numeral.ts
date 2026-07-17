// Regression thuong truc cho realignRowByContent/looksLikeLabel (markdown-tables.ts)
// - STT La Ma thuan tuy ("III.") KHONG duoc coi la nhan, du tinh co khop
// pattern "3+ chu cai lien tiep" (I-I-I). Xac nhan qua CSV that (2026-07-17):
// dong that su la "III. | Các khoản phải thu ngắn hạn | 130 | ... | gia tri"
// bi hieu nham vi tri, lam nhan THAT bi day sang cot Ma so, pha tan pham vi
// tinh tong nhom ke tiep (mismatch gia hang nghin ty).
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(60)} ${ok ? '' : `got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// Mo phong dung cau truc CSV that: dong "III." (STT La Ma) - dong nay trong
// nguon OCR that co thu tu o KHAC voi cac dong xung quanh (STT truoc, nhan
// sau - trong khi da so dong khac trong CUNG bang co nhan truoc). labelCellIdx
// PHAI tim dung o chua "Các khoản phải thu ngắn hạn" (KHONG phai "III.").
const md = `
| Chỉ tiêu | Mã số | Kỳ này |
| --- | --- | --- |
| Tài sản ngắn hạn | 100 | 1000 |
| Tiền và các khoản tương đương tiền | 110 | 200 |
| III. | Các khoản phải thu ngắn hạn | 300 |
| Phải thu ngắn hạn của khách hàng | 131 | 300 |
| Tổng cộng tài sản | 270 | 1500 |
`;
const s = parseStatementsFromMarkdown(md);
const li = s.balanceSheet.columns.findIndex((c) => /chỉ tiêu/i.test(c || ''));
const row = s.balanceSheet.rows.find((r) => String(r[li] ?? '').includes('III.') || String(r[li] ?? '').includes('Các khoản phải thu'));
check('dong STT La Ma "III." nhan dung "Các khoản phải thu ngắn hạn" lam nhan (khong phai "III.")', row?.[li], 'Các khoản phải thu ngắn hạn');

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
