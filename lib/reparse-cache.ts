// Parse lai TOAN BO bao cao co markdown OCR THO da luu san (data/ocr-markdown/)
// bang parser HIEN TAI - KHONG OCR that lan nao, khong ton phi. Dung
// buildResultFromMarkdown (lib/export/financial-statements.ts) de dam bao dung
// y het logic production, khong hand-roll rieng (xem CLAUDE.md).
//
// Logic nam o lib/ (khong nam trong scripts/) vi co HAI noi goi:
//  - scripts/reparse-all-saved-markdown.ts: chay tay tren may ca nhan.
//  - scripts/run-fetch.ts voi FETCH_MODE=reparse: chay tren GitHub Actions
//    runner. Can duong nay vi data/latest-fetch.json da ~43MB, vuot gioi han
//    blob cua GitHub REST API, nen mot may KHONG CAI git khong co cach nao
//    day ket qua len - phai de runner (co git that) tu chay va tu commit.
//
// Ten file quy uoc: {STOCK}__{YEAR}{Q1-4|6T|9T|Nam}{Chung|Hopnhat|Riengle}.md
// (xem lib/ocr-markdown-store.ts) - suy nguoc lai periodYear/periodSlug/
// statementScope tu ten file de khop dung report trong cache.
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { buildResultFromMarkdown } from './export/financial-statements';
import { parseStatementsFromMarkdown } from './export/markdown-tables';
import { findAllGroupSumMismatches } from './export/validate-statements';
import { computeAnalysisRows } from './analysis';
import { dedupeByIdentityKeepingLast } from './pipeline';
import { readStatus, writeStatus } from './status-store';

const DIR = 'data/ocr-markdown';

const SCOPE_MAP: Record<string, string> = { Chung: 'Chung', Hopnhat: 'Hợp nhất', Riengle: 'Riêng lẻ' };

// CHOT CHAN CHONG MAT DU LIEU (2026-10-20): markdown luu trong
// data/ocr-markdown/ KHONG PHAI LUC NAO CUNG la nguon day du cua bao cao do.
// Da xac nhan that voi ART/MIG/QHD: cache dang giu so lieu THAT (vd QHD
// bs116/is22/cf31) lay tu nguon khac (QHD: 3 file markdown cat tay ma vong
// lap nay bo qua - xem project_vnz_metadata_column_and_lnst_fix_2026-08-07),
// trong khi parse lai tu file .md o day cho ra 0 dong. Truoc day ham nay ghi
// de thang -> cac phien lam viec truoc phai khoi phuc tay.
//
// Nguong duoi (khong dung dieu kien "ca 3 bang cung rong"): MIG lot luoi dieu
// kien do vi LCTT van con 9 dong trong khi BCDKT 77 -> 0 va KQKD 42 -> 0, tuc
// la van mat sach 2 bang chinh. Nguoc lai, 1 bang chi co ~10 dong roi ve 0
// (TMT: bang tom tat giai trinh ghi bang TRIEU dong, bi nham la KQKD) la
// parser loai dung rac - phai cho cap nhat, vi giu lai so cu nghia la giu lai
// 1 con so SAI DON VI. Khong co bang BCDKT/KQKD/LCTT THAT nao duoi 15 dong.
const SUBSTANTIAL_ROWS = 15;

export interface ReparseSummary {
  updated: number;
  skipped: number;
  preserved: string[];
  failedBefore: number;
  failedAfter: number;
  excludedBefore: number;
  excludedAfter: number;
}

