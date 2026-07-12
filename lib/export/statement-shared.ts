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
//
// "MA CHI TIEU" them 2026-07-12 (xac nhan qua EBS Q1/2026): mot so cong ty
// dat ten cot ma so la "Ma chi tieu" thay vi "Ma so" chuan - khong khop
// "MA SO" (khac han "MA CHI TIEU"), khien cot nay KHONG duoc coi la metadata,
// bi tinh nham thanh cot GIA TRI trong valueColumnIndexes - cong ca cac ma so
// (110,120,200...) vao phep tong "cac muc con", sai hoan toan (vd "Tong cac
// muc trong TS dai han (1680) khong khop dong TS dai han (200)" - ca 2 con so
// deu la MA SO, khong phai gia tri tien that).
const METADATA_COLUMN_MARKERS = ['STT', 'MA SO', 'MA CHI TIEU', 'THUYET MINH', 'TM'];

export function isMetadataColumnName(columnName: string | undefined): boolean {
  if (!columnName) return false;
  const normalized = normalizeLabelText(columnName);
  return METADATA_COLUMN_MARKERS.some((marker) => normalized.includes(marker));
}

// "Chi tieu" la TEN CUA CHINH cot nhan (khong phai 1 dong du lieu that) - co
// the bi OCR/tach trang lam LAP LAI thanh 1 dong GIUA than bang (vd khi 1
// bang bi ngat qua nhieu trang, dong tieu de cot o dau TRANG MOI bi doc nham
// thanh 1 dong du lieu) - da xac nhan qua HVA that (2026-07-13): dong
// "Chỉ tiêu" (+ "Số cuối quý"/"Số đầu năm" lap lai o cac cot gia tri, dang
// CHUOI khong phai SO) chen GIUA pham vi "Von chu so huu", bi isLikelySubtotalRow
// (nhanh fallback cuoi, mac dinh true khi khong co gi bac bo) tinh NHAM la
// dong tong DUY NHAT tim thay trong pham vi, lam tong "cac muc con" = 0 (cac
// gia tri chuoi cua no bi sumRows bo qua) thay vi tong dung. Chan NGAY tu dau
// (khong doi tien to/STT) vi day KHONG BAO GIO la 1 chi tieu ke toan that.
const TABLE_HEADER_ECHO_LABEL_CONTENT = ['CHI TIEU'];

function isTableHeaderEchoLabel(label: string): boolean {
  return TABLE_HEADER_ECHO_LABEL_CONTENT.includes(normalizeLabelText(label));
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
  // "MA CHI TIEU" - xem comment METADATA_COLUMN_MARKERS ve ly do them bien
  // the nay (EBS Q1/2026 dung ten nay thay vi "Ma so" chuan).
  const index = table.columns.findIndex((col) => {
    const normalized = normalizeLabelText(col);
    return normalized.includes('MA SO') || normalized.includes('MA CHI TIEU');
  });
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
// luon bat dau bang SO A-RAP (co the kem "." va/hoac "/" roi khoang trang) -
// dau hieu nay dang tin cay hon "ma so chia het cho 10" (xem comment duoi
// day). CHO PHEP NHIEU ky tu dau cau lien tiep (khong chi 1) - da gap that
// (2026-07-12, doi chieu TIX): dang "1./ Chi phi san xuat kinh doanh do dang
// dai han" dung CA HAI dau "." VA "/" lien nhau, pattern cu (chi 1 ky tu dau
// cau) khong khop, khien dong CHI TIET nay bi hieu nham la dong TONG NHOM -
// lam sai ca Excel in dam nham LAN kiem tra cheo tong nhom cap sau
// (findBalanceSheetLevel2Mismatches, lib/export/validate-statements.ts).
//
// SUA THEM 2026-07-12 (xac nhan qua SHS Q1/2026, anh huong HANG LOAT bao cao
// khac trong 1500-bao-cao that: PVI/CIG/CT6/HCM/BVH/PRE/PHS/VCK...): 2 bug
// nua trong CHINH pattern nay, ca 2 deu lam dong CHI TIET (cap 3/4) bi hieu
// nham la dong TONG NHOM (cap 2), gay CONG DU/DUP muc con khi kiem tra tong
// nhom (childrenBetween, lib/export/validate-statements.ts):
// 1) Khong co khoang trang sau dau cham - SHS ghi "1.Tiền và các khoản..."
//    (dinh lien "1." vao chu, khong co dau cach) thay vi "1./ Chi phi..." (co
//    dau cach) nhu TIX - pattern cu BAT BUOC \s ngay sau dau cau nen khong
//    khop, lam "1.Tien va cac khoan..." bi coi la dong tong.
// 2) Ma so THAP PHAN (chi tiet cap 4 duoi 1 chi tiet cap 3, vd "1.1. Tiền",
//    "7.2. Phải thu...") - pattern cu chi nhan 1 SO DUY NHAT roi dau cau, gap
//    "1.1."/"7.2." (SO.SO.) thi dung lai ngay sau so dau tien ("1"), ky tu
//    tiep theo la "." (thuoc [.\/)]*, khop duoc) nhung SAU DO lai la 1 CHU SO
//    NUA ("1" trong "1.1") - khong phai \s, khop THAT BAI toan bo tu dau
//    (regex co ^, khong the thu lai vi tri khac).
// Them nhom "(\.\d+)*" de nhan chuoi so thap phan bat ky do dai ("1.1", "7.2",
// "1.2.3"...) TRUOC khi den dau cau/khoang trang, va doi \s (bat buoc) thanh
// \s* (tuy chon) de dau cham dinh lien chu (khong co dau cach) van khop duoc.
const ARABIC_ITEM_PREFIX = /^\d+(\.\d+)*[.\/)]+\s*/;

// Chuoi NGAY THANG (DD.MM.YYYY hoac DD/MM/YYYY) TRONG NHAM voi ma so thap
// phan qua ARABIC_ITEM_PREFIX o tren - ca 2 deu la "so.so.so" - da xac nhan
// qua doi chieu that HCM Q1/2026 (2026-07-12): 1 dong tieu de ngay thang
// ("31.03.2026 VND") lot vao GIUA bang (loi tach trang o buoc OCR khac, KHONG
// phai loi rieng cua ham nay) bi ARABIC_ITEM_PREFIX nhan NHAM la dong chi
// tiet co ma so "31.03." - khien hasReliableSubtotalSignal tin nham la bang
// nay CO tin hieu danh so (trong khi that ra khong co dong nao khac co), lam
// isLikelySubtotalRow tiep tuc chay heuristic sai cho CA bang. Nam thap phan
// cuoi cung cua 1 ngay LUON la nam (>=4 chu so, vd "2026") - ma so thuong that
// KHONG bao gio dai qua 3 chu so (STT/ma so chi tiet toi da vai chuc/vai
// tram) - dung dau hieu nay de loai truoc khi thu ARABIC_ITEM_PREFIX.
const DATE_LIKE_PREFIX = /^\d{1,2}[.\/]\d{1,2}[.\/]\d{4}\b/;

function looksLikeArabicItemPrefix(label: string): boolean {
  if (DATE_LIKE_PREFIX.test(label)) return false;
  return ARABIC_ITEM_PREFIX.test(label);
}

// Muc con CAP 4 (chi tiet duoi CA dong cap 3, vd "- Nguyen gia"/"- Gia tri
// hao mon luy ke" hoac "* Nguyen gia"/"* Gia tri hao mon luy ke" (tuy cong
// ty) duoi TSCD, "a)"/"b)" duoi 1 muc sinh hoc) - KHONG bao gio la dong tong
// nhom, du KHONG bat dau bang so A-rap (da gap that 2026-07-08, doi chieu
// that voi BCTC IDV: cac dong nay bi tinh nham la "dong tong" - giong het
// loi voi ARABIC_ITEM_PREFIX o tren - lam bang Excel in dam nham HANG LOAT
// dong con (lib/export/row-style.ts) VA lam sai lech phep cong "tong cac muc
// con" trong validate-statements.ts, vi 1 dong da duoc tinh trong gia tri
// cua dong cha "1./2./3." lai bi cong THEM 1 lan nua nhu the no la 1 nhom
// rieng). Them "*" vao bo tien to (2026-07-12, doi chieu TIX: cung 1 vai tro
// cap-4 "Nguyen gia"/"Gia tri hao mon luy ke" nhung dung "*" thay vi "-") -
// da xac nhan qua tinh tay: "- LNST chua phan phoi luy ke den cuoi ky truoc"
// + "- LNST chua phan phoi ky nay" CONG DUNG BANG dong cha "11./ Loi nhuan
// sau thue chua phan phoi" (khong phai 2 khoan MUC RIENG), nen PHAI loai ca
// 2 dang tien to nay khoi tong "cac dong con" (findBalanceSheetLevel2Mismatches/
// findIncomeStatementGroupMismatches), khong chi khoi isLikelySubtotalRow.
// \s* (khong bat buoc) thay vi \s (bat buoc) - da xac nhan qua LLM Q1/2026
// (2026-07-12): "*Cổ phiếu phổ thông có quyền biểu quyết*" dinh lien dau "*"
// vao chu (khong dau cach) thay vi "* Nguyen gia" (co dau cach) - cung 1 lop
// loi da sua cho ARABIC_ITEM_PREFIX (xem comment o do), khien dong nay bi
// tinh nham la dong tong, cong DU vao "tong cac muc con cua Von chu so huu".
const NON_SUBTOTAL_DETAIL_PREFIX = /^(-|\*|[a-z]\))\s*/;

// "Nguyen gia"/"Gia tri hao mon luy ke" LUON la dong cap-4 duoi 1 muc TSCD/
// BDS dau tu, theo dung thuat ngu chuan VAS - nhung TIEN TO/HAU TO cua tung
// cong ty khac nhau qua nhieu de liet ke het (da gap that: TIX dung "*",
// MBS/IDV dung "-", DIC 2026-07-12 dung tien to "." VA hau to "(*)" rieng -
// "Giá trị hao mòn lũy kế (*)"). Thay vi tiep tuc doi pho tung ky tu tien to
// moi (dua tren ky tu, de nham NGOAI le), nhan dien truc tiep qua NOI DUNG
// chuan (khong doi giua cac cong ty, chi khac phan trang tri xung quanh) -
// dang tin cay hon cho DUNG 2 thuat ngu nay.
const KNOWN_CAP4_LABEL_CONTENT = ['NGUYEN GIA', 'GIA TRI HAO MON LUY KE'];

function isKnownCap4Label(label: string): boolean {
  const normalized = normalizeLabelText(label);
  return KNOWN_CAP4_LABEL_CONTENT.some((marker) => normalized.includes(marker));
}

// Ten CHUAN cua cac dong CON (cap 2/3, KHONG BAO GIO la dong tong cap-1) duoc
// liet ke CO DINH trong Thong tu 200/2014 - can nhan dien QUA NOI DUNG, tach
// rieng khoi tin hieu STT/tien to La Ma/A-rap (KHONG dua vao tien to/STT de
// quyet dinh cap do, du OCR co doc dung hay sai tien to):
// - mã 221/224/227: 3 dong con DUY NHAT cua "II. Tai san co dinh" (mã 220) -
//   da xac nhan qua CT6 that (2026-07-13): OCR doc nham tien to "1." (dung,
//   dong con) thanh "I." (La Ma), khien cot STT rieng cung ghi lai "I", tinh
//   NHAM dong "Tai san co dinh huu hinh" la 1 dong tong cap-1 doc lap, cong
//   TRUNG chinh gia tri cua no vao tong "TS dai han".
// - mã 420: dong con DUY NHAT quan trong cua "D. Von chu so huu" (mã 400) -
//   da xac nhan qua KSQ that (2026-07-13): OCR ghi "10 Lợi nhuận sau thuế
//   chưa phân phối" (ROT MAT dau cham sau "10"), khien ARABIC_ITEM_PREFIX
//   khong khop, isLikelySubtotalRow roi vao fallback cuoi (mac dinh true khi
//   khong co gi bac bo) tinh NHAM day la dong tong DUY NHAT trong pham vi,
//   lam tong "cac muc con" = chinh gia tri cua no (thay vi tong dung ca
//   nhom). Nhan dien qua NOI DUNG (khong doi giua cac cong ty/thong tu) tranh
//   phai vá tung truong hop rot dau cau rieng le.
const KNOWN_ALWAYS_CHILD_CONTENT = [
  'TAI SAN CO DINH HUU HINH',
  'TAI SAN CO DINH THUE TAI CHINH',
  'TAI SAN CO DINH VO HINH',
  'LOI NHUAN SAU THUE CHUA PHAN PHOI',
];

