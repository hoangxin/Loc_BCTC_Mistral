// Render 1 vai trang cua 1 PDF ra PNG de NGUOI/Claude nhin tan mat (mien phi,
// KHONG goi OCR) - dung khi can biet 1 file scan chua gi ma khong muon ton
// tien OCR de kiem chung gia thuyet.
//   npx tsx scripts/_debug-render-page-images-2026-10-26.ts <file.pdf> <thu-muc-out> <trang...>
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { CanvasFactory } from 'pdf-parse/worker';
import { PDFParse } from 'pdf-parse';

const [filePath, outDir, ...pageArgs] = process.argv.slice(2);
if (!filePath || !outDir || pageArgs.length === 0) throw new Error('Cach dung: <file.pdf> <thu-muc-out> <trang...>');
const pages = pageArgs.map(Number);

async function main() {
  await mkdir(outDir, { recursive: true });
  const parser = new PDFParse({ data: await readFile(filePath), CanvasFactory });
  try {
    const shots = await parser.getScreenshot({ scale: 1.6, imageBuffer: true, partial: pages });
    for (const page of shots.pages) {
      const out = join(outDir, `tr${page.pageNumber}.png`);
      await writeFile(out, Buffer.from(page.data));
      console.log(out);
    }
  } finally {
    await parser.destroy();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
