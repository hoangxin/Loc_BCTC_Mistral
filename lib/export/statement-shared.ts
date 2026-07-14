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

// GHI CHU 2026-07-13 (theo yeu cau nguoi dung, bo HOAN TOAN tin hieu so thu
// tu khoi phan loai cap-do chi tieu): 2 pattern tung dung o day -
// ARABIC_ITEM_PREFIX (doc tien to so A-rap "1."/"7./" trong TEN de doan dong
// KHONG phai dong tong) va NON_SUBTOTAL_DETAIL_PREFIX (doc tien to dau cau
// "-"/"*"/"a)" de doan dong la chi tiet cap-4) - DA BI XOA khoi day. Ca 2 deu
// la tin hieu VI TRI/DINH DANG (khong phai TEN chi tieu), gay loi lap lai
// nhieu lan khi OCR doc nham/thieu tien to (vd doi cham "10" thanh "I.", xem
// KSQ/BOT that trong findEquityDirectChildRows). Thay the: `isKnownCap4Label`
// (duoi day, mo rong 2026-07-13) nhan chi tiet cap-4 qua NOI DUNG chuan (VAS/
// Thong tu), va `isKnownEquityDirectChildLabel` (tren, TT200 Dieu 112) nhan
// dong con truc tiep cua Von chu so huu qua TEN chuan thay vi tien to so
// A-rap. Neu can xem lai code cu, tim "ARABIC_ITEM_PREFIX"/
// "NON_SUBTOTAL_DETAIL_PREFIX" trong lich su git truoc commit sua doi nay.

