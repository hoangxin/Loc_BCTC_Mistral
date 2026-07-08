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

// Cac cot chi chua ma/chu thich (STT, Ma so, Thuyet minh) - KHONG phai so
// lieu that su, khong duoc cong/so sanh nhu cac cot "So cuoi ky"/"So dau
// nam"/"Ky nay"/"Ky truoc" (xem valueColumnIndexes duoi).
const METADATA_COLUMN_MARKERS = ['STT', 'MA SO', 'THUYET MINH', 'TM'];

export function isMetadataColumnName(columnName: string | undefined): boolean {
  if (!columnName) return false;
  const normalized = normalizeLabelText(columnName);
  return METADATA_COLUMN_MARKERS.some((marker) => normalized.includes(marker));
}

// Danh sach chi so cot THAT SU la so lieu (loai tru cot nhan va cac cot
// metadata o tren) - dung chung cho moi vong lap cong/so sanh tren 1
// StatementTable (lib/export/validate-statements.ts, lib/analysis.ts).
export function valueColumnIndexes(table: StatementTable): number[] {
  const labelIndex = findLabelColumnIndex(table.columns);
  const indexes: number[] = [];
  for (let i = 0; i < table.columns.length; i++) {
    if (i === labelIndex) continue;
    if (isMetadataColumnName(table.columns[i])) continue;
    indexes.push(i);
  }
  return indexes;
}

// Tim cot "Ma so" trong bang - dung ma so (100, 200, 270...) de xac dinh dong
// thay vi ten chi tieu, vi ten de bi nham voi dong con chau co ten tuong tu
// (vd "Tai san ngan han KHAC" cung chua "TAI SAN NGAN HAN"). Ma so theo Thong
// tu 200 la co dinh, khong phu thuoc cach dat ten cua tung cong ty.
export function findMaSoColumnIndex(table: StatementTable): number | null {
  const index = table.columns.findIndex((col) => normalizeLabelText(col).includes('MA SO'));
  return index === -1 ? null : index;
}

export function parseCode(value: string | number | null): number | null {
  if (value == null) return null;
  const digitsOnly = String(value).replace(/\D/g, '');
  if (!digitsOnly) return null;
  return Number(digitsOnly);
}

export function findRowByCode(
  table: StatementTable,
  maSoIndex: number,
  code: number
): (string | number | null)[] | null {
  for (const row of table.rows) {
    if (parseCode(row[maSoIndex]) === code) return row;
  }
  return null;
}

const ROMAN_NUMERAL_PATTERN = /^[IVXLCDM]+$/i;
// Muc con CAP 3 (chi tiet duoi 1 nhom La Ma, vd "1./ Tien", "7 Vay va no...")
// luon bat dau bang SO A-RAP (co the kem "." hoac "/" roi khoang trang) - dau
// hieu nay dang tin cay hon "ma so chia het cho 10" (xem comment duoi day).
const ARABIC_ITEM_PREFIX = /^\d+[.\/)]?\s/;

// Muc con CAP 4 (chi tiet duoi CA dong cap 3, vd "- Nguyen gia"/"- Gia tri
// hao mon luy ke (*)" duoi TSCD, "a)"/"b)" duoi 1 muc sinh hoc) - KHONG bao
// gio la dong tong nhom, du KHONG bat dau bang so A-rap (da gap that
// 2026-07-08, doi chieu that voi BCTC IDV: cac dong nay bi tinh nham la "dong
// tong" - giong het loi voi ARABIC_ITEM_PREFIX o tren - lam bang Excel in dam
// nham HANG LOAT dong con (lib/export/row-style.ts) VA lam sai lech phep
// cong "tong cac muc con" trong validate-statements.ts, vi 1 dong da duoc
// tinh trong gia tri cua dong cha "1./2./3." lai bi cong THEM 1 lan nua nhu
// the no la 1 nhom rieng).
const NON_SUBTOTAL_DETAIL_PREFIX = /^(-|[a-z]\))\s/;

