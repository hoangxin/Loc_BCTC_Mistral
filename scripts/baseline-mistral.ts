// !!! DA CU/NGUY HIEM - KHONG CHAY LAI NHU HIEN TRANG !!!
// Viet 2026-07-08, TRUOC khi chuyen sang Batch API (2026-07-12). Tu dung lai
// vong lap probe theo trang va goi thang callMistralOcr (sync, gia gap doi,
// da bi thay bang callMistralOcrBatch trong pipeline chinh) - day CHINH LA
// anti-pattern ma CLAUDE.md muc "Sự cố 2026-07-14" cam: KHONG tu viet lai
// vong lap goi OCR trong 1 script roi, luon tai dung
// extractFinancialStatementsWithOcrProbe (lib/export/financial-statements.ts)
// hoac extractReportContent (lib/report-extract.ts). Giu lai file nay chi de
// tham khao lich su, KHONG chay truc tiep - neu can baseline lai, viet script
// moi goi ham production o tren.
import { existsSync } from 'fs';
import { join } from 'path';
import { writeFile } from 'fs/promises';
import { callMistralOcr, type MistralOcrPage } from '../lib/ai/mistral-ocr';
import { containsNotesSectionMarker, parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import { validateFinancialStatements } from '../lib/export/validate-statements';

const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

const FILE = 'data/reports/2026-Q2/TIX_Baocaotaichinh_Q2_2026.pdf';
const TOTAL_PAGES = 29;
const INITIAL_PROBE_BATCH_SIZE = 12;
const EXPAND_STEP = 2;

(async () => {
  const collected: MistralOcrPage[] = [];
  let cursor = 0;

  while (cursor < TOTAL_PAGES) {
    const step = collected.length === 0 ? INITIAL_PROBE_BATCH_SIZE : EXPAND_STEP;
    const batchEnd = Math.min(cursor + step, TOTAL_PAGES);
    const pagesZeroBased = Array.from({ length: batchEnd - cursor }, (_, i) => cursor + i);
    const { pages } = await callMistralOcr(FILE, { pages: pagesZeroBased });
    collected.push(...pages);
    cursor = batchEnd;
    console.log(`OCR'd pages up to ${cursor} (1-based: 1-${cursor})`);

    const markdownSoFar = collected.map((p) => p.markdown).join('\n\n');
    if (containsNotesSectionMarker(markdownSoFar)) {
      console.log(`Found "Thuyet minh" marker after page ${cursor}`);
      break;
    }
  }

  const markdown = collected.map((p) => p.markdown).join('\n\n');
  const statements = parseStatementsFromMarkdown(markdown);
  const issues = validateFinancialStatements(statements, 'other');

  console.log('pages used (1-based):', `1-${cursor}`);
  console.log('warnings:', issues.map((i) => i.message));

  await writeFile('scripts/out/tix-mistral-markdown.md', markdown);
  await writeFile('scripts/out/tix-mistral-statements.json', JSON.stringify(statements, null, 2));
  await writeFile('scripts/out/tix-page-range.json', JSON.stringify({ pageCount: cursor }));
  console.log('saved markdown + statements JSON + page range');
})();
