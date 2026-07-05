import mammoth from 'mammoth';
import { parseStatementsFromMarkdown } from './markdown-tables';
import { validateFinancialStatements } from './validate-statements';
import type { FinancialStatements } from './statement-shared';

export interface ExtractFromDocxResult {
  statements: FinancialStatements;
  fullText: string;
  warnings: string[];
}

const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, (entity) => HTML_ENTITY_MAP[entity] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

function tableHtmlToMarkdown(tableHtml: string): string {
  const rowMatches = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const rows = rowMatches.map((rowMatch) =>
    [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cellMatch) => stripTags(cellMatch[1]).replace(/\|/g, '/'))
  );
  if (rows.length === 0) return '';

  const columnCount = Math.max(...rows.map((row) => row.length));
  const pad = (row: string[]) => Array.from({ length: columnCount }, (_, i) => row[i] ?? '');

  const lines = [
    `| ${pad(rows[0]).join(' | ')} |`,
    `| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`,
    ...rows.slice(1).map((row) => `| ${pad(row).join(' | ')} |`),
  ];
  return lines.join('\n');
}

// Chuyen HTML mammoth tra ve thanh markdown pipe-table CUNG cu phap Mistral
// OCR tra ve (xem lib/export/markdown-tables.ts) - de tai dung NGUYEN
// parseStatementsFromMarkdown, khong viet lai logic nhan dien 3 bang/can cot.
// Regex-based (khong dung DOM parser day du) - du dung vi HTML mammoth sinh ra
// kha deu dan (khong phai HTML web tuy y). Han che da biet: chua xu ly
// colspan/rowspan (hiem gap trong bang BCTC chinh, thuong chi co o bang phu
// trong Thuyet minh).
function htmlTablesToMarkdown(html: string): string {
  const blockPattern = /<table[\s\S]*?<\/table>|<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<p[^>]*>[\s\S]*?<\/p>|<li[^>]*>[\s\S]*?<\/li>/gi;
  const blocks = html.match(blockPattern) ?? [];

  const lines: string[] = [];
  for (const block of blocks) {
    if (/^<table/i.test(block)) {
      const markdownTable = tableHtmlToMarkdown(block);
      if (markdownTable) lines.push('', markdownTable, '');
    } else {
      const text = stripTags(block);
      if (text) lines.push(text);
    }
  }
  return lines.join('\n');
}

// .docx doc truc tiep bang mammoth (thu vien JS doc XML cua file .docx) -
// KHONG goi Mistral OCR/AI nao ca (khac PDF, phai OCR vi la anh scan/can
// vision model doc bo cuc) - dung yeu cau user 2026-07-05 "Word thi khong can
// gui len AI cho buoc OCR".
export async function extractFinancialStatementsFromDocx(filePath: string): Promise<ExtractFromDocxResult> {
  const [htmlResult, textResult] = await Promise.all([
    mammoth.convertToHtml({ path: filePath }),
    mammoth.extractRawText({ path: filePath }),
  ]);

  const markdown = htmlTablesToMarkdown(htmlResult.value);
  const statements = parseStatementsFromMarkdown(markdown);
  const issues = validateFinancialStatements(statements);

  return { statements, fullText: textResult.value, warnings: issues.map((issue) => issue.message) };
}
