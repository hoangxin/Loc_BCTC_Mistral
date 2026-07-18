// Re-parse TOAN BO markdown tho da luu o data/ocr-markdown/ bang production
// parseStatementsFromMarkdown + validateFinancialStatements CUA CODE HIEN TAI,
// so sanh voi warnings cu da luu trong data/latest-fetch.json (tinh boi code
// CU luc fetch that tren Vercel) - kiem tra fix co dung khong (giam warnings
// sai) va khong gay regression (khong duoc THEM warning moi tren bao cao
// truoc do sach).
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';
import { validateFinancialStatements } from '../lib/export/validate-statements';

const mdDir = join(__dirname, '../data/ocr-markdown');
const oldData = JSON.parse(readFileSync(join(__dirname, '../data/latest-fetch.json'), 'utf-8'));
const oldByKey = new Map<string, any>();
for (const r of oldData.reports) oldByKey.set(`${r.stockCode}__${r.statementScope}`, r);

const scopeFromFile = (f: string) => (f.includes('Hopnhat') ? 'Hợp nhất' : f.includes('Riengle') ? 'Riêng lẻ' : 'Chung');

const files = readdirSync(mdDir).filter((f) => f.endsWith('.md'));
let changedCount = 0;
for (const f of files) {
  const code = f.split('__')[0];
  const scope = scopeFromFile(f);
  const key = `${code}__${scope}`;
  const md = readFileSync(join(mdDir, f), 'utf-8');
  const fresh = parseStatementsFromMarkdown(md);
  const old = oldByKey.get(key);
  if (!old) {
    console.log(`${key}: KHONG TIM THAY trong latest-fetch.json de doi chieu (scope co the khac ten)`);
    continue;
  }
  const newWarnings: string[] = validateFinancialStatements(fresh, old.businessType).map((i) => i.message);
  const oldWarnings: string[] = old.warnings || [];
  const added = newWarnings.filter((w) => !oldWarnings.includes(w));
  const removed = oldWarnings.filter((w) => !newWarnings.includes(w));
  if (added.length === 0 && removed.length === 0) continue;
  changedCount++;
  console.log(`\n=== ${key} ===`);
  if (removed.length) {
    console.log(' -- warnings CU da het (fix xoa duoc):');
    removed.forEach((w) => console.log('   - ' + w));
  }
  if (added.length) {
    console.log(' ++ warnings MOI xuat hien (can xem lai!):');
    added.forEach((w) => console.log('   + ' + w));
  }
}
console.log(`\n=== ${files.length} file markdown re-parse | ${changedCount} bao cao co thay doi warnings ===`);
