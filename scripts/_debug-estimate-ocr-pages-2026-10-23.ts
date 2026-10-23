// UOC TINH so trang se OCR (va chi phi) cho cac bao cao that bai, KHONG goi
// OCR. Chay nguyen cac buoc MIEN PHI cua pipeline that:
//   fetchReportFilesForTerm -> downloadOne -> resolveReportSourceFiles
//   -> determineStatementPageScope
// roi dung so trang that + hang so probe trong lib/export/financial-statements.ts
// de suy ra so trang se gui cho Mistral.
//
// Tien the: chinh lan tai nay la phep thu that cho ban sua retry trong
// lib/http.ts/lib/download.ts (cac URL duoi day la cac URL da that bai voi
// "Error: aborted" trong lan chay GitHub Actions 2026-10-23).
//   npx tsx scripts/_debug-estimate-ocr-pages-2026-10-23.ts <thu-muc-tai-ve>
import { mkdirSync } from 'fs';
import { resolveQuarterTerm, fetchReportFilesForTerm } from '../lib/vietstock-reports';
import { downloadOne } from '../lib/download';
import { resolveReportSourceFiles } from '../lib/report-source';
import { determineStatementPageScope } from '../lib/pdf-text';

// Hang so probe - PHAI khop lib/export/financial-statements.ts
const INITIAL_PROBE_BATCH_SIZE = 10;
const EXPAND_STEP = 2;
const MAX_PROBE_PAGES = 20;
const TAIL_PROBE_PAGES = 8;

const CODES = ['UDJ', 'FGL', 'VOS', 'HUG', 'THT', 'HVX', 'MCH', 'PAT', 'NBP'];
const destDir = process.argv[2];
if (!destDir) throw new Error('Thieu thu muc tai ve');
mkdirSync(destDir, { recursive: true });

async function main() {
  const term = await resolveQuarterTerm(3, 2026);
  if (!term) throw new Error('Khong tim thay ky Quy 3/2026');
  const all = await fetchReportFilesForTerm(term);
  const wanted = all.filter((r) => CODES.includes(r.stockCode));
  console.log(`Tim thay ${wanted.length} file cho ${CODES.length} ma\n`);

  let minPages = 0;
  let maxPages = 0;
  for (const report of wanted) {
    try {
      const filePath = await downloadOne(report, destDir);
      const { resolved } = await resolveReportSourceFiles({ report, filePath });
      const entry = resolved[0];
      const target = entry?.filePath ?? filePath;
      const scope = (await determineStatementPageScope([target])).get(target);
      const total = scope?.totalPages ?? 0;
      // Thap nhat: dung ngay sau lo dau. Cao nhat: cham tran + do phan duoi.
      const lo = Math.min(INITIAL_PROBE_BATCH_SIZE, total || INITIAL_PROBE_BATCH_SIZE);
      const hi = Math.min(MAX_PROBE_PAGES, total || MAX_PROBE_PAGES) + Math.min(TAIL_PROBE_PAGES, Math.max(0, total - MAX_PROBE_PAGES));
      minPages += lo;
      maxPages += hi;
      console.log(
        `${report.stockCode.padEnd(4)} ${String(total).padStart(3)} trang PDF | OCR du kien ${lo}-${hi} trang | ${entry?.format ?? '?'} | ${report.title}`
      );
    } catch (error) {
      console.log(`${report.stockCode.padEnd(4)} LOI: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`\nTONG du kien: ${minPages} - ${maxPages} trang (buoc mo rong +${EXPAND_STEP} trang/lan nam giua 2 moc nay)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
