// Quet toan bo cache tim bao cao bi GAN NHAM gia tri giua 3 chi tieu no ngan/
// dai han de lan nhau: "Vay", "Du phong phai tra", "Phai tra khac" (nguoi dung
// bao TPC 2026-10-25: vay hien thanh du phong phai tra, phai tra khac hien
// thanh vay).
//
// Cach kiem: KHONG goi lai finder production (se vong tron - finder sai thi
// phep do cung sai y het). Thay vao do dinh vi dong THEO TEN bang 1 bo quy tac
// doc lap, don gian, roi doi chieu voi gia tri analysis da ghi. Lech = dang
// nghi, in ra de soi tay.
//   npx tsx scripts/_debug-vay-duphong-swap-2026-10-25.ts [duong-dan-cache]
import { readFileSync } from 'node:fs';

const cachePath = process.argv[2] || 'data/latest-fetch.json';
const data = JSON.parse(readFileSync(cachePath, 'utf8'));

function norm(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function num(cell: unknown): number | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number') return cell;
  const s = String(cell).trim();
  if (s === '' || s === '-' || s === '—') return null;
  const neg = /^\(.*\)$/.test(s);
  const digits = s.replace(/[^\d]/g, '');
  if (digits === '') return null;
  const v = Number(digits);
  return neg ? -v : v;
}

// Vung NGUON VON: tu dong co ma 300 (NO PHAI TRA) tro di.
function liabilityStart(rows: any[]): number {
  for (let i = 0; i < rows.length; i++) {
    const L = norm(rows[i]?.[0]);
    if (/NO PHAI TRA/.test(L)) return i;
  }
  return -1;
}

// Ranh gioi 3 doan: no ngan han -> no dai han -> von chu so huu. Chi tieu
// analysis CONG dong ngan han + dong dai han (sumFindersAtColumn trong
// lib/analysis.ts) nen moc so sanh cung phai cong nhu vay, khong lay 1 dong.
function sections(rows: any[], start: number) {
  let shortStart = -1;
  let longStart = -1;
  let equityStart = rows.length;
  for (let i = start; i < rows.length; i++) {
    const L = norm(rows[i]?.[0]);
    if (shortStart < 0 && /^I?\.?\s*NO NGAN HAN/.test(L)) shortStart = i;
    else if (longStart < 0 && /^I*I\.?\s*NO DAI HAN/.test(L)) longStart = i;
    else if (/VON CHU SO HUU/.test(L)) {
      equityStart = i;
      break;
    }
  }
  if (shortStart < 0) shortStart = start;
  if (longStart < 0) longStart = equityStart;
  return { shortStart, longStart, equityStart };
}

type Hit = { label: string; value: number | null; idx: number };

function findRow(rows: any[], from: number, to: number, test: (l: string) => boolean, valueIdx: number): Hit | null {
  for (let i = Math.max(from, 0); i < Math.min(to, rows.length); i++) {
    const L = norm(rows[i]?.[0]);
    if (L && test(L)) return { label: String(rows[i][0]), value: num(rows[i][valueIdx]), idx: i };
  }
  return null;
}

function sumPair(a: Hit | null, b: Hit | null): number | null {
  if (!a && !b) return null;
  const va = a?.value ?? null;
  const vb = b?.value ?? null;
  if (va === null && vb === null) return null;
  return (va ?? 0) + (vb ?? 0);
}

const suspects: string[] = [];
let checked = 0;
let noSection = 0;