export function reparseAllSavedMarkdown(): ReparseSummary {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.md'));
  // Doc/ghi qua status-store: trang thai nam o data/fetch-status/ (moi ky 1
  // file) tu 2026-10-25, xem lib/status-store.ts.
  const status = readStatus();

  let updated = 0;
  let skipped = 0;
  const preserved: string[] = [];

  for (const file of files.sort()) {
    const m = file.match(/^([A-Z0-9]+)__(\d{4})(Q[1-4]|6T|9T|Nam)(Chung|Hopnhat|Riengle)\.md$/);
    if (!m) {
      console.log(`!! Ten file khong khop mau, bo qua: ${file}`);
      skipped++;
      continue;
    }
    const [, stockCode, yearStr, periodSlug, scopeKey] = m;
    const statementScope = SCOPE_MAP[scopeKey];
    const periodYear = Number(yearStr);

    const idx = status.reports.findIndex(
      (r: any) => r.stockCode === stockCode && r.periodYear === periodYear && r.periodSlug === periodSlug && r.statementScope === statementScope
    );
    if (idx === -1) {
      console.log(`!! Khong tim thay ${stockCode} ${periodYear}-${periodSlug} ${statementScope} trong cache - bo qua`);
      skipped++;
      continue;
    }

    const markdown = readFileSync(`${DIR}/${file}`, 'utf-8');
    const statements = parseStatementsFromMarkdown(markdown);
    const mismatches = findAllGroupSumMismatches(statements);
    const result = buildResultFromMarkdown(markdown, statements, mismatches);
    const analysis = computeAnalysisRows(result.statements, result.businessType, result.unreliableCells);

    const old = status.reports[idx];
    const oldCounts = `bs${old.statements.balanceSheet.rows.length}/is${old.statements.incomeStatement.rows.length}/cf${old.statements.cashFlow.rows.length}/w${old.warnings.length}`;
    const newCounts = `bs${result.statements.balanceSheet.rows.length}/is${result.statements.incomeStatement.rows.length}/cf${result.statements.cashFlow.rows.length}/w${result.warnings.length}`;
    const changed = oldCounts !== newCounts;

    const lostStatement = (['balanceSheet', 'incomeStatement', 'cashFlow'] as const).some(
      (key) => old.statements[key].rows.length >= SUBSTANTIAL_ROWS && result.statements[key].rows.length === 0
    );
    if (lostStatement) {
      console.log(`!! GIU NGUYEN ${stockCode.padEnd(5)} ${statementScope.padEnd(9)} ${oldCounts} -> ${newCounts} (parse lai ra RONG, khong ghi de du lieu that)`);
      preserved.push(`${stockCode} ${periodYear}-${periodSlug} ${statementScope}`);
      skipped++;
      continue;
    }

    console.log(`${changed ? 'THAY DOI' : 'khong doi'}  ${stockCode.padEnd(5)} ${statementScope.padEnd(9)} ${oldCounts} -> ${newCounts}`);

    status.reports[idx] = {
      ...old,
      businessType: result.businessType,
      statements: result.statements,
      warnings: result.warnings,
      analysis,
    };
    updated++;
  }

  // Khu trung 2 danh sach CONG DON (2026-10-20): `failed` va `excludedReports`
  // cong don qua moi lan chay va truoc day KHONG khu trung, nen 1 bao cao that
  // bai/bi loai o N lan chay de lai dung N dong y het nhau (that: 6 ma Q3/2026
  // loi 404 x 2 lan chay = 12 dong tren UI, kem 213 dong excluded trung).
  // lib/pipeline.ts da khu trung tu lan chay SAU, nhung cac dong CU da nam san
  // trong cache thi chi don duoc o day - dung CHUNG 1 ham de 2 noi khong lech.
  const failedBefore = status.failed.length;
  const excludedBefore = status.excludedReports.length;
  status.failed = dedupeByIdentityKeepingLast(status.failed);
  status.excludedReports = dedupeByIdentityKeepingLast(status.excludedReports);

  // generatedAt phai doi: client (app/FetchControls.tsx) poll chinh truong nay
  // de biet "da xong"; khong doi thi UI tuong khong co gi thay doi.
  status.generatedAt = new Date().toISOString();

  writeStatus(status);

  return {
    updated,
    skipped,
    preserved,
    failedBefore,
    failedAfter: status.failed.length,
    excludedBefore,
    excludedAfter: status.excludedReports.length,
  };
}
