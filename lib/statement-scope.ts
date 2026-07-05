import { normalizeLabelText } from './export/statement-shared';

export type StatementScope = 'Hợp nhất' | 'Riêng lẻ' | 'Chung';

// Phan loai "Hop nhat / Rieng le / Chung" cho cot "Loai BCTC" tren bang tong
// hop - KHONG duoc doan bua khi khong chac (VD nhieu cong ty chi co 1 bao cao
// duy nhat vi khong co cong ty con, khong nen bi gan nham "Hop nhat" hay
// "Rieng le"). Thu tu uu tien (theo yeu cau user 2026-07-05):
// 1. metadataText (title/fullName Vietstock, hoac ten file sau khi giai nen
//    zip/rar) - re, co san truoc khi OCR.
// 2. contentText (text/markdown da trich tu chinh tai lieu) - trang bia BCTC
//    that hau het luon tu ghi ro "BAO CAO TAI CHINH HOP NHAT"/"...RIENG" ke
//    ca khi ten file Vietstock khong ghi.
// 3. Khong thay o ca 2 buoc tren -> "Chung" (nhan hop le, dung cho cong ty
//    khong co cong ty con - KHONG phai suy doan Hop nhat hay Rieng le).
function detectFromText(text: string | undefined): StatementScope | null {
  if (!text) return null;
  const normalized = normalizeLabelText(text);
  if (normalized.includes('HOP NHAT')) return 'Hợp nhất';
  if (normalized.includes('RIENG') || normalized.includes('CONG TY ME')) return 'Riêng lẻ';
  return null;
}

export function classifyStatementScope(input: { metadataText?: string; contentText?: string }): StatementScope {
  return detectFromText(input.metadataText) ?? detectFromText(input.contentText) ?? 'Chung';
}
