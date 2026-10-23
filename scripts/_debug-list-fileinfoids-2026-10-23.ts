// In fileInfoID cua cac bao cao can tai bu, SAU KHI da qua dung bo loc
// production (lib/filter.ts) - de truyen vao input `selectedIds` cua workflow
// fetch-bctc.yml thay vi dung onlyMissing (onlyMissing se quet TOAN BO bao
// cao con thieu cua ky, khong chi may ma nay).
//   npx tsx scripts/_debug-list-fileinfoids-2026-10-23.ts UDJ FGL VOS ...
import { resolveQuarterTerm, fetchReportFilesForTerm } from '../lib/vietstock-reports';
import { filterReports, filterExclusionReason } from '../lib/filter';

const codes = process.argv.slice(2);
if (codes.length === 0) throw new Error('Thieu danh sach ma CK');

async function main() {
  const term = await resolveQuarterTerm(3, 2026);
  if (!term) throw new Error('Khong tim thay ky Quy 3/2026');
  const all = (await fetchReportFilesForTerm(term)).filter((r) => codes.includes(r.stockCode));
  const kept = filterReports(all);
  const keptIds = new Set(kept.map((r) => r.fileInfoID));

  console.log(`term reportTermID=${term.reportTermID} yearPeriod=${term.yearPeriod} "${term.description}"\n`);
  for (const r of all) {
    const mark = keptIds.has(r.fileInfoID) ? 'LAY ' : 'BO  ';
    const reason = keptIds.has(r.fileInfoID) ? '' : ` <- ${filterExclusionReason(r)}`;
    console.log(`${mark} ${String(r.fileInfoID).padStart(9)} ${r.stockCode.padEnd(4)} ${r.title}${reason}`);
  }
  console.log(`\nselectedIds=${kept.map((r) => r.fileInfoID).join(',')}`);
  console.log(`so file se tai: ${kept.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
