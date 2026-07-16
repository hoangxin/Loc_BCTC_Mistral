// OCR THAT theo 1 khoang trang CO DINH (nguoi dung tu xac dinh truoc, vd da
// xem qua PDF that va biet dung LCTT nam o dau) - khac voi ocr-capped-probe.ts
// (adaptive, tu mo rong tu 12 den 16 trang). Van dung DUNG quy trinh production
// de chon file (downloadOne -> resolveReportSourceFiles) va DUNG client OCR
// production (callMistralOcrBatch) - xem CLAUDE.md, khong tu chon file/endpoint
// rieng, khong hand-roll logic OCR khac production.
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

import { downloadOne } from '../lib/download';
import { resolveReportSourceFiles, cleanupDownloadedFile } from '../lib/report-source';
import { callMistralOcrBatch } from '../lib/ai/mistral-ocr-batch';
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import { classifyBusinessType } from '../lib/business-type';
import { recordMarkdownIndex, findMarkdownIndexFor } from '../lib/debug-markdown-index';
import type { ReportFile } from '../lib/vietstock-reports';

const STOCK_CODE = process.argv[2];
const FILE_URL = process.argv[3];
const PERIOD_LABEL = process.argv[4];
// 1-based, inclusive - dung theo cach nguoi dung doc so trang tren PDF that.
const PAGE_START_1BASED = Number(process.argv[5]);
const PAGE_END_1BASED = Number(process.argv[6]);

if (!STOCK_CODE || !FILE_URL || !PERIOD_LABEL || !PAGE_START_1BASED || !PAGE_END_1BASED) {
  throw new Error('Dung: tsx scripts/ocr-explicit-range.ts <MA> <file_url> <ky_bao_cao+loai> <trang_dau_1based> <trang_cuoi_1based>');
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

async function ocrOne(filePath: string): Promise<void> {
  const pagesZeroBased = Array.from({ length: PAGE_END_1BASED - PAGE_START_1BASED + 1 }, (_, i) => PAGE_START_1BASED - 1 + i);
  console.log(`${STOCK_CODE}: OCR trang (1-based) ${PAGE_START_1BASED}..${PAGE_END_1BASED} (${pagesZeroBased.length} trang)`);
  const { pages } = await callMistralOcrBatch(filePath, { pages: pagesZeroBased });
  const markdown = pages.map((p) => p.markdown).join('\n\n');

  mkdirSync(join('data', 'debug-empty-parse'), { recursive: true });
  const safeName = filePath.replace(/[\\/:]/g, '_').replace(/\.pdf$/i, '');
  const mdPath = join('data', 'debug-empty-parse', `${STOCK_CODE}-range${PAGE_START_1BASED}-${PAGE_END_1BASED}-${safeName}-${Date.now()}.md`);
  writeFileSync(mdPath, markdown, 'utf-8');
  console.log(`${STOCK_CODE}: da luu markdown tho tai ${mdPath}`);
  recordMarkdownIndex({ stockCode: STOCK_CODE, periodLabel: PERIOD_LABEL, markdownPath: mdPath, pagesFetched: pages.length, source: `ocr-explicit-range(${PAGE_START_1BASED}-${PAGE_END_1BASED})` });

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
    await ocrOne(resolvedFile.filePath);
  }

  await cleanupDownloadedFile(filePath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
