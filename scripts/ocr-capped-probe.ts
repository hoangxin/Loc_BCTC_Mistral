// OCR THAT co GIOI HAN CUNG (theo yeu cau nguoi dung: 12 trang dau, mo rong
// toi da den 16 trang - KHONG chay adaptive probe toi het file). Dung DUNG
// quy trinh production de chon file (downloadOne -> resolveReportSourceFiles,
// y het lib/pipeline.ts/refetch-one.ts - QUAN TRONG cho cac ma la file .zip,
// vd CTS tung bi chon nham file phu trong zip, xem CLAUDE.md: khong tu chon
// file/endpoint rieng). Chi rieng vong lap OCR sau khi co file dung la GIOI
// HAN CUNG o 16 trang thay vi de adaptive tu mo rong het file - dung
// callMistralOcrBatch (client OCR production) truc tiep cho phan nay.
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

import { downloadOne } from '../lib/download';
import { resolveReportSourceFiles, cleanupDownloadedFile } from '../lib/report-source';
import { callMistralOcrBatch } from '../lib/ai/mistral-ocr-batch';
import { determineStatementPageScope } from '../lib/pdf-text';
import { containsNotesSectionMarker, parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import { classifyBusinessType } from '../lib/business-type';
import { recordMarkdownIndex, findMarkdownIndexFor } from '../lib/debug-markdown-index';
import type { ReportFile } from '../lib/vietstock-reports';

const STOCK_CODE = process.argv[2];
const FILE_URL = process.argv[3];
// BAT BUOC (khong doan/mac dinh) - PHAI gom CA ky bao cao LAN loai bao cao
// (Hop nhat/Cong ty me/Chung) - dung de ghi vao danh muc markdown DUNG KY,
// DUNG LOAI (xem lib/debug-markdown-index.ts), tranh canh bao "trung" nham
// khi mot ky KHAC (vd Q2/2026) HOAC mot loai bao cao KHAC (vd Rieng le thay
// vi Hop nhat) cua CUNG 1 ma duoc fetch sau nay - 2 loai nay la 2 TAI LIEU
// hoan toan khac nhau du cung ky.
const PERIOD_LABEL = process.argv[4];
const MAX_PAGES = 16;
const INITIAL = 12;
const STEP = 2;

if (!STOCK_CODE || !FILE_URL || !PERIOD_LABEL) {
  throw new Error('Dung: tsx scripts/ocr-capped-probe.ts <MA> <file_url> <ky_bao_cao+loai vd "Q1/2026-HopNhat">');
}

const report: ReportFile = {
  fileInfoID: 0,
  stockCode: STOCK_CODE,
  exchange: 'HOSE',
  companyName: STOCK_CODE,
  financeUrl: '',
  fileUrl: FILE_URL,
  title: STOCK_CODE,
  fullName: STOCK_CODE,
  fileExt: FILE_URL.endsWith('.zip') ? '.zip' : '.pdf',
  lastUpdate: new Date(),
};

async function probeOne(filePath: string): Promise<void> {
  const scopeMap = await determineStatementPageScope([filePath]);
  const scope = scopeMap.get(filePath);
  if (scope?.error) {
    console.log(`${STOCK_CODE}: loi xac dinh so trang - ${scope.error}`);
    return;
  }
  if (scope?.isLikelyNonVietnamese) {
    console.log(`${STOCK_CODE}: bi loai (khong phai tieng Viet, phat hien qua text layer)`);
    return;
  }
  const totalPages = scope?.totalPages ?? MAX_PAGES;
  const cap = Math.min(MAX_PAGES, totalPages);

  const collected: { index: number; markdown: string }[] = [];
  let cursor = 0;
  while (cursor < cap) {
    const step = collected.length === 0 ? INITIAL : STEP;
    const batchEnd = Math.min(cursor + step, cap);
    const pagesZeroBased = Array.from({ length: batchEnd - cursor }, (_, i) => cursor + i);
    console.log(`${STOCK_CODE}: OCR trang (0-based) ${pagesZeroBased[0]}..${pagesZeroBased[pagesZeroBased.length - 1]} (tong file ${totalPages} trang, gioi han ${cap})`);
    const { pages } = await callMistralOcrBatch(filePath, { pages: pagesZeroBased });
    collected.push(...pages);
    cursor = batchEnd;

    const markdownSoFar = collected.map((p) => p.markdown).join('\n\n');
    const found = containsNotesSectionMarker(markdownSoFar);
    console.log(`${STOCK_CODE}: da OCR ${collected.length} trang, tim thay diem cat: ${found}`);
    if (found) break;
  }

  const markdown = collected.map((p) => p.markdown).join('\n\n');
  mkdirSync(join('data', 'debug-empty-parse'), { recursive: true });
  const safeName = filePath.replace(/[\\/:]/g, '_').replace(/\.pdf$/i, '');
  const mdPath = join('data', 'debug-empty-parse', `${STOCK_CODE}-capped${MAX_PAGES}-${safeName}-${Date.now()}.md`);
  writeFileSync(mdPath, markdown, 'utf-8');
  console.log(`${STOCK_CODE}: da luu markdown tho tai ${mdPath}`);
  recordMarkdownIndex({ stockCode: STOCK_CODE, periodLabel: PERIOD_LABEL, markdownPath: mdPath, pagesFetched: collected.length, source: 'ocr-capped-probe' });

  const found = containsNotesSectionMarker(markdown);
  if (!found) {
    console.log(`${STOCK_CODE}: KHONG TIM THAY diem cat trong ${collected.length} trang - DUNG lai, khong OCR them.`);
    return;
  }
  const statements = parseStatementsFromMarkdown(markdown);
  const businessType = classifyBusinessType(markdown);
  console.log(`${STOCK_CODE}: businessType=${businessType}`);
  console.log(`${STOCK_CODE}: balanceSheet=${statements.balanceSheet.rows.length} dong, incomeStatement=${statements.incomeStatement.rows.length} dong, cashFlow=${statements.cashFlow.rows.length} dong, offBalanceSheet=${statements.offBalanceSheet.rows.length} dong`);
}

async function main() {
  const priorEntries = findMarkdownIndexFor(STOCK_CODE, PERIOD_LABEL);
  if (priorEntries.length > 0) {
    console.log(`${STOCK_CODE}: CANH BAO - da co ${priorEntries.length} markdown luu truoc do, kiem tra truoc khi goi OCR that lan nua:`);
    priorEntries.forEach((e) => console.log(`  - ${e.savedAt} | ${e.markdownPath} (${e.pagesFetched ?? '?'} trang, tu ${e.source})`));
  }
  const destDir = join(process.cwd(), 'data', 'reports-tmp');
  mkdirSync(destDir, { recursive: true });
  console.log(`${STOCK_CODE}: Downloading ${report.fileUrl}`);
  const filePath = await downloadOne(report, destDir);

  const { resolved, errors } = await resolveReportSourceFiles({ report, filePath });
  if (errors.length > 0) console.error(`${STOCK_CODE}: resolve errors`, errors);
  console.log(`${STOCK_CODE}: resolved ${resolved.length} file(s):`, resolved.map((r) => r.filePath));

  for (const resolvedFile of resolved) {
    if (resolvedFile.format !== 'pdf') {
      console.log(`${STOCK_CODE}: bo qua file khong phai pdf: ${resolvedFile.filePath}`);
      continue;
    }
    await probeOne(resolvedFile.filePath);
  }

  await cleanupDownloadedFile(filePath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
