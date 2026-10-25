// Doc LOP TEXT cua PDF goc (khong goi OCR, khong ton phi) va in cac dong khop
// tu khoa - de doi chieu "OCR doc dung chua" voi ban PDF that, theo dung
// nguyen tac feedback_verify_against_source_pdf trong bo nho.
//   npx tsx scripts/_debug-pdf-rows-2026-10-25.ts <file.pdf> <tu-khoa|regex>
import { readFileSync } from 'node:fs';
import { CanvasFactory } from 'pdf-parse/worker';
import { PDFParse } from 'pdf-parse';

void CanvasFactory;

const file = process.argv[2];
const pattern = new RegExp(process.argv[3] || 'Vay|D\\u1ef1 ph\\u00f2ng ph\\u1ea3i tr\\u1ea3|Ph\\u1ea3i tr\\u1ea3 ng\\u1eafn h\\u1ea1n kh\\u00e1c', 'i');
if (!file) throw new Error('Thieu duong dan PDF');

async function main() {
  const parser = new PDFParse({ data: new Uint8Array(readFileSync(file)) });
  const result = await parser.getText();
  const pages = result.pages ?? [];
  console.log(`So trang: ${pages.length}\n`);
  pages.forEach((page: any, idx: number) => {
    const lines = String(page.text || '').split('\n');
    const hits = lines.filter((l) => pattern.test(l));
    if (hits.length) {
      console.log(`--- trang ${idx + 1} ---`);
      for (const h of hits) console.log('   ', h.trim().slice(0, 150));
    }
  });
  await parser.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
