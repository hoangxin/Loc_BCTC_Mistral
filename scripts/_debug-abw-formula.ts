import { readFileSync } from 'fs';
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import { findIncomeStatementFormulaMismatches } from '../lib/export/statement-shared';

const md = readFileSync(process.argv[2], 'utf-8');
const statements = parseStatementsFromMarkdown(md);
const businessType = (process.argv[3] as any) || 'securities';
const mismatches = findIncomeStatementFormulaMismatches(statements.incomeStatement, businessType);
mismatches.forEach((m) => console.log(JSON.stringify(m)));
