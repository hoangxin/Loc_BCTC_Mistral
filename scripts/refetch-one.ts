// Re-fetch THAT (OCR Mistral that, ton phi) rieng cho 1 bao cao, theo ma
// STOCK_CODE truyen qua bien moi truong - dung DUNG quy trinh production
// (downloadOne -> resolveReportSourceFiles -> extractReportContent, y het
// worker trong lib/pipeline.ts) - KHONG tu dung lai vong lap OCR/chon
// endpoint rieng (xem CLAUDE.md). Tong quat hoa tu scripts/refetch-acg.ts
// (2026-07-14, ACG) de dung lai duoc cho bat ky ma nao thay vi viet 1 script
// rieng moi lan.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

import { downloadOne } from '../lib/download';
import { resolveReportSourceFiles, cleanupDownloadedFile } from '../lib/report-source';
import { extractReportContent } from '../lib/report-extract';
import { computeAnalysisRows } from '../lib/analysis';
import { classifyStatementScope } from '../lib/statement-scope';
import { recordMarkdownIndex, findMarkdownIndexFor } from '../lib/debug-markdown-index';
import type { ReportFile } from '../lib/vietstock-reports';

const STOCK_CODE = process.argv[2];
if (!STOCK_CODE) throw new Error('Dung: tsx scripts/refetch-one.ts <MA_CO_PHIEU>');

const STATUS_PATH = 'data/latest-fetch.json';
const status = JSON.parse(readFileSync(STATUS_PATH, 'utf-8'));
const cached = status.reports.find((r: any) => r.stockCode === STOCK_CODE);
if (!cached) throw new Error(`Khong tim thay ${STOCK_CODE} trong cache`);

// Ky bao cao lay THANG tu chinh cache (periodSlug/periodYear/statementScope)
// - KHONG doan/mac dinh - dung de tra danh muc markdown DUNG KY VA DUNG LOAI
// (Hop nhat/Cong ty me/Chung), tranh canh bao "trung" nham voi 1 ky KHAC
// hoac 1 loai bao cao KHAC cua CUNG 1 ma (vd Hop nhat vs Rieng le cung
// Q1/2026 la 2 TAI LIEU khac nhau hoan toan) - xem lib/debug-markdown-index.ts.
const PERIOD_LABEL = `${cached.periodSlug}/${cached.periodYear}-${cached.statementScope}`;
const priorEntries = findMarkdownIndexFor(STOCK_CODE, PERIOD_LABEL);
if (priorEntries.length > 0) {
  console.log(`${STOCK_CODE} (${PERIOD_LABEL}): CANH BAO - da co ${priorEntries.length} markdown luu truoc do, kiem tra truoc khi goi OCR that lan nua:`);
  priorEntries.forEach((e) => console.log(`  - ${e.savedAt} | ${e.markdownPath} (${e.pagesFetched ?? '?'} trang, tu ${e.source})`));
}

const report: ReportFile = {
  fileInfoID: 0,
  stockCode: cached.stockCode,
  exchange: cached.exchange,
  companyName: cached.companyName,
  financeUrl: cached.financeUrl,
  fileUrl: cached.fileUrl,
  title: cached.title,
  fullName: cached.title,
  fileExt: '.pdf',
  lastUpdate: new Date(cached.lastUpdate),
};

async function main() {
  const destDir = join(process.cwd(), 'data', 'reports-tmp');
  mkdirSync(destDir, { recursive: true });

  console.log('Downloading', report.fileUrl);
  const filePath = await downloadOne(report, destDir);

  const { resolved, errors } = await resolveReportSourceFiles({ report, filePath });
  if (errors.length > 0) console.error('resolve errors', errors);

  for (const resolvedFile of resolved) {
    console.log('OCR', resolvedFile.filePath);
    const content = await extractReportContent(resolvedFile);
    if (!content) {
      console.log('Bi loai (khong phai tieng Viet)', resolvedFile.filePath);
      continue;
    }
    // Luu MARKDOWN THO ngay lap tuc (truoc ca khi lam gi khac) - dung DUNG
    // yeu cau CLAUDE.md "luu output tho ra dia NGAY sau moi lan goi OCR
    // thanh cong, truoc khi parse/xu ly tiep". SUA 2026-07-15 (su co CTG):
    // truoc day chi luu `content` (ket qua DA PARSE), KHONG phai markdown -
    // khi can chan doan sau parse (vd thieu dong nhung khong rong hoan toan)
    // thi khong con markdown de xem lai, phai OCR THAT lan nua moi co. Gio
    // luu markdown TRUOC TIEN, rieng, luon luon (khong phu thuoc ket qua parse).
    const ts = Date.now();
    mkdirSync(join('data', 'debug-empty-parse'), { recursive: true });
    if (content.markdown !== null) {
      const markdownDumpPath = join('data', 'debug-empty-parse', `refetch-${STOCK_CODE}-${ts}.md`);
      writeFileSync(markdownDumpPath, content.markdown, 'utf-8');
      console.log('Da luu MARKDOWN THO tai', markdownDumpPath);
      recordMarkdownIndex({ stockCode: STOCK_CODE, periodLabel: PERIOD_LABEL, markdownPath: markdownDumpPath, source: 'refetch-one' });
    }
    const dumpPath = join('data', 'debug-empty-parse', `refetch-${STOCK_CODE}-${ts}.json`);
    writeFileSync(dumpPath, JSON.stringify(content, null, 2), 'utf-8');
    console.log('Da luu ket qua da parse tai', dumpPath);
    console.log('warnings:', content.warnings);

    const analysis = computeAnalysisRows(content.statements, content.businessType, content.unreliableCells);
    const metadataText = [resolvedFile.report.title, resolvedFile.report.fullName, resolvedFile.entryName].filter(Boolean).join(' ');
    const newReport = {
      ...cached,
      statementScope: classifyStatementScope({ metadataText, contentText: content.fullText ?? undefined }),
      businessType: content.businessType,
      analysis,
      statements: content.statements,
      warnings: content.warnings,
    };
    status.reports = status.reports.map((r: any) => (r.stockCode === STOCK_CODE ? newReport : r));
    writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf-8');
    console.log(`Da cap nhat data/latest-fetch.json cho ${STOCK_CODE}`);
  }

  await cleanupDownloadedFile(filePath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