// "Nguyen gia"/"Gia tri hao mon luy ke" LUON la dong cap-4 duoi 1 muc TSCD/
// BDS dau tu, theo dung thuat ngu chuan VAS - nhung TIEN TO/HAU TO cua tung
// cong ty khac nhau qua nhieu de liet ke het (da gap that: TIX dung "*",
// MBS/IDV dung "-", DIC 2026-07-12 dung tien to "." VA hau to "(*)" rieng -
// "Giá trị hao mòn lũy kế (*)"). Thay vi tiep tuc doi pho tung ky tu tien to
// moi (dua tren ky tu, de nham NGOAI le), nhan dien truc tiep qua NOI DUNG
// chuan (khong doi giua cac cong ty, chi khac phan trang tri xung quanh) -
// dang tin cay hon cho DUNG 2 thuat ngu nay.
// "Gia tri khau hao luy ke" - tu dong nghia voi "hao mon" (BVH that,
// 2026-07-13: dung "khấu hao" thay vi "hao mòn" cho CA TSCD huu hinh LAN Bat
// dong san dau tu) - thieu bien the nay khien dong bi coi NHAM la dong tong
// (roi vao fallback mac dinh true), cong TRUNG chinh no vao tong "TS dai han"
// (no da la 1 PHAN của gia tri TSCD/BDSĐT cha, khong phai 1 muc doc lap).
//
// MO RONG 2026-07-13 (thay the HOAN TOAN cho NON_SUBTOTAL_DETAIL_PREFIX - xem
// comment o isLikelySubtotalRow ve ly do bo han tien to dau cau "-"/"*"/"a)"):
// doi chieu qua corpus 28 bao cao that (data/latest-fetch.json) tim them cac
// bien the NOI DUNG can nhan dien qua ten thay vi qua dau cau dung truoc:
// - "HAO MON LUY KE"/"KHAU HAO LUY KE" rong hon "GIA TRI HAO MON/KHAU HAO LUY
//   KE" cu (van khop ca 2, vi la .includes() - chi bo bot chu "GIA TRI" bat
//   buoc o dau, bat them bien the ngan hon "Hao mòn lũy kế*").
// - "HAO MON TAI SAN CO DINH" - bien the khac "Hao mòn tài sản cố định*"
//   (khong co "luy ke"), gap trong corpus that.
// - "THEO GIA TRI HOP LY" - dong "Đánh giá TSCĐHH/TSCĐTTC/TSCĐVH/BĐSĐT theo
//   giá trị hợp lý" (chi tiet cap-4 rieng, khong phai muc doc lap).
// - "GIAI DOAN" - chi tiet sinh hoc TT99 duoi 1 muc "Súc/Sức vật nuôi..."
//   ("...chưa đến giai đoạn (trưởng thành)"/"...đến giai đoạn (trước/trưởng
//   thành)") - da ra soat TOAN BO corpus, cum tu "giai đoạn" CHI xuat hien o
//   cac dong chi tiet sinh hoc nay, an toan lam marker rieng (khong dung cho
//   chinh dong cap-3 goc "1. Súc vật nuôi cho sản phẩm định kỳ" vi dong do
//   KHONG chua "giai đoạn").
// - "CHUA PHAN PHOI KY NAY"/"CHUA PHAN PHOI LUY KE DEN CUOI" - 2 dong chi
//   tiet co dinh cua "Loi nhuan sau thue chua phan phoi" (mã 420a/420b).
const KNOWN_CAP4_LABEL_CONTENT = [
  'NGUYEN GIA',
  'HAO MON LUY KE',
  'KHAU HAO LUY KE',
  'HAO MON TAI SAN CO DINH',
  'THEO GIA TRI HOP LY',
  'GIAI DOAN',
  'CHUA PHAN PHOI KY NAY',
  'CHUA PHAN PHOI LUY KE DEN CUOI',
];

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
// mã 411a/411b (TT200): 2 dong chi tiet CO DINH duoi "Von gop cua chu so
// huu" - da xac nhan qua PHS that (2026-07-13): dung tien to chu "a."/"b."
// (dau CHAM) thay vi "a)"/"b)" (dong ngoac, dang NON_SUBTOTAL_DETAIL_PREFIX
// da nhan truoc do) - nhan qua CHINH TEN chi tieu (khong doi giua cac cong
// ty/kieu go dau cau) thay vi tiep tuc doi pho tung bien the dau cau moi.
const KNOWN_ALWAYS_CHILD_CONTENT = [
  'TAI SAN CO DINH HUU HINH',
  'TAI SAN CO DINH THUE TAI CHINH',
  'TAI SAN CO DINH VO HINH',
  'LOI NHUAN SAU THUE CHUA PHAN PHOI',
  'CO PHIEU PHO THONG CO QUYEN BIEU QUYET',
  'CO PHIEU UU DAI',
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

// Ten CHUAN cac muc ma 411-422 (Thong tu 200/2014 Dieu 112, ke ca cac bien
// the TT99/bao cao hop nhat) - dung LAM TIN HIEU NOI DUNG cho fallback duoi
// (thay the HOAN TOAN "arabicDirectChildRows" cu dua vao tien to so A-rap).
const KNOWN_EQUITY_DIRECT_CHILD_CONTENT = [
  'VON GOP CUA CHU SO HUU',
  'THANG DU VON', // khop ca "Thặng dư vốn" (PXA that) lan "Thặng dư vốn cổ phần" (ten day du TT200)
  'QUYEN CHON CHUYEN DOI TRAI PHIEU',
  'VON KHAC CUA CHU SO HUU',
  'CO PHIEU MUA LAI CUA CHINH MINH',
  'CO PHIEU QUY',
  'CHENH LECH DANH GIA LAI TAI SAN',
  'CHENH LECH TY GIA HOI DOAI',
  'QUY DAU TU PHAT TRIEN', // khop luon bien the gop "Quỹ đầu tư phát triển và dự phòng tài chính" (BVH that, .includes())
  'QUY KHAC THUOC VON CHU SO HUU',
  'LOI NHUAN SAU THUE CHUA PHAN PHOI', // trung voi KNOWN_ALWAYS_CHILD_CONTENT - giu ca 2 noi, dung cho 2 muc dich khac nhau
  'LOI NHUAN SAU THUE DA THUC HIEN CHUA PHAN PHOI', // bien the Bao hiem (BVH that 2026-07-13: "đã thực hiện" chen giua, khong con la substring lien tuc cua marker tren)
  'QUY DU TRU BAT BUOC', // Bao hiem, TT232/2012 (BVH: "Quỹ dự trữ bắt buộc hoạt động bảo hiểm", ma 423)
  'NGUON VON DAU TU XDCB',
  'NGUON VON DAU TU XAY DUNG CO BAN',
  'LOI ICH CO DONG KHONG KIEM SOAT', // bao cao hop nhat
];

function isKnownEquityDirectChildLabel(label: string): boolean {
  const normalized = normalizeLabelText(label);
  return KNOWN_EQUITY_DIRECT_CHILD_CONTENT.some((marker) => normalized.includes(marker));
}

// Fallback khi 1 nhom cap-1 (vd "D - Von chu so huu") KHONG co lop "cap 2"
// (theo TEN da biet - xem isKnownBalanceSheetLevel1Label) trung gian nao ca
// giua no va dong tong tiep theo - truong hop nay THUONG GAP voi "Von chu so
// huu": TT200 chinh thuc co 2 nhom con ("I. Von chu so huu"/"II. Nguon kinh
// phi va quy khac"), nhung da so DN KHONG co nhom "Nguon kinh phi" (chi ap
// dung cho don vi hanh chinh su nghiep) nen nhieu bao cao that KHONG in dong
// "I. Von chu so huu" rieng vi no se trung ten Y HET dong cha "D - Von chu so
// huu" ngay tren - xac nhan qua HVA/KSQ that (2026-07-13): cac dong con di
// THANG vao "Von gop cua chu so huu"/"Thang du von"... ngay sau dong nhom,
// khong co dong trung gian nao ca.
//
// SUA 2026-07-13 (theo yeu cau nguoi dung, bo HOAN TOAN tin hieu so thu tu):
// truoc day nhan dien qua tien to so A-rap trong nhan ("1."/"2."...) - da gap
// loi THAT qua doi chieu BOT (corpus 28 bao cao): dong "Vốn góp của chủ sở
// hữu" (ma 411) bi OCR in nham TIEN TO La Ma "I." (thay vi "1." dung), khien
// tien to so A-rap KHONG khop, nhung dong nay VAN duoc tinh (qua nhanh fallback
// khac cua ham cu) trong khi dong em "Lợi nhuận sau thuế chưa phân phối" (ma
// 420, tien to dung "10.") lai bi loai (vi isKnownAlwaysChildLabel luon thang,
// bat ke tien to) - tong tinh duoc THIEU dung gia tri LNST, sai lech. Doi
// HOAN TOAN sang nhan dien qua TEN CHUAN Thong tu 200 (KNOWN_EQUITY_DIRECT_CHILD_CONTENT)
// - khong con phu thuoc OCR co doc dung tien to hay khong, sua dung ca 2 lop
// loi cung luc (dong "I." gia + dong "10." that deu duoc nhan qua ten, khong
// qua tien to).
export function equityDirectChildRows(
  table: StatementTable,
  labelIndex: number,
  startIdx: number,
  endIdx: number
): (string | number | null)[][] {
  const result: (string | number | null)[][] = [];
  for (let i = startIdx + 1; i < endIdx; i++) {
    const row = table.rows[i];
    const label = String(row[labelIndex] ?? '').trim();
    if (!isKnownEquityDirectChildLabel(label)) continue;
    if (isKnownCap4Label(label)) continue;
    result.push(row);
  }
  return result;
}

// Phan biet dong "cap 2" (I, II, III... - dong tong cua 1 nhom) voi dong "cap
// 3" (chi tiet don le duoi 1 nhom) - phan loai HOAN TOAN theo TEN chuan (xem
// KNOWN_BALANCE_SHEET_LEVEL1_CONTENT duoi day), khong con dua vao ma so/STT/
// tien to duoi bat ky hinh thuc nao (2026-07-13, theo yeu cau nguoi dung).

// Ten CHUAN (khong doi giua cac cong ty/thong tu, chi khac vai tu dong nghia
// da liet ke) cua cac nhom "cap 1" (I/II/III...) BEN TRONG TS ngan han/TS dai
// han/No phai tra/Von chu so huu - doc THANG noi dung nhan, dung y kien nguoi dung 2026-07-12 ("đọc tiêu đề
// của từng chỉ tiêu... không dựa vào số thứ tự", ap dung ca cho BCDKT sau khi
// da sua cho KQKD). Gom theo Thong tu 200/2014 (DN thuong), Thong tu 99/2025
// (them "tai san sinh hoc"), va bien the CTCK ("Tai san tai chinh" thay
// "Dau tu tai chinh").
const KNOWN_BALANCE_SHEET_LEVEL1_CONTENT = [
  // "TAI SAN NGAN HAN"/"TAI SAN DAI HAN" (bare, cap-0) - dong vai tro GIONG
  // HET "VON CHU SO HUU"/"NO PHAI TRA" bare o duoi (xem comment
  // isKnownBalanceSheetLevel1Label): can de preferSubtotal (validate-statements.ts)
  // chon DUNG chinh dong cap-0 lam bien "longTermAssetsIdx"/"shortTermAssetsIdx"
  // khi co dong CON khac cung chua substring "TAI SAN NGAN/DAI HAN" (vd PHS
  // that 2026-07-13: "VI. Dự phòng suy giảm giá trị tài sản dài hạn" cung
  // chua "TAI SAN DAI HAN" nhu 1 phan cau, neu khong co marker bare nay,
  // preferSubtotal se chon NHAM dong "VI." lam bien nhom, khien toan bo TS
  // ngan han bi tinh nham gom ca phan TS dai han vao pham vi cua no).
  'TAI SAN NGAN HAN',
  'TAI SAN DAI HAN',
  // Duoi TS ngan han
  'TIEN VA CAC KHOAN TUONG DUONG TIEN',
  'DAU TU TAI CHINH NGAN HAN',
  'CAC KHOAN DAU TU TAI CHINH NGAN HAN', // bien the co "Cac khoan" - da xac nhan qua doi chieu that
  'TAI SAN TAI CHINH', // CTCK (vd SHS "I. Tài sản tài chính")
  'CAC KHOAN PHAI THU NGAN HAN',
  'HANG TON KHO',
  'TAI SAN TAI BAO HIEM', // Bao hiem, TT232/2012 (vd PRE "Tài sản tái bảo hiểm", xac nhan 2026-07-13)
  'TAI SAN NGAN HAN KHAC',
  // Duoi TS dai han
  'CAC KHOAN PHAI THU DAI HAN',
  'TAI SAN CO DINH',
  'BAT DONG SAN DAU TU',
  'TAI SAN DO DANG DAI HAN', // "Chi phí xây dựng cơ bản dở dang" (CTCK) canonical hoa ve day - xem GROUP_LABEL_SYNONYM_CANONICAL
  'DAU TU TAI CHINH DAI HAN',
  'CAC KHOAN DAU TU TAI CHINH DAI HAN', // bien the co "Cac khoan" - da xac nhan qua DIC that
  'TAI SAN TAI CHINH DAI HAN', // CTCK (vd MBS "I. Tài sản tài chính dài hạn" - bien the ten khac "Dau tu tai chinh dai han")
  'DU PHONG SUY GIAM GIA TRI TAI SAN DAI HAN', // CTCK (vd PHS "VI. Dự phòng suy giảm giá trị tài sản dài hạn")
  'TAI SAN DAI HAN KHAC',
  'TAI SAN SINH HOC DAI HAN', // Thong tu 99/2025
  // Duoi No phai tra
  'NO NGAN HAN',
  'NO PHAI TRA NGAN HAN',
  'NO DAI HAN',
  'NO PHAI TRA DAI HAN',
  // "NO PHAI TRA" (bare, khong "ngan/dai han") - CUNG dong vai tro dong CAP-0
  // "C. NỢ PHẢI TRẢ" nhu "VON CHU SO HUU" dong vai tro dong "D." o duoi (xem
  // comment isKnownBalanceSheetLevel1Label ve co che preferSubtotal): da xac
  // nhan qua MBS that (2026-07-13, sau khi bo fallback so thu tu) - dong "C."
  // "NỢ PHẢI TRẢ (300 = 310+340)" VA dong con "I. Nợ phải trả ngắn hạn" deu
  // chua substring "NO PHAI TRA" trong tim kiem tho (validate-statements.ts),
  // preferSubtotal can khop CHINH TEN dong cap-0 truoc de chon dung no (thay
  // vi nham chon dong con dau tien tim thay).
  'NO PHAI TRA',
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
// BAT BUOC it nhat 1 dau phan cach ([.\/)-]+ - khong con la * tuy chon) ngay
// sau STT - da phat hien qua PHS that (2026-07-13): "Cộng doanh thu hoạt
// động" bat dau bang "C" (VUA la chu hoa VUA la ky tu La Ma hop le trong
// [IVXLCDM]), khi [.\/)-]* cho phep KHONG can dau phan cach thi bi cat NHAM
// mat chu "C" dau (tuong la STT "C." roi tu coi la khong co dau cham), lam
// "CONG DOANH THU HOAT DONG..." bi cat con "ONG DOANH THU HOAT DONG...",
// hong toan bo so khop CHINH XAC (rot xuong tang substring, khop NHAM voi
// "Cộng doanh thu hoạt động TÀI CHÍNH" o dong khac). Yeu cau BAT BUOC co dau
// cham/gach cheo/ngoac dong ngay sau se KHONG con cat nham tu thuong (vd
// "Chi phí"/"Cộng...") bat dau bang mot chu cai La Ma hop le nhung KHONG co
// dau phan cach theo sau.
//
// THEM "-" (VA khoang trang TRUOC dau phan cach) vao tap dau phan cach
// (2026-07-13, phat hien qua PXA/BOT that khi bo fallback "mac dinh true" o
// isLikelySubtotalRow): cap-0 header dung dang "A - TÀI SẢN NGẮN HẠN"/"D -
// VỐN CHỦ SỞ HỮU" (CO KHOANG TRANG truoc gach ngang, khong phai cham dinh
// lien) truoc day VAN duoc nhan la "dong tong" nho fallback cu (bat ky nhan
// nao khong bat dau bang so A-rap deu mac dinh true), nhung sau khi bo
// fallback do (chi con dua vao khop TEN qua normalizeGroupLabelForContentMatch),
// "D - VỐN CHỦ SỞ HỮU" khong bi cat tien to (pattern cu doi hoi dau phan cach
// NGAY SAU ky tu, khong cho phep khoang trang o giua) nen KHONG con khop
// EXACT voi marker "VON CHU SO HUU" nua - lam preferSubtotal o
// validateBalanceSheetSubtotals/findAllGroupSumMismatches (lib/export/
// validate-statements.ts) chon NHAM dong con "I. Vốn chủ sở hữu" (co the cat
// tien to dung, "I.") thay vi chinh dong cap-0 "D -..." khi ca 2 cung khop
// substring "VON CHU SO HUU". Them \s* TRUOC nhom dau phan cach (van BAT
// BUOC phai co it nhat 1 ky tu trong [.\/)-] o dau do, chi cho phep khoang
// trang XEN GIUA chu cai va dau do) - khong lam yeu di dieu kien chan
// "Cộng..."/"Chi phí..." (PHS that) vi ky tu NGAY SAU "C" trong "Cộng" la 1
// chu cai khac ("ộng"), khong phai khoang trang lien tiep roi den dau phan
// cach.
const LEADING_GROUP_MARKER_PREFIX = /^([IVXLCDM]+|[A-Z]|\d+)\s*[.\/)-]+\s*/;

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

// Mot so ten chi tieu la BUT DANH khac nhau cho CUNG 1 khai niem ke toan, tuy
// mau bieu/loai hinh - vd "Chi phí xây dựng cơ bản dở dang" LA CHINH dong
// cap-1 trong mau CTCK/TT210 (PHS/VCK "III./IV. Chi phí xây dựng cơ bản dở
// dang", KHONG co dong "Tài sản dở dang dài hạn" trung gian nao khac), NHUNG
// LA dong con cap-2 duoi "V. Tài sản dở dang dài hạn" trong mau DN-thuong/
// TT200 (IDV "2. Chi phí xây dựng cơ bản dở dang", mã 252, nam DUOI "V. Tài
// sản dở dang dài hạn" mã 250) - da xac nhan qua doi chieu that IDV
// (2026-07-13): neu coi CA HAI la marker cap-1 DOC LAP, dong con IDV bi dem
// THEM 1 lan nua cung voi chinh dong cha cua no, cong TRUNG dung bang gia tri
// cua no. Anh xa VE CHUNG 1 dang CANONICAL truoc khi so khop/so sanh trung
// lap - de isDuplicateKnownBalanceSheetLevel1Row (dong xuat hien DAU TIEN
// trong pham vi la header that, cac lan sau la dong con) tu dong xu ly dung
// ca 2 truong hop (CTCK: chi 1 lan xuat hien, duoc tinh; DN-thuong: lan thu 2
// trung ten canonical voi dong cha "Tài sản dở dang dài hạn" o TRUOC no, bi
// loai nhu 1 dong con) - khong can logic rieng cho tung mau bieu.
const GROUP_LABEL_SYNONYM_CANONICAL: Record<string, string> = {
  'CHI PHI XAY DUNG CO BAN DO DANG': 'TAI SAN DO DANG DAI HAN',
};

function normalizeGroupLabelForContentMatch(label: string): string {
  const normalized = normalizeLabelText(label).replace(LEADING_GROUP_MARKER_PREFIX, '').replace(TRAILING_FORMULA_SUFFIX, '').trim();
  return GROUP_LABEL_SYNONYM_CANONICAL[normalized] ?? normalized;
}

function isKnownBalanceSheetLevel1Label(label: string): boolean {
  // Mot ten CHUAN (vd "Tien va cac khoan tuong duong tien") co the la dong
  // tong CAP 1 THAT trong dinh dang DN-thuong/TT200, nhung lai la dong CON
  // cua 1 container (vd "Tài sản tài chính" trong dinh dang CTCK/TT210) hoac
  // lap lai Y HET ten nhom cha (vd "Hàng tồn kho") o dinh dang khac - da xac
  // nhan qua PHS/IDV that (2026-07-12). TRUOC DAY dung tien to so A-rap
  // ("1."/"7."...) de loai truong hop nay ngay tai day - theo yeu cau nguoi
  // dung (2026-07-13, bo HOAN TOAN tin hieu so thu tu), viec phan biet "dong
  // tong that" voi "dong con trung ten" chuyen HOAN TOAN sang 2 co che NOI
  // DUNG+VI TRI da co san, khong lien quan gi den so thu tu: dong LAP LAI
  // trong CUNG 1 pham vi bi loai qua `isDuplicateKnownBalanceSheetLevel1Row`
  // (uu tien lan xuat hien DAU TIEN), dong nam BEN TRONG 1 container da biet
  // (vd "Tài sản tài chính") bi loai qua `isInsideKnownContainer` - ca 2 deu
  // da duoc goi o childrenBetween (lib/export/validate-statements.ts) SAU buoc
  // nay, nen ham nay chi can khop TEN, khong can tu loai truoc theo tien to.
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
// Khong dua vao tien to so A-rap cua dong con de nhan dien (xem comment
// isKnownBalanceSheetLevel1Label - da bo tin hieu nay 2026-07-13) - mot so
// bao cao (HCM that) ghi nhan SACH, KHONG co tien to nao ca (ma so nam o cot
// rieng), nen day PHAI la co che DUY NHAT (khong phai fallback) de tranh
// "Tien va cac khoan tuong duong tien" (con cua "Tai san tai chinh") bi dem
// THEM 1 lan nua nhu the no la 1 muc cap-1 doc lap, cong du vao tong TS ngan
// han. Giai phap: SAU KHI gap 1 dong khop marker CONTAINER trong pham vi, MOI
// dong tiep theo (du co khop marker KHAC, KHONG giong het container) deu bi
// coi la con cua container do (loai khoi ket qua) CHO DEN KHI het pham vi -
// vi CTCK chi co DUY NHAT 1 container nhu vay truoc "Tai san ngan han khac".
//
// "TAI SAN TAI CHINH DAI HAN" (them 2026-07-13, xac nhan qua VCK that) la
// CONTAINER TUONG TU o phia TS dai han: dong con "Cac khoan phai thu dai
// han" (mã 211, con cua "I. Tài sản tài chính dài hạn" mã 210 trong CTCK)
// TRUNG TEN EXACT voi marker cap-1 "CAC KHOAN PHAI THU DAI HAN" (dong cap-1
// DOC LAP trong DN-thuong) - neu khong loai qua container, dong con nay bi
// dem THEM 1 lan cung voi chinh gia tri da gop san trong dong "I." cha no.
const CONTAINER_LEVEL1_MARKERS = ['TAI SAN TAI CHINH', 'TAI SAN TAI CHINH DAI HAN'];

// Container CHI "mo" toi khi gap 1 trong cac marker nay (luon la muc NGANG
// HANG that su voi container theo dung cau truc TT210, KHONG bao gio la con
// cua no) - da phat hien qua HCM that (2026-07-13): fix ban dau (container
// "nuot" toan bo pham vi con lai) VO TINH nuot LUON "Tai san ngan han khac"
// (mot muc cap-1 THAT SU, dung SAU container, khong phai con cua no), lam
// tong tinh duoc THIEU dung bang gia tri cua no. "TAI SAN CO DINH" them
// 2026-07-13 (xac nhan qua VCK/PHS/MBS that): trong CA 3 bao cao CTCK that,
// "II. Tài sản cố định" LUON la dong NGAY SAU container "Tài sản tài chính
// dài hạn" (khac voi phia ngan han, container dai han KHONG dung ngay truoc
// "Tai san dai han khac" - co 1-2 nhom doc lap khac [Tai san co dinh, co the
// them Bat dong san dau tu/Tai san do dang dai han] xen giua) - can dong nay
// lam diem dong rieng cho container dai han, tranh no "nuot" luon ca "Tai san
// co dinh" (mot nhom hoan toan doc lap, khong phai con cua container).
const CONTAINER_CLOSING_MARKERS = ['TAI SAN NGAN HAN KHAC', 'TAI SAN DAI HAN KHAC', 'TAI SAN CO DINH'];

function isKnownContainerLabel(label: string): boolean {
  const normalized = normalizeGroupLabelForContentMatch(label);
  return CONTAINER_LEVEL1_MARKERS.includes(normalized);
}
function isKnownContainerClosingLabel(label: string): boolean {
  const normalized = normalizeGroupLabelForContentMatch(label);
  return CONTAINER_CLOSING_MARKERS.includes(normalized);
}

// Ten CHUAN (Thong tu 210/2014/TT-BTC + sua doi 334/2016, mau B01-CTCK) cua
// CAC MUC CON TRUC TIEP cua 2 container o tren - dung de SIET lai pham vi
// "thanh vien" khi cong tong kiem tra cheo mot container (xem
// findBalanceSheetLevel2Mismatches). LY DO RIENG cho container (khac cac
// nhom binh thuong khac, KHONG ap dung whitelist nay): container la noi
// CTCK hay TU CHIA NHO 1 muc con thanh nhieu ma so thap phan RIENG cua ho
// (vd "6." Cac khoan phai thu -> "6.1"/"6.2"/"6.2.1"/"6.2.2" - xem doi chieu
// that VND/BVS 2026-07-14 duoi day), va CAC DONG TU CHIA NHO DO khong phai 1
// chi tieu Thong tu doc lap - chi la CHI TIET BO SUNG cua chinh dong cha
// ngay truoc no, cong THEM se dem 2 lan. Voi cac nhom BINH THUONG (khong
// phai container), van GIU NGUYEN cach lam cu (chap nhan het moi dong giua 2
// moc, tru cap4) vi da 2026-07-13 nguoi dung yeu cau bo tin hieu so thu tu
// KHOI CA nhanh retry nay - whitelist nay KHONG dung numbering, chi so
// khop CHINH XAC ten chi tieu voi danh sach ten CHUAN theo Thong tu (dung
// tinh than "chi quan tam dong CHINH THUC theo quy dinh ke toan, khong quan
// tam dong cong ty tu chia nho them" - theo dung y nguoi dung 2026-07-14).
// Doi chieu qua CA 2 bao cao that VND (Hop nhat) va BVS (Hop nhat) - gom du
// 2 bien the ten khac nhau cho cung 1 khai niem (vd VND "...lãi/lỗ", BVS
// "...lãi lỗ"; VND "Phải thu các dịch vụ công ty chứng khoán cung cấp", BVS
// viet tat "...CTCK cung cấp") va cac dong CHI CO O 1 trong 2 bao cao (vd
// AFS/Phải thu nội bộ/Phải thu về lỗi giao dịch chỉ co o BVS - CHAP NHAN
// DUOC, dong nao khong khop whitelist bi loai khoi tong, KHONG lam sai gia
// tri HIEN THI cho nguoi dung, toi da van chi la 1 lan retry OCR thua/gan
// nham "khong dang tin cay" cho 1 container it gap hon).
const CONTAINER_CHILDREN_CANONICAL: Record<string, string[]> = {
  'TAI SAN TAI CHINH': [
    'TIEN VA CAC KHOAN TUONG DUONG TIEN',
    'CAC TAI SAN TAI CHINH GHI NHAN THONG QUA LAI/LO (FVTPL)',
    'CAC TAI SAN TAI CHINH GHI NHAN THONG QUA LAI LO (FVTPL)',
    'CAC KHOAN DAU TU NAM GIU DEN NGAY DAO HAN (HTM)',
    'CAC KHOAN CHO VAY',
    'CAC TAI SAN TAI CHINH SAN SANG DE BAN (AFS)',
    'DU PHONG SUY GIAM GIA TRI CAC TAI SAN TAI CHINH VA TAI SAN THE CHAP',
    'CAC KHOAN PHAI THU',
    'TRA TRUOC CHO NGUOI BAN',
    'PHAI THU CAC DICH VU CONG TY CHUNG KHOAN CUNG CAP',
    'PHAI THU CAC DICH VU CTCK CUNG CAP',
    'PHAI THU NOI BO',
    'PHAI THU VE LOI GIAO DICH CHUNG KHOAN',
    'CAC KHOAN PHAI THU KHAC',
    'DU PHONG SUY GIAM GIA TRI CAC KHOAN PHAI THU',
    'DU PHONG SUY GIAM GIA TRI CAC KHOAN PHAI THU (*)',
  ],
  'TAI SAN TAI CHINH DAI HAN': [
    'CAC KHOAN PHAI THU DAI HAN',
    'CAC KHOAN DAU TU DAI HAN',
    'CAC KHOAN DAU TU',
    'DU PHONG SUY GIAM TAI SAN TAI CHINH DAI HAN',
  ],
};

function isKnownContainerChildLabel(containerLabel: string, memberLabel: string): boolean {
  const containerKey = normalizeGroupLabelForContentMatch(containerLabel);
  const whitelist = CONTAINER_CHILDREN_CANONICAL[containerKey];
  if (!whitelist) return true;
  return whitelist.includes(normalizeGroupLabelForContentMatch(memberLabel));
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
// SUA 2026-07-13 (theo yeu cau nguoi dung, bo HOAN TOAN tin hieu so thu tu/
// cot STT/tien to khoi phan loai cap-do): truoc day co ca 1 tang "tin hieu
// CAU TRUC" (cot STT gia tri La Ma, tien to so A-rap trong nhan) dung LAM
// FALLBACK moi khi ten khong khop danh sach da biet - day chinh la nguon goc
// loi lap lai nhieu lan (vd BOT that: dong "Vốn góp của chủ sở hữu" bi OCR in
// nham tien to La Ma "I." thay vi "1.", fallback cau truc tin theo tien to
// SAI nay va tinh nham dong do la dong tong, trong khi dong em "Lợi nhuận sau
// thuế chưa phân phối" bi loai vi khop tin hieu NOI DUNG khac - 2 tang tin
// hieu MAU THUAN nhau tren cung 1 nhom, sai tong). Toan bo cac ham
// `columnHasGroupSttValue`/`findBalanceSheetBodyEndIndex`/
// `hasStructuralSubtotalSignal` va cac hang so `BALANCE_SHEET_BODY_END_MARKERS`/
// `GROUP_STT_PATTERN` DA BI XOA - `hasReliableSubtotalSignal`/`isLikelySubtotalRow`
// gio CHI con 1 tang tin hieu DUY NHAT: TEN chi tieu co khop danh sach chuan
// (Thong tu) hay khong. Neu can xem lai code cu, tim cac ten ham/hang so tren
// trong lich su git truoc commit sua doi nay.
export function hasReliableSubtotalSignal(table: StatementTable, labelIndex: number): boolean {
  return table.rows.some((r) => isKnownBalanceSheetLevel1Label(String(r[labelIndex] ?? '').trim()));
}

export function isLikelySubtotalRow(table: StatementTable, row: (string | number | null)[], labelIndex: number): boolean {
  const label = String(row[labelIndex] ?? '').trim();
  // Ten nhom "cap 1" (Tien, Hang ton kho, No ngan han...) la thuat ngu CHUAN
  // (Thong tu ke toan) khong doi giua cac cong ty - day la TIN HIEU DUY NHAT
  // duoc dung (khong con fallback qua STT/tien to/vi tri). Moi dong KHONG
  // khop mot ten chuan nao mac dinh la KHONG PHAI dong tong (an toan hon:
  // khong bao gio doan bua, chi tra ve "khong du tin hieu" o lop goi ben
  // ngoai neu dieu nay khien khong tim thay du muc con - xem hasReliableSubtotalSignal).
  return isKnownBalanceSheetLevel1Label(label);
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
// So sanh "gan bang nhau" cho phep sai so nho (lam tron/OCR) - cung nguong
// dung o findAllGroupSumMismatches duoi day.
function numbersWithinTolerance(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(GROUP_SUM_TOLERANCE_ABSOLUTE, Math.abs(b) * GROUP_SUM_TOLERANCE_RATIO);
}

// SUA 2026-07-14 (theo yeu cau nguoi dung, tong quat hoa tu 1 fix rieng cho
// bank "Tien Gui & Cho Vay TCTD Khac" cua BID): AP DUNG CHO MOI truong hop 1
// marker/ten khop NHIEU HON 1 dong trong bang (khong chi rieng 1 metric) - vi
// du KINH DIEN: 1 khai niem duoc bao cao GOP CHUNG thanh 1 dong o cong ty nay
// nhung TACH RIENG thanh nhieu dong thanh phan (+ co the them dong dieu chinh
// nhu du phong) o cong ty khac, khien CUNG 1 bo marker khop CA dong tong LAN
// cac dong thanh phan cua no. Thay vi doan dong nao la "tong" qua tu ngu/vi
// tri (de vo lai moi khi gap 1 cach dat ten moi), XAC MINH BANG PHEP CONG: o
// TAT CA cot gia tri cung luc, neu 1 trong cac dong khop CHINH LA tong cac
// dong khop CON LAI (trong sai so nho), dong do CHINH LA dong tong - dung no
// TRUC TIEP (chinh xac hon tu cong lai, vi dong tong bao cao san co the da
// gom cac khoan dieu chinh ma neu tu cong thu cong se bo sot). Doi hoi khop O
// TAT CA cot gia tri (khong chi 1 cot) VA khong duoc la truong hop ca 2 ben
// deu = 0 (tranh khop "gia" khi du lieu don gian con trong/chua phat sinh).
// Xuat rieng (khong chi dung noi bo o findRowByLabel) - danh cho cac finder
// can gom ung vien qua 1 dieu kien RONG hon "1 marker AND-toan bo trong 1
// dong" (vd findTienGuiChoVayTctdKhac o lib/analysis.ts, gom ung vien qua
// dieu kien OR cau truc) nhung van muon dung CHUNG 1 logic xac minh "dong nao
// la tong" thay vi viet lai.
export function findArithmeticTotalRow(
  table: StatementTable,
  matches: (string | number | null)[][]
): (string | number | null)[] | null {
  if (matches.length < 2) return null;
  const cols = valueColumnIndexes(table);
  if (cols.length === 0) return null;
  return (
    matches.find((candidate) => {
      let sawNonZero = false;
      const isTotal = cols.every((col) => {
        const value = candidate[col];
        if (typeof value !== 'number') return false;
        const othersSum = matches.reduce((sum, row) => {
          if (row === candidate) return sum;
          const v = row[col];
          return typeof v === 'number' ? sum + v : sum;
        }, 0);
        if (value !== 0 || othersSum !== 0) sawNonZero = true;
        return numbersWithinTolerance(value, othersSum);
      });
      return isTotal && sawNonZero;
    }) ?? null
  );
}

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
  const arithmeticTotal = findArithmeticTotalRow(table, matches);
  if (arithmeticTotal) return arithmeticTotal;
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
  const valueColIndexes = valueColumnIndexes(table);
  const mismatches: GroupSumMismatch[] = [];
  let groupStart = 0;

  for (let i = 0; i < table.rows.length; i++) {
    const row = table.rows[i];
    const label = String(row[labelIndex] ?? '').trim();
    if (!label || !GROUP_SUBTOTAL_LABEL_PREFIX.test(normalizeLabelText(label))) continue;

    const memberRowIndexes: number[] = [];
    for (let j = groupStart; j < i; j++) {
      const memberLabel = String(table.rows[j][labelIndex] ?? '').trim();
      // Doc NOI DUNG nhan TRUOC (dang tin cay hon, xem comment o tren) - chi
      // fallback ve tin hieu cau truc (isLikelySubtotalRow) neu ten khong
      // khop bat ky mau CHUAN nao da biet.
      if (isKnownIncomeStatementSubtotalLabel(memberLabel) || isLikelySubtotalRow(table, table.rows[j], labelIndex)) continue;
      // Muc con CAP 4 (noi dung chuan "Nguyen gia"/"Gia tri hao mon luy ke"...)
      // - da GOP SAN vao gia tri dong cha cap 3 ngay truoc no, cong THEM o day
      // se dem 2 lan (xem isKnownCap4Label). 2026-07-13: bo tin hieu tien to
      // dau cau ("-"/"*"/"a)") VA tin hieu ma-so-co-dau-cham (theo yeu cau
      // nguoi dung, khong con dua vao so thu tu duoi bat ky hinh thuc nao) -
      // dong chi tiet khong khop ten chuan nao gio se tu dong bi loai vi
      // isLikelySubtotalRow/isKnownIncomeStatementSubtotalLabel o tren deu
      // false cho no, khong can kiem tra rieng dinh dang ma so nua.
      if (isKnownCap4Label(memberLabel)) continue;
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

// "Lai" (lai) va "Lo" (lo) chi cach nhau 1-2 ky tu edit-distance nhung mang Y
// NGHIA DOI NHAU HOAN TOAN (lai = lai, lo = lo) - tren 1 marker/nhan dai (~40+
// ky tu), chenh lech nay van lot qua nguong tuong dong 92% cua fuzzyIncludes,
// khien 1 marker "Lo tu..." khop NHAM voi dong "Lai tu..." hoan toan doi
// nghia - da xac nhan qua VND that (2026-07-14): marker rong "Lo tu cac
// khoan dau tu nam giu den ngay dao han" (HTM, dong nay VND khong co) fuzzy-
// khop nham dong doanh thu "Lai tu cac khoan dau tu nam giu den ngay dao han"
// (dong hoan toan khac, thuoc muc DOANH THU chu khong phai CHI PHI), cong
// nham hang trăm ty vao "Cong chi phi hoat dong". Chan rieng tang fuzzy (tang
// exact/substring von da an toan vi "LO" khong phai substring cua "LAI") -
// neu ca marker va dong deu bat dau bang 1 trong 2 tu doi nghia nay VA khac
// nhau, coi la KHONG khop du diem tuong dong cao the nao.
// LUU Y: dau phan cach [.\/)-] sau nhom so/so La Ma la BAT BUOC (+, khong
// phai *) - neu de tuy chon, chu "L" dau cua chinh tu "LO" (Lo = mang nghia
// KHAC "L" = so La Ma 50) se bi hieu NHAM la tien to so thu tu don le va bi
// cat mat, lam "LO CAC KHOAN..." con lai "O CAC KHOAN..." - khong con nhan
// dung la tu "LO" nua (da xac nhan qua VND that 2026-07-14).
// Nhom lap (+) o ngoai de boc het NHIEU TANG so thu tu lien tiep (vd "1.1."
// BVS: 2 tang "1." roi "1." nua) - 1 lan strip DON le se chi bo tang dau,
// con lai "1. LAI TU..." van bat dau bang chu so nen khong nhan ra duoc tu
// "LAI"/"LO" phia sau (da xac nhan qua BVS that 2026-07-14, nhan da qua 2
// tang danh so "1.1."/"2.1.").
const LEADING_NUMBERING_FOR_SIGN_WORD = /^(?:[\dIVXLCDM]+\s*[.\/)-]+\s*)+/;
function leadingSignWord(normalizedText: string): 'LAI' | 'LO' | null {
  const stripped = normalizedText.replace(LEADING_NUMBERING_FOR_SIGN_WORD, '');
  if (/^LAI\b/.test(stripped)) return 'LAI';
  if (/^LO\b/.test(stripped)) return 'LO';
  return null;
}
function hasOppositeSignWordConflict(rowNorm: string, marker: string): boolean {
  const rowSign = leadingSignWord(rowNorm);
  const markerSign = leadingSignWord(marker);
  return rowSign !== null && markerSign !== null && rowSign !== markerSign;
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
  // Guard "Lai"/"Lo" doi nghia ap dung CA tang substring, khong chi fuzzy -
  // da xac nhan qua BVS that (2026-07-14): dong doanh thu "Lai tu...ghi nhan
  // thong qua lai/lo (FVTPL)" va dong chi phi "Lo cac...ghi nhan thong qua
  // lai lo (FVTPL)" CUNG chua chung cum mo ta "ghi nhan thong qua lai (lo)" -
  // marker chi khop cum do (khong phai tien to Lai/Lo) se khop CA 2 dong, va
  // "khop cuoi cung" chon nham dong SAU (chi phi) thay vi dong dung (doanh
  // thu). Tang exact KHONG can guard (da doi hoi khop tuyet doi toan bo nhan,
  // Lai/Lo khac nhau la khac nhan ngay).
  const substringIdx = lastMatchingRowIndex(
    table.rows,
    labelIndex,
    (norm) => markers.some((m) => !hasOppositeSignWordConflict(norm, m) && norm.includes(m)),
    hasValidCode
  );
  if (substringIdx !== -1) return substringIdx;
  return lastMatchingRowIndex(
    table.rows,
    labelIndex,
    (norm) => markers.some((m) => !hasOppositeSignWordConflict(norm, m) && fuzzyIncludes(norm, m)),
    hasValidCode
  );
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
// `magnitude: true` = dong CHI PHI THUAN TUY (Gia von hang ban, Chi phi ban
// hang, Chi phi quan ly doanh nghiep, Chi phi tai chinh...) - noi dau am/duong
// in tren bao cao CHI la quy uoc HIEN THI cua tung cong ty, khong mang y
// nghia lai/lo (xem comment o evaluateNamedFormulas). KHONG dung cho cac dong
// "Lai/(Lo)..." (dau am o do la thong tin that ve khoan LO).
interface FormulaTerm { markers: string[]; sign: 1 | -1; optional?: boolean; magnitude?: boolean; }
interface FormulaDef { groupLabel: string; target: string[]; terms: FormulaTerm[]; }

function req(markers: string[], sign: 1 | -1 = 1): FormulaTerm {
  return { markers, sign };
}
function opt(markers: string[], sign: 1 | -1 = 1): FormulaTerm {
  return { markers, sign, optional: true };
}
// Dong CHI PHI THUAN TUY (khong bao gio la khoan lai/gain) - xem comment
// "magnitude" o tren.
function reqExpense(markers: string[], sign: 1 | -1 = -1): FormulaTerm {
  return { markers, sign, magnitude: true };
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
    // 2 term khac nhau (vd "chi phi du phong" va "chi phi di vay cua cac
    // khoan cho vay") co the cung khop vao 1 dong VAT LY DUY NHAT khi cong ty
    // gop chung nhieu khai niem vao 1 dong (VND that 2026-07-14: mã 24 la 1
    // dong DUY NHAT "Chi phi du phong tai san tai chinh...VA chi phi di vay
    // cua cac khoan cho vay", khop CA 2 marker roi). Neu khong khu trung, dong
    // do bi cong 2 LAN vao tong - loai cac lan khop TRUNG dong (idx) sau lan
    // dau tien, giu nguyen dau (sign) cua lan dau.
    const seenRowIndexes = new Set<number>();
    const usableTerms = termLookup.filter(({ idx }) => {
      if (idx === -1 || idx === targetIdx) return false;
      if (seenRowIndexes.has(idx)) return false;
      seenRowIndexes.add(idx);
      return true;
    });

    for (const col of valueCols) {
      let sum = 0;
      let ok = true;
      const memberRowIndexes: number[] = [];
      for (const { t, idx } of usableTerms) {
        const v = formulaCellValue(table.rows[idx][col]);
        if (v === null) { ok = false; break; }
        // "magnitude": true (xem reqExpense duoi) - CHI danh cho cac dong CHI
        // PHI THUAN TUY (Gia von hang ban, Chi phi ban hang...) - noi dau (+/-)
        // in tren bao cao CHI la quy uoc HIEN THI rieng cua tung cong ty (xac
        // nhan qua ACG that 2026-07-14: "Gia von hang ban" in AM
        // -789.337.103.242), khong mang y nghia lai/lo - lay Math.abs() truoc
        // khi nhan t.sign de CONG THUC luon TRU dung, bat ke cong ty in am hay
        // duong. KHONG ap dung cho cac dong "Lai/(Lo)..." (vd "Lai/Lo tu mua
        // ban CK kinh doanh") - o do dau am la THONG TIN THAT (dang LO, khong
        // phai quy uoc hien thi), Math.abs se xoa mat thong tin lai/lo that -
        // da gap regression that BID/VND/BVS khi tung ap dung Math.abs vo dieu
        // kien cho MOI term (2026-07-14), phai gioi han lai chi cho tap term
        // co danh dau "magnitude".
        sum += (t.magnitude ? Math.abs(v) : v) * t.sign;
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
// CAC dong "Chi phi..."/"Cac khoan giam tru..." trong danh sach cong thuc
// duoi day dung reqExpense (khong phai req thuong) - xac nhan qua ACG that
// (2026-07-14): DN thuong co the in cac dong nay AM (ACG: "Gia von hang ban"
// -789.337.103.242) hoac DUONG (cong ty khac) tuy quy uoc rieng, khac han
// BANK_INCOME_FORMULAS/CTCK_INCOME_FORMULAS o duoi (da viet tu truoc, GIA DINH
// dong chi phi LUON am san nen dung req thuong sign=+1 - KHONG doi 2 danh sach
// do, chi doi rieng DN_THUONG_INCOME_FORMULAS vi day la noi phat hien loi that).
const DN_THUONG_INCOME_FORMULAS: FormulaDef[] = [
  { groupLabel: 'Doanh thu thuan', target: ['DOANH THU THUAN VE BAN HANG VA CUNG CAP DICH VU', 'DOANH THU THUAN'], terms: [req(['DOANH THU BAN HANG VA CUNG CAP DICH VU']), reqExpense(['CAC KHOAN GIAM TRU DOANH THU'])] },
  { groupLabel: 'Loi nhuan gop', target: ['LOI NHUAN GOP VE BAN HANG VA CUNG CAP DICH VU', 'LOI NHUAN GOP'], terms: [req(['DOANH THU THUAN VE BAN HANG VA CUNG CAP DICH VU', 'DOANH THU THUAN']), reqExpense(['GIA VON HANG BAN'])] },
  {
    groupLabel: 'Loi nhuan thuan tu hoat dong kinh doanh',
    target: ['LOI NHUAN THUAN TU HOAT DONG KINH DOANH'],
    terms: [
      req(['LOI NHUAN GOP VE BAN HANG VA CUNG CAP DICH VU', 'LOI NHUAN GOP']),
      opt(['BAN, THANH LY BAT DONG SAN DAU TU']),
      req(['DOANH THU HOAT DONG TAI CHINH']),
      reqExpense(['CHI PHI TAI CHINH', 'CHI PHI HOAT DONG TAI CHINH']),
      opt(['CONG TY LIEN DOANH, LIEN KET']),
      reqExpense(['CHI PHI BAN HANG']),
      reqExpense(['CHI PHI QUAN LY DOANH NGHIEP']), // fuzzy match xu ly bien the chinh ta (vd "quan li")
    ],
  },
  { groupLabel: 'Loi nhuan khac', target: ['LOI NHUAN KHAC'], terms: [req(['THU NHAP KHAC']), reqExpense(['CHI PHI KHAC'])] },
  { groupLabel: 'Tong loi nhuan ke toan truoc thue', target: ['TONG LOI NHUAN KE TOAN TRUOC THUE'], terms: [req(['LOI NHUAN THUAN TU HOAT DONG KINH DOANH']), req(['LOI NHUAN KHAC'])] },
  // KHONG dung marker "LOI NHUAN SAU THUE" tran lan (khong hau to) lam target
  // - da phat hien qua DIC that (2026-07-13): bao cao co CA 3 dong "Loi nhuan
  // sau thue TNDN"/"...cua cong ty me"/"...cua co dong khong kiem soat" -
  // marker qua rong se khop NHAM qua tang substring vao dong "...cua co dong
  // khong kiem soat" (dong CUOI cung trong bang, = 0 vi DIC khong co co dong
  // thieu so), khong phai dong TONG that su. Can markers CU THE, du de tang
  // "chinh xac" (sau khi bo hau to cong thuc) tim dung dong TRUOC KHI roi vao
  // tang substring mo hon.
  { groupLabel: 'Loi nhuan sau thue thu nhap doanh nghiep', target: ['LOI NHUAN SAU THUE THU NHAP DOANH NGHIEP', 'LOI NHUAN SAU THUE TNDN'], terms: [req(['TONG LOI NHUAN KE TOAN TRUOC THUE']), reqExpense(['CHI PHI THUE THU NHAP DOANH NGHIEP HIEN HANH']), reqExpense(['CHI PHI THUE THU NHAP DOANH NGHIEP HOAN LAI'])] },
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
      // BVS that (2026-07-14): marker CU "LAI TU CAC TAI SAN TAI CHINH" chi la
      // TIEN TO CHUNG cua CA dong FVTPL ("...ghi nhan thong qua lai/lo (FVTPL)")
      // LAN dong AFS rieng biet ("...san sang de ban (AFS)") - "khop cuoi cung"
      // (uu tien dong xuat hien SAU trong bang) chon NHAM dong AFS thay vi dong
      // FVTPL that, lam dong FVTPL (gia tri lon nhat trong nhom) bi LOAI HOAN
      // TOAN khoi tong. Doan 2 nay ("ghi nhan...thong qua lai") con LAP LAI y
      // het o CA dong CHI PHI FVTPL doi ung ("Lo cac tai san...ghi nhan thong
      // qua lai lo (FVTPL)") - phai giu nguyen chu "LAI TU" (dung TEN CHI TIEU
      // that, giong cach dong CHI PHI FVTPL da giu "LO TU") lam mo neo dau, chu
      // khong chi dua vao doan mo ta chung o giua cau.
      opt(['LAI TU CAC TAI SAN TAI CHINH GHI NHAN THEO GIA TRI HOP LY THONG QUA LAI', 'LAI TU CAC TAI SAN TAI CHINH GHI NHAN THONG QUA LAI']),
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
      opt(['CHI PHI CAC DICH VU KHAC', 'CHI PHI HOAT DONG KHAC']), // VND that 2026-07-14: cung dong "muc 32" nhung dat ten "Chi phi hoat dong khac" thay vi "Chi phi cac dich vu khac" (BVS/PHS)
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

// GHI CHU 2026-07-13 (theo yeu cau nguoi dung, bo HOAN TOAN tin hieu so thu
// tu): ham `findDecimalCodeGroupMismatches` (kiem tra "cac dong con co ma so
// dang thap phan X.Y co tong khop voi dong cha ma so X hay khong") DA BI XOA
// khoi day, cung cac ham chi phuc vu no (`decimalChildSign`,
// `isNeverDecimalChildLabel`, hang so `DECIMAL_CHILD_CODE_PATTERN`/
// `NEVER_DECIMAL_CHILD_CONTENT`). Ham nay da bi rut khoi nhanh canh bao HIEN
// THI tu phien truoc (2026-07-13 som hon, xem comment o
// lib/export/validate-statements.ts), nhung van con duoc goi trong
// findAllGroupSumMismatches (statement-shared.ts, duoi) cho co che retry OCR/
// gan co "khong dang tin cay" - gio rut NOT khoi CA nhanh do, vi toan bo tien
// de cua ham la CAU TRUC MA SO THAP PHAN tu phat cua tung cong ty, khong co
// ten chuan (Thong tu) nao de thay the: day dung nguyen tac da chot voi nguoi
// dung cho truong hop khong the phan loai duoc: "nếu cty tự lập ra không theo
// chuẩn kế toán thì tức là ở mức độ chi tiết sâu, mày cross-check làm gì?" -
// RUT hoan toan thay vi tiep tuc tim tin hieu so thu tu tinh vi hon. Neu can
// xem lai code cu, tim "findDecimalCodeGroupMismatches" trong lich su git
// truoc commit sua doi nay.

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
    // SUA 2026-07-14 (bao cao nguoi dung, xac nhan qua VND/BVS that): dong CON
    // cua 1 "container" (vd CTCK "I. Tai san tai chinh") nhu "1. Tien va cac
    // khoan tuong duong tien" DUNG TEN CHUAN y het dong cap-1 THAT SU cua DN
    // thuong (noi "I. Tien va cac khoan tuong duong tien" la 1 nhom doc lap,
    // khong nam trong container nao) - isLikelySubtotalRow (chi doc TEN, dung
    // yeu cau nguoi dung, khong con dua vao STT/vi tri) khong phan biet duoc 2
    // ngu canh nay, nham coi dong con CTCK la 1 "level 1" DOC LAP moi, cat sai
    // ranh gioi nhom (vd chia nho container "Tai san tai chinh" thanh nhieu
    // doan sai, cong nham hang chuc dong khong lien quan vao 1 dong con don
    // le), gay mismatch GIA (khong phai loi OCR that) roi bi gan nham "khong
    // dang tin cay". validateBalanceSheetSubtotals (childrenBetween, kiem tra
    // cap0->cap1) da co loai nay qua isInsideKnownContainer - ham nay (kiem
    // tra cap1->cap2) truoc day THIEU cung 1 dieu kien, gio them vao cho dong
    // bo.
    if (isInsideKnownContainer(table, labelIndex, groupStartIdx + 1, i)) continue;
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
      // Muc con CAP 4 (noi dung chuan "Nguyen gia"/"Gia tri hao mon luy
      // ke"/"LNST chua phan phoi ky nay"...) - da GOP SAN vao gia tri dong
      // cha cap 3 ngay truoc no, cong THEM o day se dem 2 lan (xem
      // isKnownCap4Label - mo rong 2026-07-13). 2026-07-13: bo tin hieu tien
      // to dau cau VA tin hieu ma-so-co-dau-cham (theo yeu cau nguoi dung,
      // khong con dua vao so thu tu duoi bat ky hinh thuc nao) - dong khong
      // khop mot ten chuan nao (isLikelySubtotalRow o tren, isKnownCap4Label o
      // duoi) gio tu dong bi loai/giu dung, khong can kiem tra rieng dinh dang
      // ma so nua. DANH DOI CHAP NHAN (ham nay CHI dung cho retry/unreliable-
      // cell, KHONG hien thi truc tiep): neu 1 cong ty tu chia nho 1 dong chi
      // tiet thanh ma so thap phan RIENG cua ho (vd "131.1"/"131.2" duoi
      // "131. Phai thu ngan han cua khach hang", khong theo ten chuan nao),
      // ham nay se cong CA dong cha LAN cac dong con thap phan do (dem 2 lan)
      // - khong con cach nao phan biet ma khong dua vao cau truc ma so (day
      // chinh la ly do findDecimalCodeGroupMismatches - kiem tra rieng cho
      // truong hop nay - bi RUT HOAN TOAN khoi pipeline, xem comment o do).
      // Chap nhan duoc vi ket qua toi da la 1 lan retry OCR thua/1 o bi gan
      // "khong dang tin cay" oan, khong lam sai so lieu HIEN THI cho nguoi dung.
      const memberLabel = String(table.rows[j][labelIndex] ?? '').trim();
      if (isKnownCap4Label(memberLabel)) continue;
      // Container (xem CONTAINER_CHILDREN_CANONICAL o tren): CHI nhan dong con
      // khop dung 1 ten chuan Thong tu, loai dong cong ty tu chia nho them.
      if (!isKnownContainerChildLabel(rawLabel, memberLabel)) continue;
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
