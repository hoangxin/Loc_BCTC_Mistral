// Quet cache tim bao cao bi LECH COT ky: gia tri ky NAY roi vao o ky TRUOC
// (hoac rong) vi bang co them 1 cot khong phai ky ma balanceSheetPeriodColumns
// khong nhan ra - vd VE3 2026-Q2 co cot "Quyet dinh" chen giua "Ma chi tieu"
// va "So cuoi ky".
//
// Dau hieu: phan lon chi tieu co currentValue rong/0 NHUNG priorValue co so.
// Bang can doi khong the co chuyen "ky nay rong het, ky truoc day du".
//   npx tsx scripts/_debug-column-shift-scan-2026-10-25.ts
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('data/latest-fetch.json', 'utf8'));

type Row = { code: string; period: string; empty: number; filled: number; cols: string; title: string };
const hits: Row[] = [];
let checked = 0;

for (const r of data.reports) {
  const analysis = r.analysis || [];
  if (analysis.length === 0) continue;
  checked++;

  let empty = 0;
  let filled = 0;
  for (const a of analysis) {
    const cur = a.currentValue ?? null;
    const prior = a.priorValue ?? null;
    if ((cur === null || cur === 0) && prior !== null && prior !== 0) empty++;
    else if (cur !== null && cur !== 0) filled++;
  }

  // Nguong: it nhat 8 chi tieu "ky nay rong / ky truoc co so" va gan nhu khong
  // chi tieu nao co so o ky nay - de khong bat nham doanh nghiep that su co
  // vai chi tieu ve 0 trong ky.
  if (empty >= 8 && filled <= 1) {
    hits.push({
      code: r.stockCode,
      period: `${r.periodYear}-${r.periodSlug}`,
      empty,
      filled,
      cols: JSON.stringify(r.statements?.balanceSheet?.columns || []),
      title: r.title,
    });
  }
}

hits.sort((a, b) => a.code.localeCompare(b.code));
for (const h of hits) {
  console.log(`${h.code.padEnd(5)} ${h.period}  ky-nay-rong=${String(h.empty).padStart(2)} co-so=${h.filled}  cot=${h.cols.slice(0, 95)}`);
}
console.log(`\nDa kiem ${checked} bao cao | nghi lech cot: ${hits.length}`);