// Dung .includes() (khong phai EXACT sau khi bo tien to) vi tien to STT o
// day co the MAT LUON dau phan cach ("10 Lợi nhuận..." khong dau cham, xem
// KSQ that o tren) nen LEADING_GROUP_MARKER_PREFIX (doi hoi it nhat 1 dau
// phan cach) khong bo duoc tien to nay - marker o day du dai/cu the (ten day
// du theo Thong tu) nen an toan khi dung substring, khong can EXACT.
function isKnownAlwaysChildLabel(label: string): boolean {
  const normalized = normalizeLabelText(label);
  return KNOWN_ALWAYS_CHILD_CONTENT.some((marker) => normalized.includes(marker));
}

// Fallback khi 1 nhom cap-1 (vd "D - Von chu so huu") KHONG co lop "cap 2"
// (Roman/noi dung da biet) trung gian nao ca giua no va dong tong tiep theo -
// truong hop nay THUONG GAP voi "Von chu so huu": TT200 chinh thuc co 2 nhom
// con ("I. Von chu so huu"/"II. Nguon kinh phi va quy khac"), nhung da so DN
// KHONG co nhom "Nguon kinh phi" (chi ap dung cho don vi hanh chinh su
// nghiep) nen nhieu bao cao that KHONG in dong "I. Von chu so huu" rieng vi
// no se trung ten Y HET dong cha "D - Von chu so huu" ngay tren - xac nhan
// qua HVA/KSQ that (2026-07-13): cac dong con di THANG vao so A-rap "1. Von
// gop cua chu so huu", "2. Thang du von"... ngay sau dong nhom, khong co dong
// trung gian nao ca. Khi do, chinh cac dong con so A-rap TRUC TIEP (khong
// phai dong cap-4 "-"/"*" duoi no) la thanh phan can cong, khong co lop nao
// khac de tranh dem trung.
export function arabicDirectChildRows(
  table: StatementTable,
  labelIndex: number,
  startIdx: number,
  endIdx: number
): (string | number | null)[][] {
  const result: (string | number | null)[][] = [];
  for (let i = startIdx + 1; i < endIdx; i++) {
    const row = table.rows[i];
    const label = String(row[labelIndex] ?? '').trim();
    // Chap nhan CA dong khop noi dung "luon la con" (isKnownAlwaysChildLabel)
    // du KHONG co tien to so A-rap chuan - da xac nhan qua KSQ that
    // (2026-07-13): "10 Lợi nhuận sau thuế..." mat dau cham sau "10" nen
    // khong khop ARABIC_ITEM_PREFIX, nhung VAN la 1 thanh phan THAT SU can
    // cong (khong phai dong tong/trung lap) - thieu no lam tong hut dung bang
    // gia tri cua no.
    if (!looksLikeArabicItemPrefix(label) && !isKnownAlwaysChildLabel(label)) continue;
    if (NON_SUBTOTAL_DETAIL_PREFIX.test(label) || isKnownCap4Label(label)) continue;
    result.push(row);
  }
  return result;
}

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

// Ten CHUAN (khong doi giua cac cong ty/thong tu, chi khac vai tu dong nghia
// da liet ke) cua cac nhom "cap 1" (I/II/III...) BEN TRONG TS ngan han/TS dai
// han/No phai tra/Von chu so huu - THAY THE cho viec doan qua STT La Ma
// (GROUP_STT_PATTERN, van giu lam tin hieu PHU nhung khong con la DUY NHAT) -
// doc THANG noi dung nhan, dung y kien nguoi dung 2026-07-12 ("đọc tiêu đề
// của từng chỉ tiêu... không dựa vào số thứ tự", ap dung ca cho BCDKT sau khi
// da sua cho KQKD). Gom theo Thong tu 200/2014 (DN thuong), Thong tu 99/2025
// (them "tai san sinh hoc"), va bien the CTCK ("Tai san tai chinh" thay
// "Dau tu tai chinh").
const KNOWN_BALANCE_SHEET_LEVEL1_CONTENT = [
  // Duoi TS ngan han
  'TIEN VA CAC KHOAN TUONG DUONG TIEN',
  'DAU TU TAI CHINH NGAN HAN',
  'TAI SAN TAI CHINH', // CTCK (vd SHS "I. Tài sản tài chính")
  'CAC KHOAN PHAI THU NGAN HAN',
  'HANG TON KHO',
  'TAI SAN TAI BAO HIEM', // Bao hiem, TT232/2012 (vd PRE "Tài sản tái bảo hiểm", xac nhan 2026-07-13)
  'TAI SAN NGAN HAN KHAC',
  // Duoi TS dai han
  'CAC KHOAN PHAI THU DAI HAN',
  'TAI SAN CO DINH',
  'BAT DONG SAN DAU TU',
  'TAI SAN DO DANG DAI HAN',
  'DAU TU TAI CHINH DAI HAN',
  'TAI SAN DAI HAN KHAC',
  'TAI SAN SINH HOC DAI HAN', // Thong tu 99/2025
  // Duoi No phai tra
  'NO NGAN HAN',
  'NO PHAI TRA NGAN HAN',
  'NO DAI HAN',
  'NO PHAI TRA DAI HAN',
  // Duoi Von chu so huu
  'VON CHU SO HUU',
  'NGUON KINH PHI VA QUY KHAC',
];

// Bo tien to STT dau dong (La Ma "II."/chu hoa "A."/so A-rap "1.") TRUOC khi
// so khop - CHI dung EXACT MATCH (khong phai .includes()) sau khi bo tien to,
// KHONG dung substring: da gap loi that (IDV Q1/2026, 2026-07-12) khi dung
// .includes() truc tiep - "TAI SAN CO DINH" (marker cho dong tong "II. Tài
// sản cố định") VO TINH la substring cua CHINH dong CON cua no "1. Tài sản
// cố định HỮU HÌNH" (dong chi tiet, KHONG phai dong tong) - khien dong con
// nay CUNG bi tinh nham la dong tong. EXACT match sau khi bo tien to STT
// tranh duoc loi nay vi "TAI SAN CO DINH HUU HINH" (con nguyen sau khi bo
// tien to "1.") KHONG con bang EXACT voi marker "TAI SAN CO DINH" nua.
// BAT BUOC it nhat 1 dau phan cach ([.\/)]+ - khong con la * tuy chon) ngay
// sau STT - da phat hien qua PHS that (2026-07-13): "Cộng doanh thu hoạt
// động" bat dau bang "C" (VUA la chu hoa VUA la ky tu La Ma hop le trong
// [IVXLCDM]), khi [.\/)]* cho phep KHONG can dau phan cach thi bi cat NHAM
// mat chu "C" dau (tuong la STT "C." roi tu coi la khong co dau cham), lam
// "CONG DOANH THU HOAT DONG..." bi cat con "ONG DOANH THU HOAT DONG...",
// hong toan bo so khop CHINH XAC (rot xuong tang substring, khop NHAM voi
// "Cộng doanh thu hoạt động TÀI CHÍNH" o dong khac). Yeu cau BAT BUOC co dau
// cham/gach cheo/ngoac dong ngay sau se KHONG con cat nham tu thuong (vd
// "Chi phí"/"Cộng...") bat dau bang mot chu cai La Ma hop le nhung KHONG co
// dau phan cach theo sau.
const LEADING_GROUP_MARKER_PREFIX = /^([IVXLCDM]+|[A-Z]|\d+)[.\/)]+\s*/;

// Dong tieu de nhom THUONG co cong thuc ma so o CUOI cau (vd "II. Tai san
// ngan han khac (130 = 131 -> 139)", "Cong ket qua hoat dong khac (80= 71-72)")
// - trong khi dong CON trung ten ngau nhien (vd "7. Tai san ngan han khac",
// khong co cong thuc) thi KHONG co hau to nay. Neu chi bo TIEN TO ma khong bo
// hau to nay, dong tieu de that (co cong thuc) se KHONG khop EXACT voi marker
// nua (con du hau to), trong khi dong CON (khong hau to) lai khop dung - dao
// nguoc thu tu "ai la header" ma isDuplicateKnownBalanceSheetLevel1Row dua
// vao (dong xuat hien TRUOC trong pham vi la header that) - da xac nhan qua
// PHS Q1/2026 (2026-07-12): dong 30 "7. Tai san ngan han khac" (con) khop
// content, dong 23 "II. Tai san ngan han khac (130 = 131 -> 139)" (header that)
// KHONG khop vi con hau to, khien dedup (dua tren thu tu dong khop content)
// khong tim thay "dong truoc do da khop cung content" va coi dong 30 la dong
// tong THAT (sai). Bo ca 2 dau (tien to + hau to cong thuc) truoc khi so sanh.
const TRAILING_FORMULA_SUFFIX = /\s*\(\s*\d+\s*=[^)]*\)\s*$/;

function normalizeGroupLabelForContentMatch(label: string): string {
  return normalizeLabelText(label).replace(LEADING_GROUP_MARKER_PREFIX, '').replace(TRAILING_FORMULA_SUFFIX, '').trim();
}

function isKnownBalanceSheetLevel1Label(label: string): boolean {
  // Dong tong cap-1 THAT trong MOI mau bieu that da doi chieu (PXA/IDV/DIC/
  // PHS/VCK...) LUON danh so La Ma/chu hoa (hoac khong tien to, voi bang
  // "sach") - KHONG BAO GIO danh so A-rap ("1."/"2."/"7."...). Dong A-rap
  // trung TEN voi 1 marker cap-1 LUON la dong CON (lap lai/gan giong ten
  // nhom cha), khong phai chinh no la dong tong - da xac nhan qua PHS Q1/2026
  // (2026-07-12): "1. Tiền và các khoản tương đương tiền" (con cua "I. Tài
  // sản tài chính" trong dinh dang CTCK) VA "7. Tài sản ngắn hạn khác" (con
  // cua "II. Tài sản ngắn hạn khác") deu trung ten EXACT voi marker (ten nay
  // la dong tong CAP 1 THAT trong dinh dang DN-thuong/TT200, nhung la dong
  // CON trong dinh dang CTCK/TT210 - cung 1 ten, khac vai tro theo dinh dang)
  // - chan tu day (khong phu thuoc dinh dang) an toan hon la liet ke rieng
  // theo tung dinh dang.
  if (looksLikeArabicItemPrefix(label)) return false;
  const normalized = normalizeGroupLabelForContentMatch(label);
  return KNOWN_BALANCE_SHEET_LEVEL1_CONTENT.includes(normalized);
}

// Mot so nhom "cap 1" (vd "Hang ton kho", "Bat dong san dau tu") CHI co DUNG 1
// dong con khi cong ty chi co 1 loai muc do - va dong con do thuong LAP LAI Y
// HET ten nhom cha (vd "IV. Hang ton kho" roi "1. Hang ton kho", ca 2 deu con
// "HANG TON KHO" sau khi bo tien to STT) - da xac nhan qua IDV Q1/2026
// (2026-07-12): isKnownBalanceSheetLevel1Label tra ve true cho CA HAI dong nay
// (khong the phan biet chi bang NOI DUNG, vi noi dung giong het nhau), khien
// dong con bi dem THEM 1 lan nua nhu the no la 1 nhom rieng trong tong "cac
// muc cap 1", lam tong > gia tri that. Dong TONG luon dung TRUOC dong con
// trong BCTC that (khong co ngoai le da gap) nen CHI lan xuat hien DAU TIEN
// cua 1 noi dung trong pham vi duoc coi la dong tong that su - moi lan lap lai
// SAU DO cung noi dung, trong CUNG pham vi, la dong con (bi loai khoi ket qua).
export function isDuplicateKnownBalanceSheetLevel1Row(
  table: StatementTable,
  labelIndex: number,
  rangeStartIdx: number,
  rowIdx: number
): boolean {
  const label = String(table.rows[rowIdx][labelIndex] ?? '').trim();
  if (!isKnownBalanceSheetLevel1Label(label)) return false;
  const normalized = normalizeGroupLabelForContentMatch(label);
  for (let i = rangeStartIdx; i < rowIdx; i++) {
    const priorLabel = String(table.rows[i][labelIndex] ?? '').trim();
    const priorNormalized = normalizeGroupLabelForContentMatch(priorLabel);
    if (priorNormalized === normalized) return true;
  }
  return false;
}

// "Tai san tai chinh" (CTCK, TT210/2014) la 1 "CONTAINER" - ban than no LA 1
// muc cap-1 THAT SU, nhung BEN TRONG no lai co cac muc CON (Tien va cac
// khoan tuong duong tien, Cac tai san tai chinh FVTPL...) TRUNG TEN voi
// chinh cac marker cap-1 khac (vi cung 1 thuat ngu "Tien va cac khoan tuong
// duong tien" la muc cap-1 THAT trong DN-thuong, nhung la muc CON trong CTCK).
// Da xu ly cho truong hop dong con co TIEN TO SO A-RAP rieng (xem
// isKnownBalanceSheetLevel1Label, loai qua looksLikeArabicItemPrefix) - NHUNG
// mot so bao cao (HCM that, 2026-07-13) ghi nhan SACH, KHONG co tien to nao
// ca (ma so nam o cot rieng) - khong co "so A-rap" nao de loai, khien "Tien
// va cac khoan tuong duong tien" (con cua "Tai san tai chinh") van bi dem
// THEM 1 lan nua nhu the no la 1 muc cap-1 doc lap, cong du vao tong TS ngan
// han. Giai phap: SAU KHI gap 1 dong khop marker CONTAINER trong pham vi, MOI
// dong tiep theo (du co khop marker KHAC, KHONG giong het container) deu bi
// coi la con cua container do (loai khoi ket qua) CHO DEN KHI het pham vi -
// vi CTCK chi co DUY NHAT 1 container nhu vay truoc "Tai san ngan han khac".
const CONTAINER_LEVEL1_MARKERS = ['TAI SAN TAI CHINH'];

