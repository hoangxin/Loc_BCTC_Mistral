// Quet toan bo data/ocr-markdown: moi ngu canh xuat hien "ma mau" TCTD/CTCK/
// DNBH/DNPNT/DNTBH (kem 45 ky tu truoc) - dung de phan biet MA MAU PHAP LY
// that voi cac chuoi TRUNG TINH CO (vd "Quyet dinh so 045/QD-TCTD" cua Tong
// cong ty Duoc trong BCTC cua DP1 - mot cong ty duoc pham bi phan loai nham
// thanh ngan hang).
//   npx tsx scripts/_debug-formcode-scan-2026-10-23.ts data/ocr-markdown
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { normalizeLabelText } from '../lib/export/statement-shared';

const dir = process.argv[2] || 'data/ocr-markdown';
const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
const samples = new Map<string, { ctx: string; files: string[] }>();

for (const f of files) {
  const normalized = normalizeLabelText(readFileSync(join(dir, f), 'utf8'));
  const re = /.{0,45}\b(TCTD|CTCK|DNBH|DNPNT|DNTBH)\b.{0,15}/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(normalized))) {
    const ctx = m[0].replace(/\s+/g, ' ').trim();
    const key = `${m[1]}|${ctx.slice(-45)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const prev = samples.get(key);
    if (prev) prev.files.push(f);
    else samples.set(key, { ctx, files: [f] });
  }
}

const rows = [...samples.entries()].sort((a, b) => b[1].files.length - a[1].files.length);
console.log('tong ngu canh khac nhau:', rows.length);
for (const [, v] of rows) console.log(`${String(v.files.length).padStart(4)}  ${v.ctx}   [${v.files[0]}]`);
