// Quet cache tim BCDKT bi LECH NHAN/SO LIEU kieu TPC Q3/2026: OCR chen them 1
// o vao 1 dong (vd o "2" cua dong danh so cot trong mau BCDKT) lam tu do tro
// di moi NHAN an so lieu cua dong phia tren no - "Vay no ngan han" hien ra so
// cua "Phai tra ngan han khac", "Du phong phai tra" hien ra so cua "Vay".
//
// Cach phat hien: doi chieu MA SO cua cac dong MOC voi ma chuan (TT200). Day
// la phep KIEM TRA CHEO, khong phai phan loai dong theo ma so - quy tac
// feedback_no_numbering_classification cam dung ma so de QUYET DINH 1 dong la
// gi, khong cam dung no de phat hien bang bi lech.
//   npx tsx scripts/_debug-maso-misalign-scan-2026-10-25.ts [--chi-tiet]
import { readFileSync } from 'node:fs';

const verbose = process.argv.includes('--chi-tiet');
const data = JSON.parse(readFileSync('data/latest-fetch.json', 'utf8'));

function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Dong moc: ten dac trung -> ma so chuan. Chi lay nhung dong gan nhu moi bao
// cao deu co va ten kho lan voi dong khac.
// Mot so moc co 2 ma hop le tuy mau/thong tu (vd TONG CONG TAI SAN: 270 o mau
// cu, 280 o phan lon bao cao ky 2026) - liet ke CA 2, khong doan 1 con so.
const ANCHORS: { test: (l: string) => boolean; codes: number[]; name: string }[] = [
  { test: (l) => /^[A-D]?\s*[-.]?\s*TAI SAN NGAN HAN/.test(l), codes: [100], name: 'TSNH' },
  { test: (l) => /TONG CONG TAI SAN/.test(l), codes: [270, 280], name: 'Tong TS' },
  { test: (l) => /^[A-D]?\s*[-.]?\s*NO PHAI TRA/.test(l), codes: [300], name: 'No phai tra' },
  { test: (l) => /^I\.?\s*NO NGAN HAN/.test(l), codes: [310], name: 'No ngan han' },
  { test: (l) => /^II\.?\s*NO DAI HAN/.test(l), codes: [330], name: 'No dai han' },
  { test: (l) => /^[A-D]?\s*[-.]?\s*VON CHU SO HUU/.test(l), codes: [400], name: 'VCSH' },
  { test: (l) => /TONG CONG NGUON VON/.test(l), codes: [430, 440], name: 'Tong NV' },
];

function codeOf(cell: unknown): number | null {
  const s = String(cell ?? '').trim();
  if (!/^\d{3}$/.test(s)) return null;
  const n = Number(s);
  return n >= 100 && n <= 450 ? n : null;
}

type Bad = { code: string; period: string; misses: string[]; title: string };
const bad: Bad[] = [];
let checked = 0;

for (const r of data.reports) {
  const rows: any[] = r.statements?.balanceSheet?.rows || [];
  if (rows.length < 20) continue;

  // Cot ma so = cot co nhieu o dang ma 3 chu so nhat.
  const counts = new Map<number, number>();
  for (const row of rows) {
    for (let c = 1; c < Math.min(row.length, 4); c++) {
      if (codeOf(row[c]) !== null) counts.set(c, (counts.get(c) || 0) + 1);
    }
  }
  if (counts.size === 0) continue;
  const codeCol = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  checked++;

  const misses: string[] = [];
  for (const anchor of ANCHORS) {
    const row = rows.find((x) => anchor.test(norm(x?.[0])));
    if (!row) continue;
    const got = codeOf(row[codeCol]);
    if (got === null || anchor.codes.includes(got)) continue;
    misses.push(`${anchor.name}: ma=${got} (chuan ${anchor.codes.join('/')})`);
  }

  if (misses.length > 0) bad.push({ code: r.stockCode, period: `${r.periodYear}-${r.periodSlug}`, misses, title: r.title });
}

bad.sort((a, b) => b.misses.length - a.misses.length || a.code.localeCompare(b.code));
for (const b of bad) {
  console.log(`${b.code.padEnd(5)} ${b.period}  ${b.misses.length} moc lech  | ${b.misses.join(' ; ')}`);
  if (verbose) console.log(`        ${b.title}`);
}
console.log(`\nDa kiem ${checked} BCDKT | co moc lech: ${bad.length}`);