// Container CHI "mo" toi khi gap 1 trong 2 marker nay (luon la muc NGANG
// HANG that su voi container theo dung cau truc TT210, KHONG bao gio la con
// cua no) - da phat hien qua HCM that (2026-07-13): fix ban dau (container
// "nuot" toan bo pham vi con lai) VO TINH nuot LUON "Tai san ngan han khac"
// (mot muc cap-1 THAT SU, dung SAU container, khong phai con cua no), lam
// tong tinh duoc THIEU dung bang gia tri cua no.
const CONTAINER_CLOSING_MARKERS = ['TAI SAN NGAN HAN KHAC', 'TAI SAN DAI HAN KHAC'];

function isKnownContainerLabel(label: string): boolean {
  const normalized = normalizeGroupLabelForContentMatch(label);
  return CONTAINER_LEVEL1_MARKERS.includes(normalized);
}
function isKnownContainerClosingLabel(label: string): boolean {
  const normalized = normalizeGroupLabelForContentMatch(label);
  return CONTAINER_CLOSING_MARKERS.includes(normalized);
}

// Tim SU KIEN GAN NHAT (mo container hay dong container) truoc rowIdx trong
// pham vi - neu su kien gan nhat la "mo" (chua dong lai), rowIdx dang o BEN
// TRONG container do (loai khoi ket qua). CHINH dong dong container (vd "Tai
// san ngan han khac") KHONG tu loai chinh no - no la muc NGANG HANG (dong
// bien) chu khong phai con, du vong lap chi xet cac dong TRUOC no (i < rowIdx)
// - da phat hien qua HCM that (2026-07-13): thieu dieu kien nay lam CHINH
// dong dong container bi loai NHAM (container van dang "mo" tai thoi diem xet
// cac dong TRUOC no), mat han gia tri cua no khoi tong.
export function isInsideKnownContainer(table: StatementTable, labelIndex: number, rangeStartIdx: number, rowIdx: number): boolean {
  const ownLabel = String(table.rows[rowIdx][labelIndex] ?? '').trim();
  if (isKnownContainerClosingLabel(ownLabel)) return false;
  let open = false;
  for (let i = rangeStartIdx; i < rowIdx; i++) {
    const priorLabel = String(table.rows[i][labelIndex] ?? '').trim();
    if (isKnownContainerLabel(priorLabel)) open = true;
    else if (isKnownContainerClosingLabel(priorLabel)) open = false;
  }
  return open;
}

// Bang co TIN HIEU DANG TIN CAY de phan biet dong tong cap-1 (STT La Ma/chu
// hoa, hoac so A-rap nhung vao dau nhan) voi dong chi tiet hay khong - dung
// truoc khi lam BAT KY kiem tra "tong cac muc con" nao (isLikelySubtotalRow va
// cac ham dung no). QUYET DINH THIET KE 2026-07-12 (theo yeu cau nguoi dung
// sau khi 1 heuristic vá lỗi lien tuc gay hoi quy qua lai giua cac dinh dang
// bang khac nhau - TCB va HCM can 2 quy uoc NGUOC NHAU cho cung 1 tin hieu
// "khong co STT/so"): thay vi co doan mot heuristic ngay cang phuc tap de
// "doan dung" trong moi truong hop, GIAM DO SAU - khi bang KHONG co tin hieu
// nao (khong co cot STT dung duoc, khong co nhan nao nhung so A-rap), CAC HAM
// GOI (childrenBetween, findBalanceSheetLevel2Mismatches,
// findIncomeStatementGroupMismatches) se BO QUA HOAN TOAN buoc kiem tra "tong
// cac muc con" cho bang do, thay vi co doan (co the sai) roi bao canh bao
// gia. Bao "khong du tin hieu de kiem tra sau hon" (rieng, it ồn hon nhieu so
// voi hang chuc canh bao sai) thay vi im lang HOAN TOAN, giu dung nguyen tac
// fail-closed cua project (luon bao ro khi khong the xac minh).
// Danh gioi THAT SU cua phan than BCDKT (truoc dong "Tổng tài sản") - mot so
// bao cao OCR gan LIEN mot bang phu lục/thuyet minh NGAY SAU dong tong nay
// (vd CT6 that, 2026-07-13: mot bang con "Xây dựng cơ bản dở dang" o cuoi
// bang, dung LAI dung cot "TT" voi gia tri La Ma "I"/"II" cho cau truc RIENG
// cua no, khong lien quan gi toi cau truc BCDKT chinh). Neu khong gioi han
// pham vi quet, columnHasGroupSttValue se tin NHAM cot do la 1 "cot STT that"
// cho CA bang (kho co gia tri La Ma o dau do trong TOAN BANG), roi tin sai
// gia tri RONG cua no trong phan than chinh la "khong du du lieu de bac bo,
// mac dinh dong tong" - xem cho tiet loi that trong isLikelySubtotalRow.
const BALANCE_SHEET_BODY_END_MARKERS = ['TONG TAI SAN', 'TONG CONG TAI SAN'];

function findBalanceSheetBodyEndIndex(table: StatementTable, labelIndex: number): number {
  for (let i = 0; i < table.rows.length; i++) {
    const label = String(table.rows[i][labelIndex] ?? '').trim();
    if (BALANCE_SHEET_BODY_END_MARKERS.includes(normalizeGroupLabelForContentMatch(label))) return i;
  }
  return table.rows.length;
}

function columnHasGroupSttValue(table: StatementTable, colIndex: number, labelIndex?: number): boolean {
  const endIndex = labelIndex === undefined ? table.rows.length : findBalanceSheetBodyEndIndex(table, labelIndex);
  for (let i = 0; i < endIndex; i++) {
    if (GROUP_STT_PATTERN.test(String(table.rows[i][colIndex] ?? '').trim())) return true;
  }
  return false;
}

// Tin hieu CAU TRUC (cot STT co gia tri La Ma/chu hoa that, hoac tien to so
// A-rap gan lien trong nhan) - TACH RIENG khoi tin hieu NOI DUNG (xem
// isKnownBalanceSheetLevel1Label) vi 2 loai tin hieu nay duoc TIN CAY o 2 MUC
// KHAC NHAU trong isLikelySubtotalRow (xem comment o do ve ly do khong the
// dung chung 1 fallback cho ca 2).
function hasStructuralSubtotalSignal(table: StatementTable, labelIndex: number): boolean {
  // QUAN TRONG: chi vi CO cot dat ten "STT" khong co nghia gia tri BEN TRONG
  // no dung duoc - da xac nhan qua PXA Q1/2026 (2026-07-12): cot "STT" that,
  // nhung chi danh so THUONG (1,2,3...19), khong bao gio la chu La Ma/chu hoa
  // (GROUP_STT_PATTERN). Truoc day chi kiem tra CO cot ten "STT" la tra ve
  // true ngay, khien isLikelySubtotalRow test "1".match(GROUP_STT_PATTERN)
  // LUON false cho MOI dong (khong dong nao khop mau La Ma) - khong dong nao
  // bi loai khoi "thanh vien", cac dong tong long nhau (vd "Loi nhuan gop"
  // rồi "Loi nhuan thuan tu HDKD") bi cong CA vao tong ben ngoai ("Tong loi
  // nhuan ke toan truoc thue"), sai gap nhieu lan. Phai kiem tra THEM: gia tri
  // TRONG cot STT (hoac cot fallback truoc nhan) co THAT SU chua it nhat 1
  // gia tri khop GROUP_STT_PATTERN o dau do trong bang hay khong, khong chi
  // dua vao TEN cot.
  const sttNamedIndex = table.columns.findIndex((col) => normalizeLabelText(col).includes('STT'));
  if (sttNamedIndex !== -1 && columnHasGroupSttValue(table, sttNamedIndex, labelIndex)) return true;
  if (labelIndex > 0 && !isMetadataColumnName(table.columns[labelIndex - 1]) && columnHasGroupSttValue(table, labelIndex - 1, labelIndex)) {
    return true;
  }
  return table.rows.some((r) => looksLikeArabicItemPrefix(String(r[labelIndex] ?? '').trim()));
}

export function hasReliableSubtotalSignal(table: StatementTable, labelIndex: number): boolean {
  if (hasStructuralSubtotalSignal(table, labelIndex)) return true;
  // Tin hieu NOI DUNG (ten CHUAN nhu "Tien va cac khoan tuong duong tien"/
  // "Hang ton kho"...) - doc THANG nhan thay vi doan qua cau truc/STT xung
  // quanh (yeu cau nguoi dung 2026-07-12), dang tin cay HON ca cac tin hieu
  // cau truc o tren nhung van kiem tra SAU CUNG o day vi chi can 1 trong tat
  // ca cac tin hieu la du (ham nay chi tra loi CO/KHONG co tin hieu nao, xem
  // isLikelySubtotalRow de biet thu tu uu tien THAT SU giua cac tin hieu).
  return table.rows.some((r) => isKnownBalanceSheetLevel1Label(String(r[labelIndex] ?? '').trim()));
}

