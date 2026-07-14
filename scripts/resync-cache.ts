// Dong bo lai warnings/unreliableCells/analysis trong data/latest-fetch.json
// tu chinh du lieu statements DA CACHE (khong OCR/tai lai) - dung moi khi sua
// code validate-statements.ts/statement-shared.ts/analysis.ts, vi UI (qua
// /api/fetch-status) doc THANG file nay, KHONG tu dong tinh lai khi code doi
// (xem memory "project_stale_cache_resync").
//
// GIOI HAN: "CANH BAO: cong van dinh chinh"/"CANH BAO: ca 3 bang...rong" can
// RAW markdown OCR (isCorrectionNoticeMarkdown/isEmptyParse), khong cache -
// script nay GIU NGUYEN moi warning cu da bat dau bang "CANH BAO:" (khong tu
// suy luan lai duoc) va chi thay THE PHAN CON LAI (issues ky thuat tu
// validateFinancialStatements, luon tinh lai duoc tu statements da co).
//
// Neu 1 doi code la sua PARSER (parseStatementsFromMarkdown/markdown-tables.ts
// - anh huong CACH doc bang tu markdown, khong chi buoc kiem tra sau do), ban
// than `statements` da cache CO THE SAI/THIEU DONG tu truoc - script nay
// KHONG sua duoc truong hop do (can OCR lai that, xem
// feedback_never_reocr_when_cache_exists) - chi dung khi doi la o buoc
// validate/analysis (dung tren statements co san).
import { readFileSync, writeFileSync } from 'fs';
import { validateFinancialStatements, findAllGroupSumMismatches } from '../lib/export/validate-statements';
import { unreliableCellKeysFromMismatches } from '../lib/export/statement-shared';
import { computeAnalysisRows } from '../lib/analysis';

const STATUS_PATH = 'data/latest-fetch.json';
const status = JSON.parse(readFileSync(STATUS_PATH, 'utf-8'));

for (const r of status.reports) {
  const oldCanhBao = r.warnings.filter((w: string) => w.startsWith('CANH BAO:'));
  const issues = validateFinancialStatements(r.statements, r.businessType);
  r.warnings = [...oldCanhBao, ...issues.map((i: { message: string }) => i.message)];

  const mismatches = findAllGroupSumMismatches(r.statements);
  const unreliableCells = {
    balanceSheet: unreliableCellKeysFromMismatches(mismatches.filter((m) => m.table === 'balanceSheet')),
    incomeStatement: unreliableCellKeysFromMismatches(mismatches.filter((m) => m.table === 'incomeStatement')),
  };
  r.analysis = computeAnalysisRows(r.statements, r.businessType, unreliableCells);
}

writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf-8');
console.log(`Da dong bo lai warnings/analysis cho ${status.reports.length} bao cao.`);
