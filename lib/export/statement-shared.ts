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
  // Rieng cty chung khoan (CTCK, Mau B01-CTCK): bang "Cac chi tieu ngoai bao
  // cao tinh hinh tai chinh" (tai san/no cua khach hang CTCK quan ly ho, KHONG
  // tinh vao BCDKT chinh) - nam NGAY SAU BCDKT, TRUOC KQKD trong tai lieu goc,
  // luon nam trong pham vi truoc "Thuyet minh" (da xac nhan qua 2 bao cao that
  // SSI/MBS, 2026-07-11) nen khong can mo rong diem cat OCR. Rong ({columns:
  // [], rows: []}) cho 3 loai hinh DN con lai (khong co bang nay).
  offBalanceSheet: StatementTable;
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
const LOOKS_LIKE_LABEL_PATTERN = /[a-zA-ZÀ-ỹ]{3,}/;

// `sampleRows` (tuy chon, CHI dung o parseAllTablesInRange - moi caller khac
// giu nguyen hanh vi cu, fallback ve 0) - can khi CA cot STT lan cot nhan deu
// KHONG dat ten (2 cot trong lien tiep, khong cot nao khop CHI TIEU/TAI SAN/
// NGUON VON) - mac dinh "fallback ve 0" SAI trong truong hop nay vi cot 0
// thuong la STT (chuoi ngan "A."/"I."/"1.", <3 ky tu chu) chu khong phai
// nhan that - da gap that MBS Q2/2026 (2026-07-11): BCDKT/"Cac chi tieu
// ngoai BCTC" co header "|   |  | Ma so | ...|" (2 cot dau deu trong), nhan
// bi ghi NHAM vao vi tri cot STT khi realignRowByContent() dung labelIndex
// sai nay, dao lon thu tu cot Nhan/STT/Ma so trong ket qua xuat. Cham diem
// tung cot theo so o "trong giong nhan that" (>=3 ky tu chu lien tiep) qua
// cac dong mau, chon cot diem cao nhat - on dinh hon vi tri co dinh.
export function findLabelColumnIndex(columns: string[], sampleRows?: (string | number | null)[][]): number {
  const index = columns.findIndex((col) => {
    const normalized = normalizeLabelText(col);
    return normalized.includes('CHI TIEU') || normalized.includes('TAI SAN') || normalized.includes('NGUON VON');
  });
  if (index !== -1) return index;
  if (!sampleRows || sampleRows.length === 0) return 0;

  let bestIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < columns.length; i++) {
    const score = sampleRows.reduce((count, row) => {
      const cell = row[i];
      return count + (typeof cell === 'string' && LOOKS_LIKE_LABEL_PATTERN.test(cell) ? 1 : 0);
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
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
// StatementTable (lib/export/validate-statements.ts, lib/analysis.ts). Loai
// CA cac cot truoc labelIndex (khong chi dung labelIndex) - da gap that MBS
// Q2/2026 (2026-07-11): 1 so bang co CA cot STT rieng (khong dat ten, vd "A."
// "I." "1") DUNG TRUOC cot nhan rieng ("TÀI SẢN") - cot STT nay khong khop
// isMetadataColumnName() (ten rong, khong chua "STT") nen truoc day bi tinh
// NHAM la 1 cot gia tri, day BCDKT/analysis.ts % doc nham gia tri STT ("A.",
// 100...) thay vi so lieu that. Trong MOI mau da doi chieu, cot gia tri LUON
// nam SAU nhan (khong bao gio truoc) nen loai bo toan bo pham vi truoc
// labelIndex la an toan.
export function valueColumnIndexes(table: StatementTable): number[] {
  const labelIndex = findLabelColumnIndex(table.columns, table.rows);
  const indexes: number[] = [];
  for (let i = 0; i < table.columns.length; i++) {
    if (i <= labelIndex) continue;
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
// Nhan ca chu La Ma (I/II/III) LAN chu thuong don (A/B/C/D - nhom lon nhat
// cua BCDKT, "C"/"D" trung ngau nhien voi ky tu La Ma hop le nhung "A"/"B"
// thi khong) va cho phep dau cham theo sau ("A."/"I." - dung dang thuc te
// cua o STT, xem comment o duoi) - rong hon ROMAN_NUMERAL_PATTERN cu nhung
// van an toan (STT chi hinh bang nay khong bao gio dung chu ngau nhien nhu
// "E"/"Z").
const GROUP_STT_PATTERN = /^[A-Z]+\.?$/;

export function isLikelySubtotalRow(table: StatementTable, row: (string | number | null)[], labelIndex: number): boolean {
  const label = String(row[labelIndex] ?? '').trim();
  if (NON_SUBTOTAL_DETAIL_PREFIX.test(label)) return false;

  let sttIndex = table.columns.findIndex((col) => normalizeLabelText(col).includes('STT'));
  // Neu KHONG co cot dat ten "STT" ro rang, thu cot NGAY TRUOC cot nhan (neu
  // co va khong phai 1 cot metadata dat ten khac) - da gap that MBS Q2/2026
  // (2026-07-11): cot STT rieng nhung KHONG dat ten (chi la "" trong header),
  // truoc day khong tim ra duoc, fallback ve ARABIC_ITEM_PREFIX tren NHAN -
  // nhung nhan da duoc tach SACH (khong con tien to so nhu "1." nua, vi so
  // do nam rieng trong cot STT) nen ARABIC_ITEM_PREFIX luon test la false,
  // khien MOI dong (tru dong bat dau "-"/"a)") bi coi nham la dong tong, in
  // dam BUA BAI ca bang.
  if (sttIndex === -1 && labelIndex > 0 && !isMetadataColumnName(table.columns[labelIndex - 1])) {
    sttIndex = labelIndex - 1;
  }
  if (sttIndex !== -1) {
    const sttValue = String(row[sttIndex] ?? '').trim();
    if (sttValue === '') return true; // mot so dong tong khong co STT rieng - khong du du lieu de bac bo, giu nguyen hanh vi cu (chap nhan)
    return GROUP_STT_PATTERN.test(sttValue);
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
  const labelIndex = findLabelColumnIndex(table.columns, table.rows);
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

const GROUP_SUBTOTAL_LABEL_PREFIX = /^CONG\s|^TONG\s/;
const GROUP_SUM_TOLERANCE_RATIO = 0.005;
const GROUP_SUM_TOLERANCE_ABSOLUTE = 1000;

// Kiem tra tinh nhat quan "tong cac chi tieu CAP 1 trong 1 nhom = dong 'Cong
// .../Tong ...' cua chinh nhom do" cho BAO CAO KET QUA KINH DOANH (KQKD) - ap
// dung duoc cho MOI loai hinh DN co dang bang "01, 02, 03... roi Cong..."
// (VAS/bao hiem/CTCK deu dung dang nay it nhat 1 cho, xem Mau B02-DN/
// B02a-DNPNT/B02a-CTCK) - KHONG ap dung cho BCDKT (phan cap nhieu tang A->I->1
// ->1.1, se bi dem 2 lan neu dung chung thuat toan don gian nay - BCDKT da co
// kiem tra rieng, phuc tap hon, trong lib/export/validate-statements.ts).
//
// Phat hien duoc loi OCR gop/bia dong (da gap that MBS Q2/2026, 2026-07-11:
// 2 dong DOC LAP trong PDF goc bi Mistral OCR GHEP LAM MOT [gia tri dinh lien
// nhau trong CUNG 1 o gia tri] VA TU BIA THEM 1 dong "hop le" nhung SAI HOAN
// TOAN cho dong con lai - da xac nhan qua doi chieu that PDF goc). Tra ve
// THONG TIN CHI TIET (khong chi 1 Set key) de dung duoc cho CA 2 muc dich:
// dung cho canh bao co the doc (lib/export/validate-statements.ts) VA khoanh
// vung chinh xac (rowIndex, columnIndex) can null hoa (lib/analysis.ts, xem
// unreliableCellKeysFromMismatches duoi).
export interface IncomeStatementGroupMismatch {
  groupLabel: string;
  columnName: string;
  columnIndex: number;
  subtotalRowIndex: number;
  memberRowIndexes: number[];
  sum: number;
  reported: number;
}

export function findIncomeStatementGroupMismatches(table: StatementTable): IncomeStatementGroupMismatch[] {
  const labelIndex = findLabelColumnIndex(table.columns, table.rows);
  const maSoIndex = findMaSoColumnIndex(table) ?? -1;
  const valueColIndexes = valueColumnIndexes(table);
  const mismatches: IncomeStatementGroupMismatch[] = [];
  let groupStart = 0;

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const label = String(row[labelIndex] ?? '').trim();
    if (!label || !GROUP_SUBTOTAL_LABEL_PREFIX.test(normalizeLabelText(label))) continue;

    const memberRowIndexes: number[] = [];
    for (let j = groupStart; j < i; j++) {
      const maSo = maSoIndex === -1 ? null : table.rows[j][maSoIndex];
      // Muc con long trong 1 chi tieu khac (ma so co dau cham, vd "01.1") - DA
      // duoc gop vao gia tri dong cha ("01"), khong tinh lai o day (tranh dem
      // 2 lan).
      if (typeof maSo === 'string' && maSo.includes('.')) continue;
      if (isLikelySubtotalRow(table, table.rows[j], labelIndex)) continue;
      memberRowIndexes.push(j);
    }

    for (const col of valueColIndexes) {
      let sum = 0;
      let sawDetail = false;
      for (const j of memberRowIndexes) {
        const cell = table.rows[j][col];
        const value = typeof cell === 'number' ? cell : cell === '-' || cell === null ? 0 : null;
        if (value === null) continue; // khong doc duoc - bo qua khoi tong (khong du du lieu de ket luan sai)
        sum += value;
        sawDetail = true;
      }
      if (!sawDetail) continue;

      const subtotalCell = row[col];
      const subtotalValue = typeof subtotalCell === 'number' ? subtotalCell : subtotalCell === '-' || subtotalCell === null ? 0 : null;
      if (subtotalValue === null) continue;

      if (Math.abs(sum - subtotalValue) > Math.max(GROUP_SUM_TOLERANCE_ABSOLUTE, Math.abs(subtotalValue) * GROUP_SUM_TOLERANCE_RATIO)) {
        mismatches.push({
          groupLabel: label,
          columnName: table.columns[col] ?? `cot ${col}`,
          columnIndex: col,
          subtotalRowIndex: i,
          memberRowIndexes,
          sum,
          reported: subtotalValue,
        });
      }
    }

    groupStart = i + 1;
  }

  return mismatches;
}

// Khoanh vung (rowIndex, columnIndex) can null hoa trong lib/analysis.ts -
// gom CA cac dong chi tiet LAN chinh dong "Cong ..." (khong biet chac ben nao
// sai, xem comment o findIncomeStatementGroupMismatches).
export function unreliableCellKeysFromMismatches(mismatches: IncomeStatementGroupMismatch[]): Set<string> {
  const keys = new Set<string>();
  for (const m of mismatches) {
    for (const j of m.memberRowIndexes) keys.add(`${j}:${m.columnIndex}`);
    keys.add(`${m.subtotalRowIndex}:${m.columnIndex}`);
  }
  return keys;
}
