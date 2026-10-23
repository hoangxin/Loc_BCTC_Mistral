// Chay classifyBusinessType THAT (lib/business-type.ts) tren toan bo
// data/ocr-markdown de doi chieu voi phan loai dang luu trong
// data/latest-fetch.json - bat moi thay doi do sua luat phan loai.
//   npx tsx scripts/_debug-classify-verify-2026-10-23.ts data/ocr-markdown
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { classifyBusinessType } from '../lib/business-type';

const dir = process.argv[2] || 'data/ocr-markdown';
const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
const counts: Record<string, number> = {};
const byType: Record<string, string[]> = {};

for (const f of files) {
  const t = classifyBusinessType(readFileSync(join(dir, f), 'utf8'));
  counts[t] = (counts[t] ?? 0) + 1;
  (byType[t] ??= []).push(f);
}

console.log(counts);
console.log('\nngan hang:', byType.bank?.join(' '));
console.log('\nbao hiem:', byType.insurance?.join(' '));
console.log('\nchung khoan:', byType.securities?.length, 'file');
for (const f of ['DP1__2026Q2Chung.md', 'DP1__2026Q3Chung.md', 'HCM__2026Q3Chung.md']) {
  console.log(f, '=>', classifyBusinessType(readFileSync(join(dir, f), 'utf8')));
}
