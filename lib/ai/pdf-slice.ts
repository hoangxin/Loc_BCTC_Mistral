import { PDFDocument } from 'pdf-lib';

// Cat rieng cac trang can OCR THANH 1 PDF nho hon TRUOC KHI encode base64 gui
// cho Mistral - truoc day (2026-07-05 den 2026-07-12) ca callMistralOcr va
// callMistralOcrBatch deu gui NGUYEN VAN file goc (dua vao tham so `pages`
// cua Mistral de no tu chon trang can OCR o phia server), du chi can OCR 12-16
// trang trong 1 file scan co the toi 6-24MB - nguoi dung phat hien dieu nay
// (2026-07-12) sau khi debug loi 400 "Bad Request" cua Batch API
// (POST /v1/batch/jobs) tren 4/5 bao cao that: payload JSON qua lon (base64
// CA file 6-24MB) bi tang gateway cua Mistral tu choi truoc khi toi duoc logic
// that (tra ve trang loi Werkzeug generic, khong phai JSON loi cua Mistral).
// Cat truoc giam payload xuong DUNG phan can (thuong <1-2MB cho 12-16 trang),
// vua tranh duoc gioi han kich thuoc, vua giam bang thong ca 2 chieu (upload
// VA tai output_file ve).
export async function slicePdfPages(buffer: Buffer, pageIndicesZeroBased: number[]): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(buffer);
  const destDoc = await PDFDocument.create();
  const copiedPages = await destDoc.copyPages(srcDoc, pageIndicesZeroBased);
  copiedPages.forEach((page) => destDoc.addPage(page));
  const bytes = await destDoc.save();
  return Buffer.from(bytes);
}
