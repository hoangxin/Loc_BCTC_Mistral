import WordExtractor from 'word-extractor';
import { parseStatementsFromMarkdown } from './markdown-tables';
import { validateFinancialStatements } from './validate-statements';
import { autoColumnarize } from '../text-columnarize';
import type { FinancialStatements } from './statement-shared';

export interface ExtractFromDocResult {
  statements: FinancialStatements;
  fullText: string;
  warnings: string[];
}

// .doc (Word 97-2003 nhi phan cu) qua word-extractor CHI cho text thuan
// (getBody()), KHONG co ranh gioi cot/bang HTML ro rang nhu .docx (mammoth) -
// phai TU DOAN ranh gioi cot tu vi tri cac token giong so, dung LAI chinh xac
// co che da co (`autoColumnarize`, lib/text-columnarize.ts) dang dung cho
// phan Thuyet minh dang text phang trong lib/export/pdf.ts. Do khong biet
// truoc so cot/ten cot that (khac han bang HTML that cua .docx), dung header
// GIA ("Cot 1/Cot 2...") chi de tao dung cu phap markdown hop le cho
// parseStatementsFromMarkdown - findLabelColumnIndex se fallback ve cot 0 (la
// dung, vi autoColumnarize luon giu phan van ban truoc con so dau tien lam
// cot 0). Do tin cay THAP HON .docx/PDF - khong co ranh gioi cot goc, chi suy
// luan tu so lieu (dung rui ro tuong tu phan Thuyet minh da chap nhan truoc
// do) - validateFinancialStatements van chay fail-closed de bao warnings neu
// lech, khong am tham tin sai.
function buildSyntheticMarkdownTable(pipeLines: string[]): string {
  const rows = pipeLines.map((line) => line.split('|').map((cell) => cell.trim()));
  const columnCount = Math.max(...rows.map((row) => row.length));
  const header = Array.from({ length: columnCount }, (_, i) => (i === 0 ? 'Chi tieu' : `Cot ${i + 1}`));
  const separator = Array.from({ length: columnCount }, () => '---');
  const pad = (row: string[]) => Array.from({ length: columnCount }, (_, i) => row[i] ?? '');

  return [`| ${header.join(' | ')} |`, `| ${separator.join(' | ')} |`, ...rows.map((row) => `| ${pad(row).join(' | ')} |`)].join('\n');
}

function docTextToPseudoMarkdown(rawText: string): string {
  const lines = rawText.split(/\r?\n/).map((line) => autoColumnarize(line));
  const output: string[] = [];
  let buffer: string[] = [];

  const flushBuffer = () => {
    if (buffer.length > 0) {
      output.push('', buildSyntheticMarkdownTable(buffer), '');
      buffer = [];
    }
  };

  for (const line of lines) {
    if (line.includes('|')) {
      buffer.push(line);
    } else {
      flushBuffer();
      output.push(line);
    }
  }
  flushBuffer();

  return output.join('\n');
}

export async function extractFinancialStatementsFromDoc(filePath: string): Promise<ExtractFromDocResult> {
  const extractor = new WordExtractor();
  const doc = await extractor.extract(filePath);
  const fullText = doc.getBody();

  const pseudoMarkdown = docTextToPseudoMarkdown(fullText);
  const statements = parseStatementsFromMarkdown(pseudoMarkdown);
  const issues = validateFinancialStatements(statements);

  return { statements, fullText, warnings: issues.map((issue) => issue.message) };
}