// Phan biet dong "cap 2" (I, II, III... - dong tong cua 1 nhom) voi dong "cap
// 3" (chi tiet don le duoi 1 nhom) - truoc day CHI dua vao "ma so la boi so
// cua 10", da gap that (2026-07-05, smoke test tren HSG qua Mistral): mot so
// dong CHI TIET (khong phai dong tong) tinh co cung co ma so chia het cho 10
// (vd ma 320 "Vay va no thue tai chinh ngan han", ma 420 "Quy khac thuoc von
// chu so huu" - ca 2 deu la muc le, KHONG phai dong tong nhom, nhung 320%10=0
// va 420%10=0 nen bi heuristic cu tinh nham la "cap 2", cong du vao tong gay
// lech). Dung THEM tin hieu STT (neu bang co cot STT rieng, gia tri La Ma nhu
// "I"/"II" moi la dong tong that su - "7" la so A-rap nghia la muc chi tiet)
// hoac tien to trong TEN CHI TIEU (neu bang KHONG co cot STT rieng, vd TIX -
// La Ma nam ngay trong ten nhu "III. Bat dong san dau tu" cho dong tong, con
// "1./ Phai thu..." cho muc chi tiet) de loai cac dong chi tiet gia mao nay
// ra khoi tong, thay vi chi dua vao ma so chia het cho 10 (van giu lam dieu
// kien BAT BUOC, chi khong con la dieu kien DU nua).
export function isLikelySubtotalRow(table: StatementTable, row: (string | number | null)[], labelIndex: number): boolean {
  const label = String(row[labelIndex] ?? '').trim();
  if (NON_SUBTOTAL_DETAIL_PREFIX.test(label)) return false;

  const sttIndex = table.columns.findIndex((col) => normalizeLabelText(col).includes('STT'));
  if (sttIndex !== -1) {
    const sttValue = String(row[sttIndex] ?? '').trim();
    if (sttValue === '') return true; // mot so dong tong khong co STT rieng - khong du du lieu de bac bo, giu nguyen hanh vi cu (chap nhan)
    return ROMAN_NUMERAL_PATTERN.test(sttValue);
  }
  return !ARABIC_ITEM_PREFIX.test(label);
}

// Tim dong theo TEN CHI TIEU (khong phai ma so) - dung cho lib/analysis.ts,
// noi ma so KHONG on dinh giua Thong tu 200/2014 (cu) va Thong tu 99/2025
// (moi, hieu luc 27/10/2025 - doi ten "Bang can doi ke toan" thanh "Bao cao
// tinh hinh tai chinh" VA chen them nhom "Tai san sinh hoc" lam dich chuyen
// hang loat ma so phia sau, xac nhan qua doi chieu that 2 bao cao SJ1/TT200
// vs IDV/TT99, 2026-07-08) trong khi TEN chi tieu khong doi giua 2 thong tu.
// `preferSubtotal`: khi 1 ten chi tieu vua la dong TONG NHOM vua la ten dong
// CON DUY NHAT cua no (vd "Hang ton kho" - ca dong tong "IV. Hang ton kho" lan
// dong con "1. Hang ton kho" deu chua dung cum nay) - uu tien dong tong (xem
// isLikelySubtotalRow) thay vi dong khop DAU TIEN theo thu tu bang.
export function findRowByLabel(
  table: StatementTable,
  matcher: (normalizedLabel: string) => boolean,
  options?: { preferSubtotal?: boolean }
): (string | number | null)[] | null {
  const labelIndex = findLabelColumnIndex(table.columns);
  const matches = table.rows.filter((row) => {
    const label = row[labelIndex];
    return typeof label === 'string' && matcher(normalizeLabelText(label));
  });
  if (matches.length === 0) return null;
  if (options?.preferSubtotal) {
    const subtotal = matches.find((row) => isLikelySubtotalRow(table, row, labelIndex));
    if (subtotal) return subtotal;
  }
  return matches[0];
}
