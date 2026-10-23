// So sanh phan loai loai hinh DN: luat HIEN TAI (khop ma mau o BAT KY vi tri
// nao) vs luat CHAT HON (ma mau phai di kem so hieu bieu mau "B0xA/", vd
// "B02A/TCTD", "B01A-CTCK") + fallback theo noi dung.
// Dung de do xem siet luat co lam tuot (false negative) bao cao that nao khong.
//   npx tsx scripts/_debug-classify-compare-2026-10-23.ts data/ocr-markdown
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { normalizeLabelText } from '../lib/export/statement-shared';

type BusinessType = 'bank' | 'securities' | 'insurance' | 'other';

const OLD_RULES: { type: BusinessType; pattern: RegExp }[] = [
  { type: 'securities', pattern: /\bCTCK\b/ },
  { type: 'bank', pattern: /\bTCTD\b/ },
  { type: 'insurance', pattern: /\b(DNBH|DNPNT|DNTBH)\b/ },
];

// "B" + so hieu (1-2 chu so) + hau to chu cai tuy chon, roi "/" hoac "-",
// roi ma loai hinh. Bat duoc moi bien the thay trong corpus that:
// "B02A/TCTD", "B04A/TCTD-HN", "B01A-CTCK", "B01- CTCK", "B03A - CTCK",
// "B 02A-DNPNT", "MAU SO: B02A/TCTD".
const FORM_CODE_PATTERN = /\bB\s?\d{1,2}\s?(?:\([A-Z]\))?\s?[A-Z]?\s*[-–—/]\s*(CTCK|TCTD|DNBH|DNPNT|DNTBH)\b/g;

const CONTENT_RULES: { type: BusinessType; pattern: RegExp }[] = [
  { type: 'insurance', pattern: /TAI BAO HIEM|DU PHONG NGHIEP VU/ },
  { type: 'securities', pattern: /PHUONG THUC CTCK QUAN LY|DICH VU CTCK CUNG CAP|TAI SAN CUA CTCK/ },
  { type: 'bank', pattern: /(TIEN GUI|TIEN, VANG GUI|VAY|CHO VAY|CAP TIN DUNG)[^|\n]{0,45}\bTCTD\b|\bTCTD\b[^|\n]{0,20}KHAC/ },
];

const MARKER_TO_TYPE: Record<string, BusinessType> = {
  CTCK: 'securities',
  TCTD: 'bank',
  DNBH: 'insurance',
  DNPNT: 'insurance',
  DNTBH: 'insurance',
};

function classifyOld(normalized: string): BusinessType {
  for (const rule of OLD_RULES) if (rule.pattern.test(normalized)) return rule.type;
  if (/TAI BAO HIEM|DU PHONG NGHIEP VU/.test(normalized)) return 'insurance';
  return 'other';
}

function classifyNew(normalized: string): BusinessType {
  const found = new Set<BusinessType>();
  for (const m of normalized.matchAll(FORM_CODE_PATTERN)) found.add(MARKER_TO_TYPE[m[1]]);
  // Uu tien theo thu tu cu neu 1 bao cao co nhieu ma mau (hiem)
  for (const t of ['securities', 'bank', 'insurance'] as BusinessType[]) if (found.has(t)) return t;
  for (const rule of CONTENT_RULES) if (rule.pattern.test(normalized)) return rule.type;
  return 'other';
}

const dir = process.argv[2] || 'data/ocr-markdown';
const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
const diffs: { file: string; old: BusinessType; next: BusinessType }[] = [];
const counts: Record<string, number> = {};

for (const f of files) {
  const normalized = normalizeLabelText(readFileSync(join(dir, f), 'utf8'));
  const oldType = classifyOld(normalized);
  const newType = classifyNew(normalized);
  counts[`${oldType}->${newType}`] = (counts[`${oldType}->${newType}`] ?? 0) + 1;
  if (oldType !== newType) diffs.push({ file: f, old: oldType, next: newType });
}

console.log(`tong file: ${files.length}`);
console.log(counts);
console.log(`\nkhac nhau: ${diffs.length}`);
for (const d of diffs) console.log(`${d.file}: ${d.old} -> ${d.next}`);

// Do RIENG do phu cua tung tang: ma mau (tang 1) vs noi dung (tang 2) - de
// biet fallback noi dung co thuc su la luoi an toan (bat duoc bao cao that
// khi OCR nuot mat ma mau) hay chi la nguon false-positive.
const cross: Record<string, number> = {};
for (const f of files) {
  const normalized = normalizeLabelText(readFileSync(join(dir, f), 'utf8'));
  const byCode = (() => {
    const found = new Set<BusinessType>();
    for (const m of normalized.matchAll(FORM_CODE_PATTERN)) found.add(MARKER_TO_TYPE[m[1]]);
    for (const t of ['securities', 'bank', 'insurance'] as BusinessType[]) if (found.has(t)) return t;
    return 'other' as BusinessType;
  })();
  const byContent = CONTENT_RULES.find((r) => r.pattern.test(normalized))?.type ?? 'other';
  cross[`code=${byCode} content=${byContent}`] = (cross[`code=${byCode} content=${byContent}`] ?? 0) + 1;
}
console.log('\nDo phu tung tang:');
console.log(cross);
