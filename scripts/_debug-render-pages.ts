// Tam thoi: render 1 so trang cua 1 PDF scan ra PNG de XEM TAY (MIEN PHI,
// khong goi OCR) - dung de xac dinh 3 bang chinh nam o trang thu may.
// Dung: npx tsx scripts/_debug-render-pages.ts <pdf> <outDir> <trangDau> <trangCuoi>
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { PDFParse } from 'pdf-parse';
import { CanvasFactory } from 'pdf-parse/worker';

const [pdfPath, outDir, fromStr, toStr] = process.argv.slice(2);
const from = Number(fromStr);
const to = Number(toStr);

(async () => {
  const parser = new PDFParse({ data: await readFile(pdfPath), CanvasFactory });
  try {
    const pageNumbers = Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const shots = await parser.getScreenshot({ scale: 1.4, imageBuffer: true, partial: pageNumbers });
    await mkdir(outDir, { recursive: true });
    for (let i = 0; i < shots.pages.length; i++) {
      const out = join(outDir, `p${pageNumbers[i]}.png`);
      await writeFile(out, Buffer.from(shots.pages[i].data));
      console.log(out);
    }
  } finally {
    await parser.destroy();
  }
})();
