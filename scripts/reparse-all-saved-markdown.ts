// Chay tay tren may ca nhan: parse lai toan bo markdown OCR da luu san bang
// parser hien tai (KHONG OCR lan nao). Logic that nam o lib/reparse-cache.ts
// vi con duoc goi tu scripts/run-fetch.ts (FETCH_MODE=reparse) khi can chay
// tren GitHub Actions runner - xem comment dau file do.
//
// LUU Y: chay o day roi push tay CHI duoc khi data/latest-fetch.json con du
// nho. Hien no ~43MB, vuot gioi han blob cua GitHub REST API - may khong cai
// git thi phai dispatch workflow "Fetch BCTC" voi mode=reparse thay vi chay
// script nay.
import { reparseAllSavedMarkdown } from '../lib/reparse-cache';

const summary = reparseAllSavedMarkdown();
console.log(`\nDa cap nhat ${summary.updated} bao cao, bo qua ${summary.skipped}.`);
if (summary.preserved.length > 0) {
  console.log(`Giu nguyen (parse lai ra rong): ${summary.preserved.join(', ')}`);
}
console.log(
  `Khu trung: failed ${summary.failedBefore} -> ${summary.failedAfter}, excludedReports ${summary.excludedBefore} -> ${summary.excludedAfter}.`
);
