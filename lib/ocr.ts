import os from 'os';
import { createScheduler, createWorker } from 'tesseract.js';

export interface OcrPageResult {
  text: string;
}

// So Tesseract worker chay song song - moi worker OCR 1 trang doc lap, giup
// giam thoi gian cho toan bo lo trang xuong gan ty le nghich voi so worker
// (thay vi OCR tuan tu tung trang mot). Gioi han 2-4 de tranh chiem qua nhieu
// RAM (moi worker tu tai model ngon ngu rieng).
const MAX_OCR_WORKERS = Math.max(2, Math.min(4, os.cpus().length));

// Chay OCR local (Tesseract.js, khong goi AI nen khong ton token) tren danh
// sach anh da render san tu tung trang PDF - xem lib/pdf-text.ts (PDFParse
// .getScreenshot) cho phan render PDF -> anh. Chi tra ve text phang - toa do
// tung tu (bbox) tung dung cho bo tach bang cuc bo (lib/export/heuristic-tables.ts,
// da bo, thay bang vision model doc thang anh) nen khong con can nua. Tra ve
// theo DUNG thu tu anh dau vao (khong gop san) de noi goi ghep lai dung vi tri
// trang trong tai lieu goc (mot so trang co the da co text layer, khong can OCR).
//
// Dung 1 scheduler + nhieu worker (MAX_OCR_WORKERS) de OCR NHIEU TRANG SONG
// SONG thay vi tuan tu tung trang - giam dang ke thoi gian cho tren may
// nhieu loi CPU (quan trong khi phai xu ly hang tram bao cao cuoi moi quy).
export async function ocrPageImages(pageImages: Uint8Array[]): Promise<OcrPageResult[]> {
  if (pageImages.length === 0) return [];

  const workerCount = Math.min(MAX_OCR_WORKERS, pageImages.length);
  const scheduler = createScheduler();
  const workers = await Promise.all(Array.from({ length: workerCount }, () => createWorker('vie+eng')));
  workers.forEach((worker) => scheduler.addWorker(worker));

  try {
    const jobs = pageImages.map((image) => scheduler.addJob('recognize', Buffer.from(image)));
    const results = await Promise.all(jobs);
    return results.map((result) => ({ text: result.data.text }));
  } finally {
    await scheduler.terminate();
  }
}