for (const r of data.reports) {
  if (r.businessType !== 'other') continue;
  const bs = r.statements?.balanceSheet;
  const rows: any[] = bs?.rows || [];
  if (rows.length === 0) continue;
  const start = liabilityStart(rows);
  if (start < 0) {
    noSection++;
    continue;
  }

  // Cot gia tri ky nay: tim cot dau tien (sau cot ten + cot ma so) co so o
  // dong TONG CONG NGUON VON / NO PHAI TRA.
  const anchor = rows[start];
  let valueIdx = -1;
  for (let c = 1; c < anchor.length; c++) {
    const v = num(anchor[c]);
    if (v !== null && Math.abs(v) > 1e6) {
      valueIdx = c;
      break;
    }
  }
  if (valueIdx < 0) continue;

  const { shortStart, longStart, equityStart } = sections(rows, start);
  const isVay = (l: string) => /\bVAY\b/.test(l) && !/PHAI THU/.test(l);
  const isDuPhong = (l: string) => /DU PHONG PHAI TRA/.test(l);
  const isPtKhac = (l: string) => /PHAI TRA (NGAN|DAI) HAN KHAC/.test(l) || /KHOAN PHAI TRA (NGAN|DAI) HAN KHAC/.test(l);

  const vayS = findRow(rows, shortStart, longStart, isVay, valueIdx);
  const vayL = findRow(rows, longStart, equityStart, isVay, valueIdx);
  const dpS = findRow(rows, shortStart, longStart, isDuPhong, valueIdx);
  const dpL = findRow(rows, longStart, equityStart, isDuPhong, valueIdx);
  const ptS = findRow(rows, shortStart, longStart, isPtKhac, valueIdx);
  const ptL = findRow(rows, longStart, equityStart, isPtKhac, valueIdx);

  const vay = vayS || vayL ? { label: (vayS || vayL)!.label, value: sumPair(vayS, vayL), idx: (vayS || vayL)!.idx } : null;
  const duPhong = dpS || dpL ? { label: (dpS || dpL)!.label, value: sumPair(dpS, dpL), idx: (dpS || dpL)!.idx } : null;
  const ptKhac = ptS || ptL ? { label: (ptS || ptL)!.label, value: sumPair(ptS, ptL), idx: (ptS || ptL)!.idx } : null;

  const byLabel = new Map<string, number | null>((r.analysis || []).map((a: any) => [a.label, a.currentValue ?? null]));
  const aVay = byLabel.get('Vay') ?? null;
  const aDuPhong = byLabel.get('Dự phòng phải trả') ?? null;
  const aPtKhac = byLabel.get('Phải trả khác') ?? null;

  checked++;

  // 0 trong analysis = "khong tim thay / trong", coi nhu null de so sanh.
  const z = (v: number | null) => (v === 0 ? null : v);
  const problems: string[] = [];
  if (vay && z(aVay) !== vay.value) problems.push(`Vay: bang=${vay.value} analysis=${aVay} ("${vay.label.trim().slice(0, 40)}")`);
  if (duPhong && z(aDuPhong) !== duPhong.value)
    problems.push(`DuPhong: bang=${duPhong.value} analysis=${aDuPhong} ("${duPhong.label.trim().slice(0, 40)}")`);
  if (ptKhac && z(aPtKhac) !== ptKhac.value)
    problems.push(`PTKhac: bang=${ptKhac.value} analysis=${aPtKhac} ("${ptKhac.label.trim().slice(0, 40)}")`);

  if (problems.length) {
    // Danh dau rieng truong hop HOAN DOI that su (gia tri cua chi tieu nay
    // xuat hien o chi tieu kia) - nguy hiem hon la chi lech/thieu.
    const vals = [vay?.value, duPhong?.value, ptKhac?.value].filter((v) => v !== null && v !== undefined);
    const swapped =
      (aVay !== null && aVay !== 0 && aVay !== vay?.value && vals.includes(aVay)) ||
      (aDuPhong !== null && aDuPhong !== 0 && aDuPhong !== duPhong?.value && vals.includes(aDuPhong)) ||
      (aPtKhac !== null && aPtKhac !== 0 && aPtKhac !== ptKhac?.value && vals.includes(aPtKhac));
    suspects.push(`${swapped ? 'HOAN DOI ' : 'lech    '} ${r.stockCode} ${r.periodYear}-${r.periodSlug} | ${problems.join(' | ')}`);
  }
}

suspects.sort();
for (const s of suspects) console.log(s);
console.log(`\nDa kiem: ${checked} bao cao 'other' | nghi van: ${suspects.length} (HOAN DOI: ${suspects.filter((s) => s.startsWith('HOAN DOI')).length})`);
console.log(`Bo qua (khong tim thay doan NO PHAI TRA): ${noSection}`);
