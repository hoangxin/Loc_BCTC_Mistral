import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';

const dir = 'data/debug-empty-parse';
const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
for (const f of files) {
  const md = readFileSync(join(dir, f), 'utf-8');
  try {
    const s = parseStatementsFromMarkdown(md);
    const code = f.split('-')[0];
    console.log(
      `${code.padEnd(6)} BS=${String(s.balanceSheet.rows.length).padStart(3)} IS=${String(s.incomeStatement.rows.length).padStart(3)} CF=${String(s.cashFlow.rows.length).padStart(3)} OB=${String(s.offBalanceSheet.rows.length).padStart(3)}  ${f.slice(0, 22)}`
    );
  } catch (e) {
    console.log(`${f}: ERROR ${(e as Error).message}`);
  }
}