export function isLikelySubtotalRow(table: StatementTable, row: (string | number | null)[], labelIndex: number): boolean {
  const label = String(row[labelIndex] ?? '').trim();
  // Doc NOI DUNG nhan TRUOC TIEN (dang tin cay hon cau truc/STT xung quanh -
  // yeu cau nguoi dung 2026-07-12: "đọc tiêu đề của từng chỉ tiêu... không
  // dựa vào số thứ tự", ap dung cho ca BCDKT sau khi da sua tuong tu cho
  // KQKD). Ten nhom "cap 1" (Tien, Hang ton kho, No ngan han...) la thuat
  // ngu CHUAN khong doi giua cac cong ty, dang tin cay hon nhieu so voi
  // doan qua STT La Ma/so thu tu (da gay hoi quy qua lai TCB/HCM/PXA).
  if (isKnownBalanceSheetLevel1Label(label)) return true;
  // Nhan rong KHONG bao gio la dong tong nhom that (dong tong/cap 1 luon co
  // ten trong BCTC that) - da xac nhan qua doi chieu that (2026-07-12, hang
  // loat bao cao DIC/DCS/PXA/HVA/PAP/KSQ): truoc day nhan rong (thuong do
  // bang bi lech cot o noi khac, xem comment findBalanceSheetLevel2Mismatches)
  // roi vao nhanh cuoi `!ARABIC_ITEM_PREFIX.test('')` = true (chuoi rong
  // khong khop prefix so A-rap nao ca) nen bi tinh NHAM la dong tong, tao ra
  // cac canh bao vo nghia dang "dong X khong khop dong X" (X la STT/index,
  // khong phai gia tri that). Chan som o day tranh ca lop loi nay, khong chi
  // sua thong bao hien thi.
  if (label === '') return false;
  if (isTableHeaderEchoLabel(label)) return false;
  if (NON_SUBTOTAL_DETAIL_PREFIX.test(label) || isKnownCap4Label(label) || isKnownAlwaysChildLabel(label)) return false;

  // Cac fallback CAU TRUC ben duoi (cot STT, tien to so A-rap) CHI dang tin
  // cay khi BANG THAT SU co tin hieu cau truc (xem hasStructuralSubtotalSignal)
  // - neu KHONG (vd bang "sach", nhan khong nhung so/khong co cot STT dung
  // duoc, CHI duoc nhan dien qua tin hieu NOI DUNG o tren), KHONG duoc quay ve
  // cac fallback nay: da xac nhan qua doi chieu that (2026-07-12, hang loat
  // bao cao IDV/DIC/PXA/RYG/PAP/HVA/MBS/LLM/PHS/VCK) - fallback "sttValue==''
  // => true" (dong 438 ben duoi) tra ve true BUA BAI cho MOI dong con KHAC
  // (vi ca bang khong he co cot STT dung duoc), khien tong "cac muc cap 1" >
  // gia tri that o rat nhieu bao cao ngay khi 1 marker NOI DUNG (vd "Tai san
  // co dinh") lam hasReliableSubtotalSignal chuyen tu false sang true. Dong
  // KHONG khop noi dung, trong 1 bang khong co tin hieu cau truc, PHAI la
  // dong con (false), khong phai "khong biet nen mac dinh true".
  if (!hasStructuralSubtotalSignal(table, labelIndex)) return false;

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
  // Chi TIN cot STT ung vien (dat ten ro rang HOAC cot ngay truoc nhan) neu no
  // THAT SU chua it nhat 1 gia tri La Ma/chu hoa that o dau do trong bang (cung
  // dieu kien da dung trong hasStructuralSubtotalSignal/columnHasGroupSttValue
  // o tren) - da xac nhan qua CT6 that (2026-07-13): cot "TT" ton tai nhung
  // LUON LUON rong (so thu tu nam ngay trong TEN chi tieu, vd "1. Chi phi cho
  // phan bo dai han", khong o cot rieng) - truoc day sttValue==='' cho MOI
  // dong (ca dong tong LAN dong con, vi ca cot deu rong nhu nhau) bi tra ve
  // true BUA BAI, khien 1 dong con (vd "1. Chi phi cho phan bo dai han", con
  // DUY NHAT cua "VII. Tai san dai han khac") bi dem THEM 1 lan nua nhu the no
  // la 1 muc cap-1 doc lap - dung 1 LOI Y HET dang da sua cho ma so/tien
  // to/STT khac trong session nay (tin vao 1 TIN HIEU VI TRI/CAU TRUC ma
  // KHONG kiem tra tin hieu do co THAT SU dang tin cay o bang nay hay khong).
  // Neu cot rong toan bo (khong dang tin cay), bo qua nhanh nay, roi ve doc
  // THANG tien to trong TEN chi tieu (nhanh cuoi ham, `!looksLikeArabicItemPrefix`).
  if (sttIndex !== -1 && columnHasGroupSttValue(table, sttIndex, labelIndex)) {
    const sttValue = String(row[sttIndex] ?? '').trim();
    if (sttValue === '') return true; // mot so dong tong khong co STT rieng - khong du du lieu de bac bo, giu nguyen hanh vi cu (chap nhan)
    return GROUP_STT_PATTERN.test(sttValue);
  }
  // GHI CHU 2026-07-12: da thu them 1 nhanh o day ("neu KHONG co dong nao
  // trong ca bang khop ARABIC_ITEM_PREFIX thi tra ve false") de sua truong
  // hop HCM/CT6/BVH/PRE/PHS/VCK (cot "Ma so" rieng, nhan sach khong nhung so)
  // - nhung REVERT NGAY sau khi do that: tuy giam canh bao cho nhom bao cao
  // do, lai lam TANG canh bao o nhom khac (TCB tu 0 len 8, HCM/BVH cung tang)
  // vi nhieu bang THAT SU dung nhan sach (khong nhung so) NHUNG van dung
  // dung isLikelySubtotalRow=true lam mac dinh (vd KQKD Ngan hang). Net effect
  // am (272 > 254 tong canh bao tren 28 bao cao that) - chua tim ra tieu chi
  // phan biet 2 truong hop nay an toan, de nguyen hanh vi cu (mac dinh true)
  // o day, CAN quay lai dieu tra rieng cho tung mau bieu neu gap lai.
  return !looksLikeArabicItemPrefix(label);
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

// Ten CHUAN (khong doi giua cac cong ty, quy dinh boi Thong tu ke toan) cua
// cac dong TRUNG GIAN trong KQKD da TU LA tong cua nhung dong truoc no (vd
// "Loi nhuan gop" = Doanh thu thuan - Gia von, TU BAN THAN no da la 1 phep
// cong/tru, khong phai 1 chi tieu doc lap) - dung de LOAI cac dong nay khoi
// danh sach "thanh vien" khi cong don cho dong TONG o SAU no (vd "Tong loi
// nhuan ke toan truoc thue"), TRANH dem 2 lan. THAY THE cho viec doan qua so
// thu tu/STT (da gap loi PXA Q1/2026, 2026-07-12: STT chi la so thuong 1,2,3,
// khong phai chu La Ma, khien khong dong nao bi loai) - doc THANG NOI DUNG
// nhan thay vi doan qua dinh dang xung quanh, dung y kien nguoi dung
// ("đọc tiêu đề của từng chỉ tiêu... không dựa vào số thứ tự"). Ten CHUAN
// theo Thong tu 200/2014 (DN thuong) va Thong tu 49/2014-NHNN (Ngan hang).
const KNOWN_INCOME_STATEMENT_SUBTOTAL_CONTENT = [
  'LOI NHUAN GOP', // DN thuong: = Doanh thu thuan - Gia von
  'LOI NHUAN THUAN TU HOAT DONG KINH DOANH', // DN thuong: = LN gop + DT tai chinh - CP tai chinh - CP ban hang - CP QLDN
  'LOI NHUAN KHAC', // DN thuong: = Thu nhap khac - Chi phi khac
  'THU NHAP LAI THUAN', // Ngan hang: = Thu nhap lai - Chi phi lai
  'LAI THUAN TU HOAT DONG', // Ngan hang: "Lai thuan tu hoat dong dich vu/ngoai hoi/CK kinh doanh/CK dau tu/khac" - deu la hieu cua 1 cap thu-chi truoc do
  'LOI NHUAN THUAN TU HOAT DONG KINH DOANH TRUOC CHI PHI DU PHONG', // Ngan hang
];

function isKnownIncomeStatementSubtotalLabel(label: string): boolean {
  const normalized = normalizeLabelText(label);
  return KNOWN_INCOME_STATEMENT_SUBTOTAL_CONTENT.some((marker) => normalized.includes(marker));
}
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
// unreliableCellKeysFromMismatches duoi). Ten TONG QUAT (khong con rieng
// "IncomeStatement" - 2026-07-12, mo rong them findDecimalCodeGroupMismatches/
// findBalanceSheetLevel2Mismatches ben duoi dung CHUNG kieu du lieu nay).
export interface GroupSumMismatch {
  groupLabel: string;
  columnName: string;
  columnIndex: number;
  subtotalRowIndex: number;
  memberRowIndexes: number[];
  sum: number;
  reported: number;
}

// Cac o (rowIndex:columnIndex) can coi la "khong dang tin cay" - dung chung
// cho ca balanceSheet va incomeStatement (goi ham nay RIENG cho tung bang,
// KHONG tron lan - xem UnreliableCells/lib/analysis.ts).
export interface UnreliableCells {
  balanceSheet: Set<string>;
  incomeStatement: Set<string>;
}

export function findIncomeStatementGroupMismatches(table: StatementTable): GroupSumMismatch[] {
  const labelIndex = findLabelColumnIndex(table.columns, table.rows);
  // KHONG dung tin hieu NOI DUNG (isKnownIncomeStatementSubtotalLabel) de MO
  // KHOA kiem tra nay khi bang thieu tin hieu cau truc - da THU qua (2026-07-12)
  // va REVERT: khac voi BCDKT (cac nhom long nhau ro rang, khong "cong don"
  // xuyen nhom), KQKD ngan hang dung cau truc "cong don" (1 dong trung gian =
  // dong tong nhom TRUOC + 1 dong moi, vd TCB "Loi nhuan thuan tu HDKD truoc
  // CP du phong" = "Tong thu nhap hoat dong" [nhom TRUOC, DA dong] + "Chi phi
  // hoat dong") - thuat toan "loai dong khop marker noi dung khoi thanh vien"
  // GIA DINH moi nhom doc lap, tu cong du tu cac dong RAW trong CHINH pham vi
  // no, sai hoan toan voi cau truc cong don nay (dem thieu ca 1 nhom truoc).
  // PXA cung lo ra thieu marker "DOANH THU THUAN" (dong tong trung gian khac
  // ten CHUAN chua liet ke) gay dem trung. Ca 2 loi deu la vi dung noi dung
  // de MO KHOA kiem tra cho bang KHONG co tin hieu cau truc dang tin cay -
  // thay vi tiep tuc va liet ke them tung truong hop (chap va), GIU NGUYEN
  // yeu cau tin hieu CAU TRUC that su (hasReliableSubtotalSignal) truoc khi
  // chay kiem tra nay, dung nguyen tac "giam do sau" da chot voi nguoi dung.
  if (!hasReliableSubtotalSignal(table, labelIndex)) return [];
  const maSoIndex = findMaSoColumnIndex(table) ?? -1;
  const valueColIndexes = valueColumnIndexes(table);
  const mismatches: GroupSumMismatch[] = [];
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
      const memberLabel = String(table.rows[j][labelIndex] ?? '').trim();
      // Doc NOI DUNG nhan TRUOC (dang tin cay hon, xem comment o tren) - chi
      // fallback ve tin hieu cau truc (isLikelySubtotalRow) neu ten khong
      // khop bat ky mau CHUAN nao da biet.
      if (isKnownIncomeStatementSubtotalLabel(memberLabel) || isLikelySubtotalRow(table, table.rows[j], labelIndex)) continue;
      // Muc con CAP 4 (tien to "-"/"*"/"a)"... hoac noi dung chuan "Nguyen
      // gia"/"Gia tri hao mon luy ke") - da GOP SAN vao gia tri dong cha cap 3
      // ngay truoc no, cong THEM o day se dem 2 lan (xem NON_SUBTOTAL_DETAIL_PREFIX/
      // isKnownCap4Label - isLikelySubtotalRow da tra ve false cho dong nay
      // nen KHONG bi loai boi dieu kien tren, phai kiem tra rieng).
      if (NON_SUBTOTAL_DETAIL_PREFIX.test(memberLabel) || isKnownCap4Label(memberLabel)) continue;
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

// ============================================================================
// Kiem tra CONG THUC CHINH THUC theo tung Thong tu (2026-07-13, thay the
// findIncomeStatementGroupMismatches o tren cho CANH BAO HIEN THI - ham cu
// van giu nguyen, chi dung cho co che retry/unreliable-cell o duoi, xem
// findAllGroupSumMismatches). QUYET DINH THIET KE, theo yeu cau nguoi dung
// sau khi phat hien findIncomeStatementGroupMismatches doan sai cho cau truc
// "cong don" (bank) va thieu marker (DN thuong): thay vi tiep tuc doan qua VI
// TRI/GROUP_SUBTOTAL_LABEL_PREFIX, DOC CONG THUC THAT (tu Thong tu ke toan,
// xac nhan tay bang so lieu that - KHONG tin chu OCR in san trong nhan, vi no
// cung co the bi doc sai) cho tung loai hinh:
//  - DN thuong (TT200/2014, TT99/2025): dung MA SO cho cac dong ON DINH
//    (01/02/10/11/20/31/32/40/50/51/52/60), dung TEN CHI TIEU rieng cho dong
//    "30" (Loi nhuan thuan tu HDKD) vi TT99 co the chen THEM "Lai/lo BDS dau
//    tu" VA/HOAC "Phan lai/lo cong ty lien doanh, lien ket" TUY CONG TY co
//    phat sinh giao dich do hay khong, lam ma so CAC DONG SAU dich khac nhau
//    tuy bao cao (da xac nhan qua DCS/IDV/PAP/EBS Q1/2026 - 3 bien the khac
//    nhau, khong the liet ke het bang ma so co dinh).
//  - CTCK (TT210/2014 + 334/2016): dung MA SO, "20"/"40"/"50"/"60" la DAI MA
//    LIEN TUC (vd "40 = 21→32") CHINH THUC in san va xac nhan qua PHS/VCK
//    that, KHONG phai danh sach ma le.
//  - Bao hiem (TT232/2012): 2 BIEN THE ma so KHAC NHAU giua BVH (tap doan,
//    ket hop nhan tho+phi nhan tho) va PRE (thuan phi nhan tho) - nhan dien
//    qua NOI DUNG (khong phai chi su ton tai) cua dong ma 29/15.
//  - Ngan hang (TT49/2014-NHNN): KHONG co cot Ma so dang tin cay trong du
//    lieu that (TCB/TPB), dung TEN CHI TIEU cho toan bo. LUU Y DAU: cac dong
//    "chi phi" da luu SAN la so am (cong truc tiep, KHONG tru them 1 lan nua).
//
// Nhan dien loai hinh QUA NOI DUNG bang, KHONG chi dua vao nhan businessType
// co san (da phat hien qua BVH that: gan nhan "other" du la cong ty bao hiem
// THAT - co le vi thieu ma mau DNBH/DNPNT trong doan OCR duoc dung de phan
// loai, xem lib/business-type.ts) - tranh ap nham cong thuc DN-thuong len 1
// bang co ma so TRUNG NGAU NHIEN nhung Y NGHIA hoan toan khac.
// ============================================================================

function withinFormulaTolerance(sum: number, reported: number): boolean {
  return Math.abs(sum - reported) <= Math.max(GROUP_SUM_TOLERANCE_ABSOLUTE, Math.abs(reported) * GROUP_SUM_TOLERANCE_RATIO);
}

function formulaCellValue(cell: string | number | null): number | null {
  return typeof cell === 'number' ? cell : cell === '-' || cell === null ? 0 : null;
}

// GHI CHU (2026-07-13): 3 ham tra theo MA SO (findRowByExactCode/findWholeCodeRow/
// findWholeCodeRowsInRange, cong voi kieu 'code'/'range' cua he thong cong
// thuc) da bi XOA khoi day - theo yeu cau nguoi dung, TOAN BO he thong cong
// thuc KQKD (DN thuong/CTCK/Bao hiem/Ngan hang) gio khop THEO TEN CHI TIEU,
// khong con dua vao ma so o dau. Neu sau nay can quay lai tra theo ma so cho
// 1 truong hop cu the (vd 1 mau bieu moi ma so THAT SU on dinh hon ten), xem
// lich su git truoc commit sua doi nay de lay lai code cu (tim "findWholeCodeRow"
// trong git log/blame cua file nay).
// So khop GAN DUNG (khong yeu cau khop tuyet doi 100%) - thay the cho viec
// liet ke tung bien the chinh ta bang tay (vd "quan ly" vs "quan li" - chi
// khac 1 ky tu, EBS that 2026-07-13): TINH DO TUONG DONG ky tu (Levenshtein)
// giua marker va cua so truot tren nhan, chap nhan neu >= nguong (92%). Dung
// LAM TANG CUOI CUNG (sau exact roi substring, ca 2 van uu tien vi re hon/
// chinh xac hon) - chi can khi ca 2 tang tren deu that bai.
function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function fuzzyIncludes(haystack: string, needle: string, threshold = 0.92): boolean {
  if (needle.length === 0 || haystack.length < needle.length - 2) return false;
  let minDist = Infinity;
  for (let start = 0; start <= haystack.length - 1; start++) {
    for (const len of [needle.length - 1, needle.length, needle.length + 1, needle.length + 2]) {
      if (len <= 0 || start + len > haystack.length) continue;
      const dist = levenshteinDistance(haystack.slice(start, start + len), needle);
      if (dist < minDist) minDist = dist;
    }
  }
  return 1 - minDist / needle.length >= threshold;
}

// Uu tien lan khop CUOI CUNG trong moi tang (exact roi substring roi fuzzy) -
// cung 1 ly do voi findWholeCodeRow (dong RAC dinh o DAU bang, PAP that).
// NHUNG: CT6 that lai gap chieu NGUOC LAI - bang co hang chuc dong "thuyet
// minh chi phi theo yeu to" bi dinh vao DUOI bang that, TOAN BO KHONG CO ma
// so. Ket hop CA HAI: neu bang co cot Ma so, UU TIEN cac dong CO ma so nguyen
// hop le (thuoc than bang that) truoc, CHI trong nhom do moi ap dung "khop
// cuoi cung"; cac dong KHONG co ma so (rat co the la phu luc/thuyet minh) chi
// dung khi khong con lua chon nao khac.
function lastMatchingRowIndex(rows: (string | number | null)[][], labelIndex: number, test: (norm: string, raw: string) => boolean, preferredIndexes?: Set<number>): number {
  let found = -1;
  let foundPreferred = -1;
  rows.forEach((r, i) => {
    const raw = String(r[labelIndex] ?? '').trim();
    if (!test(normalizeLabelText(raw), raw)) return;
    found = i;
    if (preferredIndexes?.has(i)) foundPreferred = i;
  });
  return foundPreferred !== -1 ? foundPreferred : found;
}

function findRowIndexByContentMarkers(table: StatementTable, labelIndex: number, markers: string[]): number {
  const maSoIndex = findMaSoColumnIndex(table);
  let hasValidCode: Set<number> | undefined;
  if (maSoIndex !== null) {
    hasValidCode = new Set<number>();
    table.rows.forEach((r, i) => {
      const raw = String(r[maSoIndex] ?? '').trim();
      if (raw && parseCode(raw) !== null) hasValidCode!.add(i);
    });
  }
  // Tang "chinh xac" so ca ban THO lan ban da BO tien to STT/hau to cong
  // thuc (vd "Doanh thu phi bao hiem (01=02+03+04)" -> "Doanh thu phi bao
  // hiem") - can de phan biet 2 dong CO TEN GAN GIONG NHAU nhung KHAC NGHIA
  // (vd bao hiem: "01 Doanh thu phi bao hiem" vs "08 Doanh thu phi bao hiem
  // THUAN" - khop substring don thuan se lan NHAM ca 2 dong voi marker ngan
  // hon, da xac nhan qua BVH that 2026-07-13).
  const exactIdx = lastMatchingRowIndex(
    table.rows,
    labelIndex,
    (norm, raw) => markers.some((m) => norm === m || normalizeGroupLabelForContentMatch(raw) === m),
    hasValidCode
  );
  if (exactIdx !== -1) return exactIdx;
  const substringIdx = lastMatchingRowIndex(table.rows, labelIndex, (norm) => markers.some((m) => norm.includes(m)), hasValidCode);
  if (substringIdx !== -1) return substringIdx;
  return lastMatchingRowIndex(table.rows, labelIndex, (norm) => markers.some((m) => fuzzyIncludes(norm, m)), hasValidCode);
}

// He thong cong thuc HOP NHAT - TAT CA loai hinh (DN thuong/CTCK/Bao hiem/
// Ngan hang) deu khop THEO TEN CHI TIEU, KHONG con dua vao ma so/vi tri o BAT
// KY dau (2026-07-13, theo yeu cau nguoi dung: "làm thế cho tất cả các chỉ
// tiêu ở cả bcđkt và bckqhđkd với cả 4 loại hình doanh nghiệp đi"). Ma so chi
// con dung LAM TIN HIEU PHU trong findRowIndexByContentMarkers (uu tien dong
// co ma so hop le hon dong khong co, xem comment o do) de phan biet than bang
// that voi phu luc/rac - KHONG dung de XAC DINH dong nao la dong nao.
//
// `optional: true` = dong TUY CHON (cong ty co the KHONG phat sinh giao dich
// nay, vd "Lai/lo BDS dau tu" chi xuat hien khi cong ty thuc su co giao dich
// do - xac nhan qua DCS/IDV/PAP/EBS Q1/2026: moi bao cao chen/bo cac dong tuy
// chon nay KHAC NHAU, khong the doan truoc) - khong tim thay = COI LA 0.
// Mac dinh (khong danh dau) = BAT BUOC - khong tim thay = BO QUA AN TOAN ca
// cong thuc (khong du du lieu de ket luan, giu dung nguyen tac "khong doan
// khi thieu tin hieu" da chot tu truoc).
interface FormulaTerm { markers: string[]; sign: 1 | -1; optional?: boolean; }
interface FormulaDef { groupLabel: string; target: string[]; terms: FormulaTerm[]; }

function req(markers: string[], sign: 1 | -1 = 1): FormulaTerm {
  return { markers, sign };
}
function opt(markers: string[], sign: 1 | -1 = 1): FormulaTerm {
  return { markers, sign, optional: true };
}

function evaluateNamedFormulas(table: StatementTable, formulas: FormulaDef[]): GroupSumMismatch[] {
  const labelIndex = findLabelColumnIndex(table.columns, table.rows);
  const valueCols = valueColumnIndexes(table);
  const mismatches: GroupSumMismatch[] = [];
  for (const f of formulas) {
    const targetIdx = findRowIndexByContentMarkers(table, labelIndex, f.target);
    if (targetIdx === -1) continue;
    const termLookup = f.terms.map((t) => ({ t, idx: findRowIndexByContentMarkers(table, labelIndex, t.markers) }));
    // Thieu 1 dong BAT BUOC (khong phai tuy chon) - bo qua an toan, khong du
    // du lieu de ket luan. Dong tuy chon khong tim thay = 0, van tiep tuc.
    if (termLookup.some(({ t, idx }) => !t.optional && (idx === -1 || idx === targetIdx))) continue;
    const usableTerms = termLookup.filter(({ idx }) => idx !== -1 && idx !== targetIdx);

    for (const col of valueCols) {
      let sum = 0;
      let ok = true;
      const memberRowIndexes: number[] = [];
      for (const { t, idx } of usableTerms) {
        const v = formulaCellValue(table.rows[idx][col]);
        if (v === null) { ok = false; break; }
        sum += v * t.sign;
        memberRowIndexes.push(idx);
      }
      if (!ok) continue;
      const reported = formulaCellValue(table.rows[targetIdx][col]);
      if (reported === null) continue;
      if (!withinFormulaTolerance(sum, reported)) {
        mismatches.push({
          groupLabel: f.groupLabel,
          columnName: table.columns[col] ?? `cot ${col}`,
          columnIndex: col,
          subtotalRowIndex: targetIdx,
          memberRowIndexes,
          sum,
          reported,
        });
      }
    }
  }
  return mismatches;
}

// DN thuong (Thong tu 200/2014 + 99/2025) - xac nhan qua PXA/DCS/IDV/PAP/EBS/
// CT6/HVA/LLM Q1/2026 (2026-07-13). TT99 co the chen THEM "Lai/lo hoat dong
// ban, thanh ly BDS dau tu" VA/HOAC "Phan lai/lo trong cong ty lien doanh,
// lien ket" TUY CONG TY co phat sinh giao dich do hay khong (da gap ca 3 to
// hop tren cung 4 mau: DCS/PAP chi chen BDSDT, IDV chen ca hai, EBS/CT6/HVA/
// LLM khong chen dong nao) - khop theo TEN (khong phai ma so, vi ma so cac
// dong SAU dich khac nhau tuy to hop) tu dong xu ly dung ca 3 truong hop, 2
// dong tuy chon nay KHONG dong gop gi khi khong ton tai (dung, vi khong co
// giao dich that).
const DN_THUONG_INCOME_FORMULAS: FormulaDef[] = [
  { groupLabel: 'Doanh thu thuan', target: ['DOANH THU THUAN VE BAN HANG VA CUNG CAP DICH VU', 'DOANH THU THUAN'], terms: [req(['DOANH THU BAN HANG VA CUNG CAP DICH VU']), req(['CAC KHOAN GIAM TRU DOANH THU'], -1)] },
  { groupLabel: 'Loi nhuan gop', target: ['LOI NHUAN GOP VE BAN HANG VA CUNG CAP DICH VU', 'LOI NHUAN GOP'], terms: [req(['DOANH THU THUAN VE BAN HANG VA CUNG CAP DICH VU', 'DOANH THU THUAN']), req(['GIA VON HANG BAN'], -1)] },
  {
    groupLabel: 'Loi nhuan thuan tu hoat dong kinh doanh',
    target: ['LOI NHUAN THUAN TU HOAT DONG KINH DOANH'],
    terms: [
      req(['LOI NHUAN GOP VE BAN HANG VA CUNG CAP DICH VU', 'LOI NHUAN GOP']),
      opt(['BAN, THANH LY BAT DONG SAN DAU TU']),
      req(['DOANH THU HOAT DONG TAI CHINH']),
      req(['CHI PHI TAI CHINH', 'CHI PHI HOAT DONG TAI CHINH'], -1),
      opt(['CONG TY LIEN DOANH, LIEN KET']),
      req(['CHI PHI BAN HANG'], -1),
      req(['CHI PHI QUAN LY DOANH NGHIEP'], -1), // fuzzy match xu ly bien the chinh ta (vd "quan li")
    ],
  },
  { groupLabel: 'Loi nhuan khac', target: ['LOI NHUAN KHAC'], terms: [req(['THU NHAP KHAC']), req(['CHI PHI KHAC'], -1)] },
  { groupLabel: 'Tong loi nhuan ke toan truoc thue', target: ['TONG LOI NHUAN KE TOAN TRUOC THUE'], terms: [req(['LOI NHUAN THUAN TU HOAT DONG KINH DOANH']), req(['LOI NHUAN KHAC'])] },
  // KHONG dung marker "LOI NHUAN SAU THUE" tran lan (khong hau to) lam target
  // - da phat hien qua DIC that (2026-07-13): bao cao co CA 3 dong "Loi nhuan
  // sau thue TNDN"/"...cua cong ty me"/"...cua co dong khong kiem soat" -
  // marker qua rong se khop NHAM qua tang substring vao dong "...cua co dong
  // khong kiem soat" (dong CUOI cung trong bang, = 0 vi DIC khong co co dong
  // thieu so), khong phai dong TONG that su. Can markers CU THE, du de tang
  // "chinh xac" (sau khi bo hau to cong thuc) tim dung dong TRUOC KHI roi vao
  // tang substring mo hon.
  { groupLabel: 'Loi nhuan sau thue thu nhap doanh nghiep', target: ['LOI NHUAN SAU THUE THU NHAP DOANH NGHIEP', 'LOI NHUAN SAU THUE TNDN'], terms: [req(['TONG LOI NHUAN KE TOAN TRUOC THUE']), req(['CHI PHI THUE THU NHAP DOANH NGHIEP HIEN HANH'], -1), req(['CHI PHI THUE THU NHAP DOANH NGHIEP HOAN LAI'], -1)] },
];

// CTCK (Thong tu 210/2014 + 334/2016) - xac nhan qua VCK/PHS/MBS Q1/2026 that
// (2026-07-13). Cac dong chi tiet (FVTPL/HTM/cho vay/AFS/phai sinh/moi gioi/
// bao lanh/tu van/luu ky...) la TUY CHON - moi cong ty co mot vai dong trong
// so nay (da xac nhan: VCK thieu phai sinh/bao lanh/tu van dau tu CK, MBS
// thieu phai sinh/tu van dau tu CK, PHS co DU ca 11 dong) - khong the doan
// truoc dong nao se co.
const CTCK_INCOME_FORMULAS: FormulaDef[] = [
  {
    groupLabel: 'Cong doanh thu hoat dong',
    target: ['CONG DOANH THU HOAT DONG', 'TONG DOANH THU HOAT DONG'],
    terms: [
      opt(['LAI TU CAC TAI SAN TAI CHINH']), // "...duoc ghi nhan theo gia tri hop ly thong qua lai/(lo)" hoac "...ghi nhan thong qua lai/lo" (FVTPL)
      opt(['LAI TU CAC KHOAN DAU TU NAM GIU DEN NGAY DAO HAN']),
      opt(['LAI TU CAC KHOAN CHO VAY VA PHAI THU']),
      opt(['LAI TU TAI SAN TAI CHINH SAN SANG DE BAN', 'LAI TU CAC TAI SAN TAI CHINH SAN SANG']),
      opt(['LAI TU CAC CONG CU PHAI SINH PHONG NGUA RUI RO', 'LAI TU CAC TAI SAN TAI CHINH PHAI SINH']),
      opt(['DOANH THU NGHIEP VU MOI GIOI CHUNG KHOAN']),
      opt(['DOANH THU NGHIEP VU BAO LANH']),
      opt(['DOANH THU NGHIEP VU TU VAN DAU TU CHUNG KHOAN']),
      opt(['DOANH THU NGHIEP VU LUU KY CHUNG KHOAN']),
      opt(['DOANH THU HOAT DONG TU VAN TAI CHINH', 'DOANH THU NGHIEP VU TU VAN TAI CHINH']), // HCM dung "nghiep vu" thay vi "hoat dong" (2026-07-13)
      opt(['THU NHAP HOAT DONG KHAC']),
    ],
  },
  {
    groupLabel: 'Cong chi phi hoat dong',
    target: ['CONG CHI PHI HOAT DONG', 'TONG CHI PHI HOAT DONG'],
    terms: [
      // PHS that (2026-07-13): marker ngan "LO TU/CAC TAI SAN TAI CHINH" (khong
      // co FVTPL) VO TINH cung la tien to cua 1 dong KHAC "2.5. Lo tu cac tai
      // san tai chinh PHAI SINH PHONG NGUA RUI RO" (khac han FVTPL) - khien
      // "khop cuoi cung" chon nham dong phai sinh. Marker phai DU DAI de bao
      // gom dac diem rieng cua tung cach dien dat da xac nhan qua VCK/PHS/HCM
      // that, khong con la tien to chung chung.
      opt(['LO TU CAC TAI SAN TAI CHINH FVTPL', 'LO CAC TAI SAN TAI CHINH GHI NHAN THONG QUA LAI']),
      opt(['LO CAC KHOAN DAU TU NAM GIU DEN NGAY DAO HAN', 'LO TU CAC KHOAN DAU TU NAM GIU DEN NGAY DAO HAN']),
      opt(['CHENH LECH DANH GIA THEO GIA TRI HOP LY TAI SAN TAI CHINH SAN SANG DE BAN', 'TAI SAN TAI CHINH SAN SANG DE BAN (AFS) KHI PHAN LOAI LAI']), // VCK that 2026-07-13: "Lo VA GHI NHAN CHENH LECH danh gia..." - "ghi nhan" cach "danh gia" boi "chenh lech", marker truoc thieu tu nay nen khong khop
      opt(['CHI PHI DU PHONG TAI SAN TAI CHINH']),
      opt(['LO TU CAC TAI SAN TAI CHINH PHAI SINH', 'LO TU CONG CU PHAI SINH']),
      opt(['CHI PHI HOAT DONG TU DOANH']),
      opt(['CHI PHI NGHIEP VU MOI GIOI CHUNG KHOAN']),
      opt(['CHI PHI NGHIEP VU BAO LANH']),
      opt(['CHI PHI NGHIEP VU TU VAN DAU TU CHUNG KHOAN']),
      opt(['CHI PHI NGHIEP VU LUU KY CHUNG KHOAN']),
      opt(['CHI PHI HOAT DONG TU VAN TAI CHINH', 'CHI PHI NGHIEP VU TU VAN TAI CHINH']), // HCM dung "nghiep vu" thay vi "hoat dong" (2026-07-13)
      opt(['CHI PHI CAC DICH VU KHAC']),
      opt(['CHI PHI DI VAY CUA CAC KHOAN CHO VAY']), // HCM that 2026-07-13: dong chi phi rieng, khong co o VCK/PHS/MBS
    ],
  },
  {
    groupLabel: 'Cong doanh thu hoat dong tai chinh',
    target: ['CONG DOANH THU HOAT DONG TAI CHINH', 'TONG DOANH THU HOAT DONG TAI CHINH'],
    terms: [
      opt(['CHENH LECH LAI TY GIA HOI DOAI']),
      opt(['DOANH THU, DU THU CO TUC, LAI TIEN GUI', 'DOANH THU DU THU CO TUC']),
      opt(['LAI BAN, THANH LY CAC KHOAN DAU TU']),
      opt(['DOANH THU KHAC VE DAU TU']),
    ],
  },
  {
    groupLabel: 'Cong chi phi tai chinh',
    target: ['CONG CHI PHI TAI CHINH', 'TONG CHI PHI TAI CHINH'],
    terms: [
      opt(['CHENH LECH LO TY GIA HOI DOAI']),
      opt(['CHI PHI LAI VAY']),
      opt(['TRICH LAP DU PHONG SUY GIAM GIA TRI CAC KHOAN DAU TU TAI CHINH DAI HAN']),
      opt(['CHI PHI TAI CHINH KHAC']),
    ],
  },
  {
    groupLabel: 'Ket qua hoat dong',
    target: ['KET QUA HOAT DONG'],
    terms: [
      req(['CONG DOANH THU HOAT DONG']),
      req(['CONG CHI PHI HOAT DONG'], -1),
      req(['CONG DOANH THU HOAT DONG TAI CHINH']),
      req(['CONG CHI PHI TAI CHINH'], -1),
      req(['CHI PHI QUAN LY CONG TY CHUNG KHOAN'], -1),
    ],
  },
  { groupLabel: 'Cong ket qua hoat dong khac', target: ['CONG KET QUA HOAT DONG KHAC', 'TONG KET QUA HOAT DONG KHAC'], terms: [opt(['THU NHAP KHAC']), opt(['CHI PHI KHAC'], -1)] },
  { groupLabel: 'Tong loi nhuan ke toan truoc thue', target: ['TONG LOI NHUAN KE TOAN TRUOC THUE'], terms: [req(['KET QUA HOAT DONG']), opt(['CONG KET QUA HOAT DONG KHAC'])] },
  { groupLabel: 'Loi nhuan ke toan sau thue TNDN', target: ['LOI NHUAN KE TOAN SAU THUE'], terms: [req(['TONG LOI NHUAN KE TOAN TRUOC THUE']), req(['CHI PHI THUE THU NHAP DOANH NGHIEP'], -1)] },
];

// Bien the BVH (tap doan bao hiem, ket hop nhan tho + phi nhan tho, Thong tu
// 232/2012) - xac nhan qua so lieu that Q1/2026 (2026-07-13, tinh tay khop
// tuyet doi tung dong). Moi dong deu la muc BAT BUOC (mau bieu co dinh, day
// du - khac han DN thuong/CTCK khong co dong tuy chon).
const INSURANCE_BVH_INCOME_FORMULAS: FormulaDef[] = [
  { groupLabel: 'Doanh thu phi bao hiem', target: ['DOANH THU PHI BAO HIEM'], terms: [req(['PHI BAO HIEM GOC']), req(['PHI NHAN TAI BAO HIEM']), req(['TANG DU PHONG PHI CHUA DUOC HUONG'])] },
  { groupLabel: 'Phi nhuong tai bao hiem', target: ['PHI NHUONG TAI BAO HIEM'], terms: [req(['TONG PHI NHUONG TAI BAO HIEM']), req(['TANG DU PHONG PHI NHUONG TAI BAO HIEM'])] },
  { groupLabel: 'Doanh thu phi bao hiem thuan', target: ['DOANH THU PHI BAO HIEM THUAN'], terms: [req(['DOANH THU PHI BAO HIEM']), req(['PHI NHUONG TAI BAO HIEM'])] },
  { groupLabel: 'Doanh thu thuan tu hoat dong kinh doanh bao hiem', target: ['DOANH THU THUAN TU HOAT DONG KINH DOANH BAO HIEM'], terms: [req(['DOANH THU PHI BAO HIEM THUAN']), req(['HOA HONG NHUONG TAI BAO HIEM VA DOANH THU KHAC'])] },
  { groupLabel: 'Cac khoan giam tru chi phi', target: ['CAC KHOAN GIAM TRU CHI PHI'], terms: [req(['THU DOI NGUOI THU BA']), req(['THU XU LY HANG BOI THUONG'])] },
  { groupLabel: 'Tang du phong nghiep vu bao hiem goc', target: ['TANG DU PHONG NGHIEP VU BAO HIEM GOC'], terms: [req(['TANG DU PHONG TOAN HOC']), req(['GIAM DU PHONG LAI CAM KET DAU TU TOI THIEU']), req(['TANG DU PHONG CHIA LAI']), req(['TANG DU PHONG DAM BAO CAN DOI'])] },
  {
    groupLabel: 'Tong chi boi thuong va tra tien bao hiem',
    target: ['TONG CHI BOI THUONG VA TRA TIEN BAO HIEM'],
    terms: [
      req(['CHI BOI THUONG BAO HIEM GOC VA CHI TRA DAO HAN']),
      req(['CHI BOI THUONG NHAN TAI BAO HIEM']),
      req(['CAC KHOAN GIAM TRU CHI PHI']),
      req(['THU BOI THUONG NHUONG TAI BAO HIEM']),
      req(['TANG DU PHONG NGHIEP VU BAO HIEM GOC']),
      req(['GIAM DU PHONG BOI THUONG BAO HIEM GOC VA NHAN TAI BAO HIEM']),
      req(['GIAM DU PHONG BOI THUONG NHUONG TAI BAO HIEM']),
    ],
  },
  { groupLabel: 'Chi khac hoat dong bao hiem goc', target: ['CHI KHAC HOAT DONG BAO HIEM GOC'], terms: [req(['CHI HOA HONG']), req(['CHI KHAC HOAT DONG KINH DOANH BAO HIEM'])] },
  {
    groupLabel: 'Tong chi truc tiep hoat dong kinh doanh bao hiem',
    target: ['TONG CHI TRUC TIEP HOAT DONG KINH DOANH BAO HIEM'],
    terms: [req(['TONG CHI BOI THUONG VA TRA TIEN BAO HIEM']), req(['TANG DU PHONG DAO DONG LON']), req(['CHI KHAC HOAT DONG BAO HIEM GOC'])],
  },
  { groupLabel: 'Loi nhuan gop hoat dong kinh doanh bao hiem', target: ['LOI NHUAN GOP HOAT DONG KINH DOANH BAO HIEM'], terms: [req(['DOANH THU THUAN TU HOAT DONG KINH DOANH BAO HIEM']), req(['TONG CHI TRUC TIEP HOAT DONG KINH DOANH BAO HIEM'])] },
  { groupLabel: 'Loi nhuan thuan tu cac hoat dong khac', target: ['LOI NHUAN THUAN TU CAC HOAT DONG KHAC'], terms: [req(['DOANH THU HOAT DONG KHAC']), req(['CHI PHI HOAT DONG KHAC'])] },
  { groupLabel: 'Loi nhuan hoat dong tai chinh', target: ['LOI NHUAN HOAT DONG TAI CHINH'], terms: [req(['DOANH THU HOAT DONG TAI CHINH']), req(['CHI PHI HOAT DONG TAI CHINH'])] },
  { groupLabel: 'Loi nhuan khac', target: ['LOI NHUAN KHAC'], terms: [req(['THU NHAP KHAC']), req(['CHI PHI KHAC'])] },
  {
    groupLabel: 'Tong loi nhuan ke toan truoc thue',
    target: ['TONG LOI NHUAN KE TOAN TRUOC THUE'],
    terms: [
      req(['LOI NHUAN GOP HOAT DONG KINH DOANH BAO HIEM']),
      req(['LOI NHUAN THUAN TU CAC HOAT DONG KHAC']),
      req(['LOI NHUAN HOAT DONG TAI CHINH']),
      req(['PHAN LOI NHUAN TRONG CONG TY LIEN KET']),
      req(['CHI PHI BAN HANG']),
      req(['CHI PHI QUAN LY DOANH NGHIEP']),
      req(['LOI NHUAN KHAC']),
    ],
  },
  { groupLabel: 'Loi nhuan sau thue thu nhap doanh nghiep', target: ['LOI NHUAN SAU THUE THU NHAP DOANH NGHIEP'], terms: [req(['TONG LOI NHUAN KE TOAN TRUOC THUE']), req(['CHI PHI THUE THU NHAP DOANH NGHIEP HIEN HANH']), req(['THU NHAP THUE THU NHAP DOANH NGHIEP HOAN LAI'])] },
];

// Bien the PRE (bao hiem phi nhan tho thuan, Thong tu 232/2012) - xac nhan
// qua so lieu that Q1/2026. Mau bieu on dinh, khong co dong tuy chon (tru
// "Loi nhuan khac" - PRE thuc te co the KHONG phat sinh HD nao khac trong ky,
// bo han dong nay khoi bao cao).
const INSURANCE_PRE_INCOME_FORMULAS: FormulaDef[] = [
  { groupLabel: 'Doanh thu phi bao hiem', target: ['DOANH THU PHI BAO HIEM'], terms: [req(['PHI NHAN TAI BAO HIEM']), req(['TANG DU PHONG PHI NHAN TAI BAO HIEM'], -1)] },
  { groupLabel: 'Phi nhuong tai bao hiem', target: ['PHI NHUONG TAI BAO HIEM'], terms: [req(['TONG PHI NHUONG TAI BAO HIEM']), req(['TANG DU PHONG PHI NHUONG TAI BAO HIEM'], -1)] },
  { groupLabel: 'Doanh thu phi bao hiem thuan', target: ['DOANH THU PHI BAO HIEM THUAN'], terms: [req(['DOANH THU PHI BAO HIEM']), req(['PHI NHUONG TAI BAO HIEM'], -1)] },
  { groupLabel: 'Hoa hong nhuong tai bao hiem va doanh thu khac hoat dong kinh doanh bao hiem', target: ['HOA HONG NHUONG TAI BAO HIEM VA DOANH THU KHAC HOAT DONG KINH DOANH BAO HIEM'], terms: [req(['HOA HONG NHUONG TAI BAO HIEM']), req(['DOANH THU KHAC HOAT DONG KINH DOANH BAO HIEM'])] },
  { groupLabel: 'Doanh thu thuan hoat dong kinh doanh bao hiem', target: ['DOANH THU THUAN HOAT DONG KINH DOANH BAO HIEM'], terms: [req(['DOANH THU PHI BAO HIEM THUAN']), req(['HOA HONG NHUONG TAI BAO HIEM VA DOANH THU KHAC HOAT DONG KINH DOANH BAO HIEM'])] },
  { groupLabel: 'Chi boi thuong', target: ['CHI BOI THUONG'], terms: [req(['TONG BOI THUONG'])] },
  {
    groupLabel: 'Tong chi boi thuong bao hiem',
    target: ['TONG CHI BOI THUONG BAO HIEM'],
    terms: [req(['CHI BOI THUONG']), req(['THU BOI THUONG NHUONG TAI BAO HIEM'], -1), req(['GIAM DU PHONG BOI THUONG NHAN TAI BAO HIEM']), req(['GIAM DU PHONG BOI THUONG NHUONG TAI BAO HIEM'], -1)],
  },
  { groupLabel: 'Chi phi khac hoat dong kinh doanh bao hiem', target: ['CHI PHI KHAC HOAT DONG KINH DOANH BAO HIEM'], terms: [req(['CHI HOA HONG BAO HIEM']), req(['CHI KHAC HOAT DONG KINH DOANH BAO HIEM'])] },
  {
    groupLabel: 'Tong chi phi hoat dong kinh doanh bao hiem',
    target: ['TONG CHI PHI HOAT DONG KINH DOANH BAO HIEM'],
    terms: [req(['TONG CHI BOI THUONG BAO HIEM']), req(['TANG DU PHONG DAO DONG LON VA DAM BAO CAN DOI']), req(['CHI PHI KHAC HOAT DONG KINH DOANH BAO HIEM'])],
  },
  { groupLabel: 'Loi nhuan gop hoat dong kinh doanh bao hiem', target: ['LOI NHUAN GOP HOAT DONG KINH DOANH BAO HIEM'], terms: [req(['DOANH THU THUAN HOAT DONG KINH DOANH BAO HIEM']), req(['TONG CHI PHI HOAT DONG KINH DOANH BAO HIEM'], -1)] },
  { groupLabel: 'Loi nhuan gop hoat dong tai chinh', target: ['LOI NHUAN GOP HOAT DONG TAI CHINH'], terms: [req(['DOANH THU HOAT DONG TAI CHINH']), req(['CHI PHI TAI CHINH'], -1)] },
  { groupLabel: 'Loi nhuan gop hoat dong kinh doanh', target: ['LOI NHUAN GOP HOAT DONG KINH DOANH'], terms: [req(['LOI NHUAN GOP HOAT DONG KINH DOANH BAO HIEM']), req(['LOI NHUAN GOP HOAT DONG TAI CHINH']), req(['CHI PHI QUAN LY DOANH NGHIEP'], -1)] },
  { groupLabel: 'Tong loi nhuan ke toan truoc thue', target: ['TONG LOI NHUAN KE TOAN TRUOC THUE'], terms: [req(['LOI NHUAN GOP HOAT DONG KINH DOANH']), opt(['LOI NHUAN KHAC'])] },
  { groupLabel: 'Loi nhuan sau thue TNDN', target: ['LOI NHUAN SAU THUE TNDN', 'LOI NHUAN SAU THUE'], terms: [req(['TONG LOI NHUAN KE TOAN TRUOC THUE']), req(['CHI PHI THUE THU NHAP DOANH NGHIEP'], -1)] },
];

// Ngan hang (Thong tu 49/2014-NHNN) - khong co cot Ma so dang tin cay trong
// du lieu that TCB/TPB, da hoan toan theo TEN CHI TIEU tu truoc. LUU Y DAU:
// cac dong "chi phi" o day la SO AM SAN (vd "Chi phí lãi và các chi phí
// tương tự" = -10174952) - cong truc tiep (sign=+1) la dung, KHONG duoc tru
// them 1 lan nua (sign=-1 se lam tru so am = cong 2 lan, sai hoan toan) - da
// xac nhan qua TCB that (2026-07-13).
const BANK_INCOME_FORMULAS: FormulaDef[] = [
  { groupLabel: 'Thu nhap lai thuan', target: ['THU NHAP LAI THUAN'], terms: [req(['THU NHAP LAI VA CAC KHOAN THU NHAP TUONG TU']), req(['CHI PHI LAI VA CAC CHI PHI TUONG TU'])] },
  { groupLabel: 'Lai thuan tu hoat dong dich vu', target: ['LAI THUAN TU HOAT DONG DICH VU'], terms: [req(['THU NHAP TU HOAT DONG DICH VU']), req(['CHI PHI HOAT DONG DICH VU'])] },
  { groupLabel: 'Lai thuan tu hoat dong khac', target: ['LAI THUAN TU HOAT DONG KHAC'], terms: [req(['THU NHAP TU HOAT DONG KHAC']), req(['CHI PHI HOAT DONG KHAC'])] },
  {
    groupLabel: 'Tong thu nhap hoat dong',
    target: ['TONG THU NHAP HOAT DONG'],
    terms: [
      req(['THU NHAP LAI THUAN']),
      req(['LAI THUAN TU HOAT DONG DICH VU']),
      req(['LAI THUAN TU HOAT DONG KINH DOANH NGOAI HOI']),
      req(['LAI THUAN TU MUA BAN CHUNG KHOAN KINH DOANH']),
      req(['LAI THUAN TU MUA BAN CHUNG KHOAN DAU TU']),
      req(['LAI THUAN TU HOAT DONG KHAC']),
      req(['GOP VON, MUA CO PHAN']),
    ],
  },
  { groupLabel: 'Loi nhuan thuan truoc chi phi du phong', target: ['TRUOC CHI PHI DU PHONG RUI RO TIN DUNG'], terms: [req(['TONG THU NHAP HOAT DONG']), req(['CHI PHI HOAT DONG'])] },
  { groupLabel: 'Tong loi nhuan truoc thue', target: ['TONG LOI NHUAN TRUOC THUE'], terms: [req(['TRUOC CHI PHI DU PHONG RUI RO TIN DUNG']), req(['CHI PHI DU PHONG RUI RO TIN DUNG'])] },
];

// Nhan dien bien the bao hiem QUA NOI DUNG (tim TREN TOAN BANG theo TEN, khong
// dua vao ma so/vi tri) - da phat hien qua PHS (CTCK, 2026-07-13): truoc day
// dung "ma so 29 ton tai" lam tin hieu, nhung PHS (CTCK) co dong "2.9. Chi
// phi nghiep vu tu van dau tu chung khoan" TRUNG NGAU NHIEN ma so "29" -
// chuyen han sang tim THEO TEN CHINH XAC cua dong dac trung rieng tung bien
// the (khong con doc ma so o day nua).
function isInsuranceBvhStyle(table: StatementTable): boolean {
  const labelIndex = findLabelColumnIndex(table.columns, table.rows);
  return findRowIndexByContentMarkers(table, labelIndex, ['TONG CHI BOI THUONG VA TRA TIEN BAO HIEM']) !== -1;
}
function isInsurancePreStyle(table: StatementTable): boolean {
  const labelIndex = findLabelColumnIndex(table.columns, table.rows);
  return findRowIndexByContentMarkers(table, labelIndex, ['TONG CHI BOI THUONG BAO HIEM']) !== -1;
}

// Ham chinh - goi tu validateIncomeStatementGroupSums (validate-statements.ts)
// thay the findIncomeStatementGroupMismatches cho canh bao HIEN THI. `businessType`
// chi la GOI Y ban dau (co the SAI - xem BVH, gan nham nhan "other" du la
// cong ty bao hiem that); nhan dien bao hiem qua NOI DUNG luon chay TRUOC,
// doc lap voi nhan da gan.
export function findIncomeStatementFormulaMismatches(table: StatementTable, businessType: 'bank' | 'securities' | 'insurance' | 'other'): GroupSumMismatch[] {
  if (isInsuranceBvhStyle(table)) return evaluateNamedFormulas(table, INSURANCE_BVH_INCOME_FORMULAS);
  if (isInsurancePreStyle(table)) return evaluateNamedFormulas(table, INSURANCE_PRE_INCOME_FORMULAS);
  if (businessType === 'other') return evaluateNamedFormulas(table, DN_THUONG_INCOME_FORMULAS);
  if (businessType === 'securities') return evaluateNamedFormulas(table, CTCK_INCOME_FORMULAS);
  if (businessType === 'bank') return evaluateNamedFormulas(table, BANK_INCOME_FORMULAS);
  return [];
}

const DECIMAL_CHILD_CODE_PATTERN = /^(\d+)\.\d+$/;

// Hau het nhom ma so thap phan la PHEP CONG thuan (X = X.1 + X.2 + ...), NHUNG
// mot dong con co TEN "Tang du phong..." (tang du phong/tang trich lap) LUON
// mang Y NGHIA KE TOAN la khoan GIAM TRU (du phong tang len lam giam doanh
// thu/phi thuan con lai duoc ghi nhan) - BAT KE cong ty luu gia tri do o dang
// SO DUONG (can TRU, vd PRE that 2026-07-13: "02.2 Tang du phong phi nhuong
// tai bao hiem" = so duong, cong thuc "02=02.1-02.2") hay da tu mang dau AM
// san (cong truc tiep, vd BVH). Doc THEO TEN chi tieu (ban chat ke toan, ap
// dung duoc moi cong ty/mau bieu) thay vi doc mã số hay cong thuc in san
// trong nhan (co the bi OCR doc sai) - luon TRU GIA TRI TUYET DOI cua dong
// "Tang du phong", giong het ky thuat Math.abs() da dung cho "Chi phi thue
// TNDN" (validateIncomeStatementTax) de xu ly ca 2 quy uoc dau cung luc.
function decimalChildSign(childLabel: string): 1 | -1 {
  return normalizeLabelText(childLabel).includes('TANG DU PHONG') ? -1 : 1;
}

// Kiem tra "cac dong con co ma so dang THAP PHAN THUAN (X.Y, vd '111.1' la
// con cua '111') co tong khop voi CHINH dong cha (ma so X) hay khong" - khac
// findIncomeStatementGroupMismatches (dua vao TEN "Cong.../Tong..." de nhan
// dien dong tong), o day dua HOAN TOAN vao CAU TRUC MA SO (khong phu thuoc
// ten tieng Viet/cach viet tat cua tung cong ty) nen AP DUNG DUOC CHUNG cho
// CA balanceSheet LAN incomeStatement (2026-07-12, yeu cau nguoi dung mo
// rong kiem tra cheo "sau hon" sau khi xac nhan nhom phang KQKD hoat dong
// tot). Da xac nhan qua doi chieu that MBS Q2/2026: BCDKT "111.1"+"111.2" =
// "111"; "417.1"+"417.2" = "417"; KQKD "01.1"+"01.2"+"01.3"+"01.4" = "01" -
// khop tuyet doi voi du lieu that ca 2 bang.
//
// CHI nhan ma so dang "X.Y" THUAN so (khong ke hau to chu nhu "411.1a") -
// truong hop nay hiem VA neu ep coi "411.1a" la con cua "411" (thay vi con
// cua "411.1") se gom SAI nhom (411.1a thuc ra la con CUA 411.1, khong phai
// con truc tiep cua 411) - uu tien AN TOAN (bo qua, khong kiem tra duoc con
// nay o ca 2 tang) hon la kiem tra SAI.
//
// BAT BUOC phai co dong ".1" (X.1) thi moi kiem tra nhom cua "X" - da gap
// that MBS Q2/2026 (2026-07-12): "117.2"/"117.3"/"117.4" (khong co "117.1")
// nhin GIONG 3 con truc tiep cua "117", nhung thuc ra "117.3"/"117.4" la
// con CUA "117.2" (chi la cong ty ghi phang "117.3"/"117.4" thay vi dung ky
// hieu 3 cap "117.2.1"/"117.2.2") - sum ra gan dung GAP DOI gia tri that (vi
// 117.3+117.4 = 117.2, cong them ca 117.2 la dem 2 lan). Theo dung quy uoc
// VAS, 1 nhom da chia nho LUON bat dau tu ".1" - neu thieu ".1" la dau hieu
// dang tin cay cho thay danh sach ".2"/".3".. tim duoc co the LONG SAU HON 1
// cap (khong phai anh xa phang don gian), uu tien AN TOAN bo qua ca nhom.
export function findDecimalCodeGroupMismatches(table: StatementTable): GroupSumMismatch[] {
  const labelIndex = findLabelColumnIndex(table.columns, table.rows);
  const maSoIndex = findMaSoColumnIndex(table);
  if (maSoIndex === null) return [];
  const valueColIndexes = valueColumnIndexes(table);
  const mismatches: GroupSumMismatch[] = [];

  const childrenByParentCode = new Map<string, number[]>();
  table.rows.forEach((row, i) => {
    const code = row[maSoIndex];
    if (typeof code !== 'string') return;
    const match = DECIMAL_CHILD_CODE_PATTERN.exec(code.trim());
    if (!match) return;
    const parentCode = match[1];
    const existing = childrenByParentCode.get(parentCode);
    if (existing) existing.push(i);
    else childrenByParentCode.set(parentCode, [i]);
  });

  for (const [parentCode, memberRowIndexes] of childrenByParentCode) {
    const hasFirstChild = memberRowIndexes.some((j) => String(table.rows[j][maSoIndex] ?? '').trim() === `${parentCode}.1`);
    if (!hasFirstChild) continue;
    const parentRowIndex = table.rows.findIndex((row) => String(row[maSoIndex] ?? '').trim() === parentCode);
    if (parentRowIndex === -1) continue; // chi co dong .1/.2... ma khong co dong goc - khong du du lieu de so sanh
    const parentRow = table.rows[parentRowIndex];
    // "?? " khong bat duoc nhan la CHUOI RONG (chi bat null/undefined) - dong
    // that su co the co nhan rong (bang phan tich hong o cho khac lam lech
    // cot, da gap that qua doi chieu that DCS/PAP/DIC Q1/2026, 2026-07-12) -
    // luon co MA SO trong thong bao de nguoi xem con dinh vi duoc dong nao,
    // thay vi thong bao rong vo dung "" khong khop "".
    const rawLabel = String(parentRow[labelIndex] ?? '').trim();
    const groupLabel = rawLabel || `ma so ${parentCode}`;

    for (const col of valueColIndexes) {
      let sum = 0;
      let sawDetail = false;
      for (const j of memberRowIndexes) {
        const cell = table.rows[j][col];
        const value = typeof cell === 'number' ? cell : cell === '-' || cell === null ? 0 : null;
        if (value === null) continue;
        const childLabel = String(table.rows[j][labelIndex] ?? '').trim();
        const sign = decimalChildSign(childLabel);
        sum += sign === -1 ? -Math.abs(value) : value;
        sawDetail = true;
      }
      if (!sawDetail) continue;

      const parentCell = parentRow[col];
      const reported = typeof parentCell === 'number' ? parentCell : parentCell === '-' || parentCell === null ? 0 : null;
      if (reported === null) continue;

      if (Math.abs(sum - reported) > Math.max(GROUP_SUM_TOLERANCE_ABSOLUTE, Math.abs(reported) * GROUP_SUM_TOLERANCE_RATIO)) {
        mismatches.push({ groupLabel, columnName: table.columns[col] ?? `cot ${col}`, columnIndex: col, subtotalRowIndex: parentRowIndex, memberRowIndexes, sum, reported });
      }
    }
  }

  return mismatches;
}

// Tong quat hoa 1 buoc kiem tra da co (validateBalanceSheetSubtotals,
// lib/export/validate-statements.ts) tu "1 tang" (dong tong cap-0 vd "TS
// ngan han" = tong cac dong "cap 1" I/II/III...) len "2 tang" (2026-07-12,
// yeu cau nguoi dung): VOI MOI dong "cap 1" tim thay trong 1 nhom cap-0 da
// biet ranh gioi (groupStartIdx/groupEndIdx, do NGOAI truyen vao - da xac
// dinh dang tin cay qua ten chi tieu o validateBalanceSheetSubtotals), kiem
// tra CHINH dong "cap 1" do co khop voi tong CAC DONG NAM GIUA no va dong
// "cap 1" TIEP THEO (hoac het pham vi nhom) hay khong.
//
// KHONG can phan biet "A" (cap 0) voi "I" (cap 1) bang pattern rieng (ca 2
// deu la chu hoa, khong the phan biet do dai/hinh thuc mot cach dang tin
// cay - da xac nhan qua du lieu that: STT co the la chu hoa 1 ky tu ("A",
// "D") LAN so La Ma nhieu ky tu ("I","II","V") LAN CA so thuong khong theo
// quy luat ro rang o cac dong sau do) - vi da co san ranh gioi ngoai dang
// tin cay lam moc (tu 4 nhom da biet ten chinh xac), trong 1 nhom cap-0, bat
// ky dong "subtotal-like" nao tim thay (isLikelySubtotalRow) CHAC CHAN la
// cap 1 cua chinh no, khong can biet no la "A" hay "I" ve mat hinh thuc.
export function findBalanceSheetLevel2Mismatches(table: StatementTable, groupStartIdx: number, groupEndIdx: number): GroupSumMismatch[] {
  if (groupStartIdx === -1 || groupEndIdx === -1 || groupEndIdx <= groupStartIdx) return [];
  const labelIndex = findLabelColumnIndex(table.columns, table.rows);
  // Khong co tin hieu dang tin cay - bo qua thay vi doan (xem
  // hasReliableSubtotalSignal va CAP NHAT 2026-07-12 o childrenBetween,
  // lib/export/validate-statements.ts).
  if (!hasReliableSubtotalSignal(table, labelIndex)) return [];
  const maSoIndex = findMaSoColumnIndex(table);
  const valueColIndexes = valueColumnIndexes(table);
  const mismatches: GroupSumMismatch[] = [];

  const level1Indexes: number[] = [];
  for (let i = groupStartIdx + 1; i < groupEndIdx; i++) {
    if (!isLikelySubtotalRow(table, table.rows[i], labelIndex)) continue;
    if (isDuplicateKnownBalanceSheetLevel1Row(table, labelIndex, groupStartIdx + 1, i)) continue;
    level1Indexes.push(i);
  }

  for (let k = 0; k < level1Indexes.length; k++) {
    const startIdx = level1Indexes[k];
    const endIdx = k + 1 < level1Indexes.length ? level1Indexes[k + 1] : groupEndIdx;
    const parentRow = table.rows[startIdx];
    // Nhan rong (bang phan tich hong o cho khac lam lech cot, khong phai loi
    // rieng cua ham nay) van can 1 moc de nguoi xem dinh vi duoc dong nao -
    // dung ma so (neu co) thay vi de thong bao rong vo dung "" khong khop "".
    const rawLabel = String(parentRow[labelIndex] ?? '').trim();
    const parentMaSo = maSoIndex === null ? null : parentRow[maSoIndex];
    const groupLabel = rawLabel || (typeof parentMaSo === 'string' && parentMaSo ? `ma so ${parentMaSo}` : `dong ${startIdx + 1}`);

    const memberRowIndexes: number[] = [];
    for (let j = startIdx + 1; j < endIdx; j++) {
      // Dong ma so dang thap phan (X.Y) da duoc kiem tra rieng qua
      // findDecimalCodeGroupMismatches (gop vao gia tri dong cha X) - bo qua
      // o day de tranh dem 2 lan.
      const maSo = maSoIndex === null ? null : table.rows[j][maSoIndex];
      if (typeof maSo === 'string' && maSo.includes('.')) continue;
      // Muc con CAP 4 (tien to "-"/"*"/"a)"... hoac noi dung chuan "Nguyen
      // gia"/"Gia tri hao mon luy ke") - da GOP SAN vao gia tri dong cha cap 3
      // ngay truoc no (vd "- LNST chua phan phoi ky nay" da nam trong "11./
      // Loi nhuan sau thue chua phan phoi") - cong THEM o day se dem 2 lan
      // (da xac nhan qua doi chieu that TIX/DIC, 2026-07-12).
      const memberLabel = String(table.rows[j][labelIndex] ?? '').trim();
      if (NON_SUBTOTAL_DETAIL_PREFIX.test(memberLabel) || isKnownCap4Label(memberLabel)) continue;
      memberRowIndexes.push(j);
    }
    if (memberRowIndexes.length === 0) continue;

    for (const col of valueColIndexes) {
      let sum = 0;
      let sawDetail = false;
      let previousValue: number | null = null;
      for (const j of memberRowIndexes) {
        const cell = table.rows[j][col];
        const value = typeof cell === 'number' ? cell : cell === '-' || cell === null ? 0 : null;
        if (value === null) continue;
        // Dong TRUNG GIA TRI voi dong LIEN TRUOC (cung cot) - dau hieu day la
        // BAN NHAC LAI CHI TIET cua chinh dong truoc (khong phai 1 khoan CONG
        // THEM), gap khi ma so/STT KHONG theo dung quy uoc thap phan chuan.
        // Da xac nhan qua doi chieu that MBS Q2/2026: dong "1 Vay va no thue
        // tai chinh ngan han" (ma 311) va dong NGAY SAU "11 Vay ngan han" (ma
        // 312, KHONG co dau cham nen khong bi loai boi kiem tra ma so o tren)
        // co GIA TRI Y HET nhau moi cot - dong 312 chi la nhac lai chi tiet
        // duy nhat cua 311, cong them se dem 2 lan dung 1 khoan.
        if (previousValue !== null && value === previousValue) {
          previousValue = value;
          continue;
        }
        sum += value;
        sawDetail = true;
        previousValue = value;
      }
      if (!sawDetail) continue;

      const parentCell = parentRow[col];
      const reported = typeof parentCell === 'number' ? parentCell : parentCell === '-' || parentCell === null ? 0 : null;
      if (reported === null) continue;

      if (Math.abs(sum - reported) > Math.max(GROUP_SUM_TOLERANCE_ABSOLUTE, Math.abs(reported) * GROUP_SUM_TOLERANCE_RATIO)) {
        mismatches.push({ groupLabel, columnName: table.columns[col] ?? `cot ${col}`, columnIndex: col, subtotalRowIndex: startIdx, memberRowIndexes, sum, reported });
      }
    }
  }

  return mismatches;
}

// Khoanh vung (rowIndex, columnIndex) can null hoa trong lib/analysis.ts -
// gom CA cac dong chi tiet LAN chinh dong tong (khong biet chac ben nao sai,
// xem comment o findIncomeStatementGroupMismatches/findDecimalCodeGroupMismatches/
// findBalanceSheetLevel2Mismatches).
export function unreliableCellKeysFromMismatches(mismatches: GroupSumMismatch[]): Set<string> {
  const keys = new Set<string>();
  for (const m of mismatches) {
    for (const j of m.memberRowIndexes) keys.add(`${j}:${m.columnIndex}`);
    keys.add(`${m.subtotalRowIndex}:${m.columnIndex}`);
  }
  return keys;
}
