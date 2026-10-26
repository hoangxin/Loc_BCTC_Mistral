// Parse lai 1 PHAN markdown (tu dong A den dong B) de khoanh vung xem 1 bang
// bi mat o buoc nao: neu parse rieng doan chua bang do van ra rong thi loi o
// phan loai/doc bang; neu ra du thi loi o buoc gop/chon bang cua ca tai lieu.
//   npx tsx scripts/_debug-parse-slice-2026-10-26.ts <file.md> <dong-dau> [dong-cuoi]
import { readFileSync } from 'fs';
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';

const [file, fromArg, toArg] = process.argv.slice(2);
if (!file || !fromArg) throw new Error('Cach dung: <file.md> <dong-dau> [dong-cuoi]');

const lines = readFileSync(file, 'utf-8').split('\n');
const slice = lines.slice(Number(fromArg) - 1, toArg ? Number(toArg) : undefined).join('\n');
const statements = parseStatementsFromMarkdown(slice);

for (const [key, table] of Object.entries(statements)) {
  console.log(`${key.padEnd(18)} ${table.rows.length} dong | cot: ${JSON.stringify(table.columns)}`);
  for (const row of table.rows.slice(0, 3)) console.log('   ', JSON.stringify(row));
}
