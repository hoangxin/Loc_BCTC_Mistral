// Kieu du lieu dung chung cho 3 bang BCTC - tach rieng file nay (2026-07-05)
// vi financial-statements.ts, excel.ts, pdf.ts, validate-statements.ts,
// markdown-tables.ts deu can import cung 1 bo type/helper nay.

export interface StatementTable {
  columns: string[];
  rows: (string | number | null)[][];
}

export interface FinancialStatements {
  balanceSheet: StatementTable;
  incomeStatement: StatementTable;
  cashFlow: StatementTable;
}

const COMBINING_DIACRITICS = new RegExp('[̀-ͯ]', 'g');

// "Đ/đ" (U+0110/U+0111) KHONG phai la "D" + dau phu ghep tu NFD - no la 1 MA
// UNICODE RIENG BIET, nen NFD + bo combining-diacritics (o tren) khong dua no
// ve "D" duoc, con lai nguyen "Đ" trong chuoi da "normalize" - da gap that
// (2026-07-05, lib/export/markdown-tables.ts): marker "KET QUA HOAT DONG..."
// (viet plain D) khong khop duoc voi text that "...HOAT ĐONG..." (con Đ), lam
// mat trang ca 2/3 bang. Phai thay THU CONG truoc khi NFD.
const D_WITH_STROKE = /[Đđ]/g;

export function normalizeLabelText(text: string): string {
  return text
    .replace(D_WITH_STROKE, 'D')
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Cot chua ten chi tieu KHONG LUON O VI TRI DAU (index 0) - vd bang "Ket qua
// hoat dong kinh doanh" thuong co them cot "STT" (danh so 1/2/3...) DUNG
// TRUOC cot ten chi tieu. Ten cot nay cung KHONG LUON la "Chi tieu" - bang
// can doi ke toan thuong dat ten cot dau la "Tai san" (gop ca 2 nua tai
// san/nguon von vao 1 bang, chi tieu de "Tai san" lam tieu de chung) - da gap
// that qua feedback user 2026-07-05 (cot "TAI SAN" bi bo qua, lam sai lech
// toan bo phep cong/so sanh vi khong nhan ra day la cot nhan). Tim theo TEN
// cot (fuzzy, khong phu thuoc vi tri), fallback ve 0 neu khong tim thay ten
// nao khop ca 3 bien the.
export function findLabelColumnIndex(columns: string[]): number {
  const index = columns.findIndex((col) => {
    const normalized = normalizeLabelText(col);
    return normalized.includes('CHI TIEU') || normalized.includes('TAI SAN') || normalized.includes('NGUON VON');
  });
  return index === -1 ? 0 : index;
}
