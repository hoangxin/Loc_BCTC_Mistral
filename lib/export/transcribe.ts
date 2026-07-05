import { callMistralOcr } from '../ai/mistral-ocr';
import { cleanMarkdownForPdfText } from './markdown-tables';

// Chep toan van CA TAI LIEU (tat ca so trang duoc truyen vao, thuong la toan
// bo tai lieu ke ca phan Thuyet minh) - CHI goi cho danh sach bao cao da qua
// bo loc noi dung (lib/content-filter.ts), dung xuat .clean.pdf day du cho cac
// cong ty duoc chon (xem lib/pipeline.ts).
//
// Don gian hoa RAT NHIEU so voi ban Qwen vision cu (goi vision model theo tung
// lo 6 trang roi noi lai): Mistral OCR nhan thang ca file PDF trong 1 request
// duy nhat (da test that voi TIX 29 trang, xong trong vai giay - xem
// lib/ai/mistral-ocr.ts), khong can chia lo/render anh tung trang nua.
export async function transcribeFullDocument(filePath: string, pageNumbers: number[]): Promise<string> {
  const pagesZeroBased = pageNumbers.map((n) => n - 1);
  const { pages } = await callMistralOcr(filePath, { pages: pagesZeroBased });
  const markdown = pages.map((p) => p.markdown).join('\n\n');
  return cleanMarkdownForPdfText(markdown);
}
