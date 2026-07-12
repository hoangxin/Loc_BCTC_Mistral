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
export function hasReliableSubtotalSignal(table: StatementTable, labelIndex: number): boolean {
  const sttNamedIndex = table.columns.findIndex((col) => normalizeLabelText(col).includes('STT'));
  if (sttNamedIndex !== -1) return true;
  if (labelIndex > 0 && !isMetadataColumnName(table.columns[labelIndex - 1])) return true;
  return table.rows.some((r) => looksLikeArabicItemPrefix(String(r[labelIndex] ?? '').trim()));
}

export function isLikelySubtotalRow(table: StatementTable, row: (string | number | null)[], labelIndex: number): boolean {
  const label = String(row[labelIndex] ?? '').trim();
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
  if (NON_SUBTOTAL_DETAIL_PREFIX.test(label) || isKnownCap4Label(label)) return false;

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
  // Khong co tin hieu dang tin cay (xem hasReliableSubtotalSignal) de biet
  // dong nao la subtotal CAP 2 can LOAI khoi thanh vien (tranh dem 2 lan) -
  // BO QUA thay vi doan, xem CAP NHAT 2026-07-12 o childrenBetween
  // (lib/export/validate-statements.ts). Da xac nhan qua doi chieu that TCB
  // (Ngan hang, KQKD khong danh so gi ca): neu khong bo qua o day,
  // isLikelySubtotalRow tra ve false cho MOI dong (khong co tin hieu) nen
  // KHONG dong nao bi loai, dem CA cac dong subtotal cap 2 (vd "Thu nhap lai
  // thuan") LAN cac dong con cua no cung luc - dem 2 lan, sai gap doi.
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
      if (isLikelySubtotalRow(table, table.rows[j], labelIndex)) continue;
      // Muc con CAP 4 (tien to "-"/"*"/"a)"... hoac noi dung chuan "Nguyen
      // gia"/"Gia tri hao mon luy ke") - da GOP SAN vao gia tri dong cha cap 3
      // ngay truoc no, cong THEM o day se dem 2 lan (xem NON_SUBTOTAL_DETAIL_PREFIX/
      // isKnownCap4Label - isLikelySubtotalRow da tra ve false cho dong nay
      // nen KHONG bi loai boi dieu kien tren, phai kiem tra rieng).
      const memberLabel = String(table.rows[j][labelIndex] ?? '').trim();
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

const DECIMAL_CHILD_CODE_PATTERN = /^(\d+)\.\d+$/;

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
        sum += value;
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
    if (isLikelySubtotalRow(table, table.rows[i], labelIndex)) level1Indexes.push(i);
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
