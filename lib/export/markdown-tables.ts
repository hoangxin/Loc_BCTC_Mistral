import { findLabelColumnIndex, normalizeLabelText, type FinancialStatements, type StatementTable } from './statement-shared';

// Parse markdown Mistral OCR tra ve (dang bang "| a | b | c |") thanh
// FinancialStatements - hoan toan LOCAL, KHONG goi AI nao them (khac han cach
// cu qua Qwen vision, model tu tra JSON co san). Da kiem chung qua test that
// (2026-07-05) tren 2 bao cao (HSG, TIX) - 0 loi kiem tra cheo sau khi sua 2
// bug duoc ghi lai trong tung ham duoi day.

// QUAN TRONG: so sanh phai qua normalizeLabelText (bo dau, NFD) chu KHONG
// duoc chi .toUpperCase() tho - da gap that (2026-07-05, smoke test that dau
// tien tren production code): chuoi literal trong source code va chuoi
// Mistral tra ve co the dung 2 dang Unicode khac nhau cho cung 1 ky tu co dau
// (dung san/precomposed vs to hop/decomposed), nhin GIONG HET nhau khi hien
// thi nhung .includes() so sanh byte-for-byte se KHONG khop - lam mat trang
// "KET QUA HOAT DONG KINH DOANH" va "LUU CHUYEN TIEN TE" hoan toan (0 dong ca
// 2 bang, moi thu don het vao cashFlow). Day la loi da duoc ghi nhan nhieu
// lan truoc do trong project goc (Loc_BCTC) o cac cho khac - lap lai y het o
// day vi markdown-tables.ts la file moi, chua ap dung bai hoc do.
// incomeStatement can 2 bien the tieu de (da gap that 2026-07-06, OCR toan
// van BCTC SJ1: tieu de that su la "BÁO CÁO KẾT QUẢ KINH DOANH", KHONG co
// "HOAT DONG" - truoc day chi co 1 bien the nen bo sot, phai them bien the
// ngan hon nay, giong cach lib/pdf-text.ts isStatementSectionMarker da lam).
//
// KHONG con nhan dien theo TIEU DE truoc bang (da bo, xem classifyTableByContent
// duoi) - chot 2026-07-08 sau khi gap that voi IDV: tu Thong tu 99/2025/TT-BTC
// (hieu luc 27/10/2025), "Bang can doi ke toan" doi ten thanh "Bao cao tinh
// hinh tai chinh", VA trang bia BCTC theo mau moi liet ke ten ca 4 bang o
// dang DANH SACH THUONG (khong phai bang markdown "|...|"), vd dong "1 - Báo
// cáo tình hình tài chính (Mẫu số: B01a – DN)" - dong nay tu no da khop tieu
// de o VI TRI DAU TIEN trong van ban (truoc ca tieu de that o giua tai lieu),
// khien CA 3 bang bi gan sai pham vi hoan toan (balanceSheet/incomeStatement
// rong, cashFlow "nuot" het moi thu - dung loai loi tuong tu da gap voi MBS
// 2026-07-07, nhung lan nay ca voi doanh nghiep thuong, khong rieng CTCK).
// Doi sang nhan dien theo TEN CHI TIEU DAC TRUNG BEN TRONG tung bang - on
// dinh truoc thay doi ten bieu mau/thay doi thu tu trang bia, vi noi dung cac
// chi tieu (theo Thong tu 200/99) khong doi du ten bang co doi.

// Dung de CHAN pham vi truoc khi tim/gan bang (parseStatementsFromMarkdown
// duoi) khi dau vao la TOAN VAN CA TAI LIEU (ke ca Thuyet minh - xem
// lib/export/full-document.ts, goi ham nay tren markdown KHONG gioi han trang,
// khac voi lib/pipeline.ts Buoc 2 van chi truyen pham vi truoc Thuyet minh nhu
// cu). Neu khong chan, cac bang phu trong Thuyet minh (hang chuc bang) se lot
// vao vi cung co the trung tu khoa noi dung (xem classifyTableByContent). Cong
// ty CHUNG KHOAN (CTCK, Mau B04a-CTCK) co THEM 1 bao cao "Bao cao tinh hinh
// bien dong von chu so huu" nam GIUA cashFlow va Thuyet minh - bang nay KHONG
// thuoc 3 bang app dang xuat nen cung phai chan dung TRUOC no.
//
// SUA 2026-07-14 (theo de nghi nguoi dung, xem ly do chi tiet + lich su cac
// phuong an da thu ngay duoi ham containsCashFlowEndingSequence): thay vi tim
// diem BAT DAU "Thuyet minh" bang tu khoa (NOTES_SECTION_MARKERS, da GIU LAI
// duoi dang comment ngay canh containsHeadingMarkerNearStart, khong xoa), tim
// diem KET THUC cua CHINH LCTT qua 1 CHU KY 3 DONG bat buoc theo luat ke toan.

// Tieu de muc that su LUON la 1 dong NGAN (chi ten muc, vd "# **BẢNG CÂN ĐỐI
// KẾ TOÁN**", ~30 ky tu) - da gap that (2026-07-06, xuat toan van BCTC SJ1):
// cum "KET QUA HOAT DONG KINH DOANH" xuat hien giua 1 CAU VAN XUOI dai trong
// Thuyet minh ("...Ket qua hoat dong kinh doanh thuc te co the khac voi cac
// uoc tinh...") bi nham thanh tieu de muc "Ket qua kinh doanh" that, lam lech
// het pham vi 2 muc (incomeStatement bi day xuong cuoi van ban, "nuot" ca
// Thuyet minh; cashFlow bi cat ngan sai). Chi khi OCR TOAN VAN (nhieu chu hon
// han pham vi ngan truoc Thuyet minh cua buoc "Tai BCTC") moi lo ra rui ro
// nay - gioi han do dai dong de loai cau van xuoi dai, chi nhan dong ngan
// (tieu de that).
const MAX_HEADING_LINE_LENGTH = 80;

function looksLikeHeadingLine(rawLine: string): boolean {
  const trimmed = rawLine.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_HEADING_LINE_LENGTH && !trimmed.startsWith('|');
}

// LICH SU diem CAT truoc "Thuyet minh" (2026-07-14, PTI) - 3 phuong an DA THU,
// GIU LAI CA 2 phuong an truoc DUOI DANG COMMENT (khong xoa, phong khi can
// dung lai/ket hop them - yeu cau nguoi dung) truoc khi chot phuong an cuoi
// (CASH_FLOW_ENDING_SEQUENCE, xem duoi):
//
// (a) loai cau dan chieu theo TU NGU cu the ("PHAI DUOC DOC") - lot bien the
// khac ("PHAI DUOC XAC NHAN") ngay trong CUNG 1 tai lieu PTI.
// (b) doi diem cat sang dong "Tien va tuong duong tien cuoi ky" DON LE - va
// cham that voi dong "...cuoi ky CUA KHACH HANG" (CTCK, VND/BVS, bang ngoai
// BCTC), phai them dieu kien loai tru rieng.
// (c) dieu kien CAU TRUC: dong phai bat dau bang "#" (heading markdown that)
// moi duoc coi la tieu de muc - loai duoc CA 2 bien the cau dan chieu ma
// khong can biet truoc chung viet gi (moi tieu de muc THAT deu ra dang "#",
// cau van xuoi thi khong bao gio). Hoat dong dung, nhung van la 1 lop RIENG
// (thay vi noi tro thang vao tin hieu ket thuc LCTT that su) nen bi thay
// tiep boi phuong an (d) ben duoi theo de nghi nguoi dung 2026-07-14.
//
// const NOTES_SECTION_MARKERS = ['THUYET MINH BAO CAO TAI CHINH', 'THUYET MINH BCTC', 'BIEN DONG VON CHU SO HUU'];
// function containsHeadingMarkerNearStart(rawLine: string, markers: string[]): boolean {
//   const trimmed = rawLine.trim();
//   if (trimmed.length === 0 || trimmed.startsWith('|') || !trimmed.startsWith('#')) return false;
//   const normalized = normalizeLabelText(trimmed);
//   return markers.some((m) => {
//     const index = normalized.indexOf(m);
//     return index !== -1 && index + m.length <= MAX_HEADING_LINE_LENGTH;
//   });
// }

function splitMarkdownRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.replace(/\*\*/g, '').trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.every((c) => /^:?-+:?$/.test(c) || c === '');
}

// Dong 2 cua header 2-dong trong KQKD Quy - CHI chua "Nam nay"/"Nam truoc"
// (khong so lieu, khong nhan chi tieu that) o cac o khong trong - xem
// parseAllTablesInRange (goi ham nay) de biet ly do can gop dong nay vao
// header thay vi coi la dong du lieu.
function looksLikePeriodSubHeaderRow(cells: string[]): boolean {
  const nonEmpty = cells.map((c) => c.trim()).filter((c) => c !== '');
  if (nonEmpty.length === 0) return false;
  return nonEmpty.every((c) => {
    const normalized = normalizeLabelText(c);
    return normalized.includes('NAM NAY') || normalized.includes('NAM TRUOC');
  });
}

// KHONG cho phep khoang trang GIUA cac chu so nua (khac ban cu) - 1 con so
// THAT SU khong bao gio co khoang trang o giua. Da gap that MBS Q2/2026
// (2026-07-11): 1 vai o gia tri bi Mistral dinh 2 so lien tiep chi cach nhau
// 1 khoang trang (vd "308.845.773.308 20.932.707.542", KHONG co chu thich
// thuyet minh xen giua) - ban cu (cho phep \s trong nhom ky tu) am tham GHEP
// LUON 2 chuoi so lai thanh 1 SO KHONG LO SAI (vd "30884577330820932707542"),
// tra ve GIA TRI SAI TRONG NHU DUNG thay vi null - nguy hiem hon nhieu so
// voi 1 chi tieu tra ve null.
const SINGLE_NUMBER_PATTERN = /^\(?-?[\d.,]+\)?$/;

// Tham chieu thuyet minh dang "32(a)"/"8(b)" - hay bi Mistral dinh LIEN vao o
// gia tri ke ben (thay vi tach rieng cot Thuyet minh, thuong de trong) khi
// dong do THAT SU co chu thich - phat hien qua doi chieu that MBS Q2/2026.
const THUYET_MINH_REF_PATTERN = /^\d{1,3}\([a-z]\)$/i;

// "Gia tri manh": co dau ngoac/am (quy uoc so am ke toan VN) HOAC dau phan
// cach hang nghin/thap phan, HOAC >=4 chu so tran - phan biet voi 1 so thu tu
// thuyet minh TRAN dinh truoc gia tri that (xem BARE_THUYET_MINH_REF_PATTERN
// duoi day), vi thuyet minh BCTC VN chi danh so 1-99 (khong bao gio dai toi 4
// chu so), con gia tri tien that hau nhu luon co dau phan cach hang nghin/am.
function isFormattedValueToken(token: string): boolean {
  return /[().,-]/.test(token) || token.replace(/\D/g, '').length >= 4;
}

function parseNumericCell(value: string): string | number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Tach theo khoang trang, phan loai TUNG token: 1 con so co the (SINGLE_NUMBER_PATTERN),
  // 1 tham chieu thuyet minh dang "32(a)" (bo qua luon, khong bao gio la gia
  // tri that), hoac thu gi khac (khong chac chan, giu nguyen CA CHUOI - tra ve
  // null khi doc o lib/analysis.ts thay vi doan bua).
  const numberLikeTokens: string[] = [];
  for (const token of trimmed.split(/\s+/)) {
    if (THUYET_MINH_REF_PATTERN.test(token)) continue;
    if (SINGLE_NUMBER_PATTERN.test(token) && /\d/.test(token)) {
      numberLikeTokens.push(token);
      continue;
    }
    return trimmed;
  }

  // SUA 2026-07-13 (xac nhan qua ACG that): tham chieu thuyet minh doi khi
  // dinh vao gia tri o dang so TRAN, KHONG co dau ngoac quanh chinh no (vd "32
  // (30.725.460.877)" - "32" la so thuyet minh, "(30.725.460.877)" moi la gia
  // tri that) - THUYET_MINH_REF_PATTERN (yeu cau dang "32(a)", dinh lien
  // khong khoang trang) khong khop dang nay, truoc day ca o bi coi la "2 con
  // so mo ho" nen tra ve chuoi tho, lam "Chi phi thue TNDN hien hanh" doc
  // duoc = null, khien kiem tra cheo "LNST = LNTT - Chi phi thue TNDN" tinh
  // thieu han dong nay va bao SAI mismatch (da xac nhan qua chinh dang thuc ke
  // toan: LNTT - [30.725.460.877 + 3.019.863.797 (dong hoan lai, dinh tuong
  // tu)] = dung bang LNST bao cao). Neu CHI CO DUNG 1 token "manh" (co dau
  // ngoac/phan cach - chac chan la gia tri) va cac token con lai deu la so
  // TRAN NGAN (<=3 chu so, dang so thu tu thuyet minh) thi uu tien lay token
  // manh, bo qua cac token tran con lai. Truong hop CO TU 2 token "manh" tro
  // len (vd 2 gia tri that bi dinh lam 1, khong co chu thich de tach) VAN giu
  // nguyen an toan cu - tra ve chuoi tho, khong doan.
  const strongTokens = numberLikeTokens.filter(isFormattedValueToken);
  let numericToken: string;
  if (strongTokens.length === 1) {
    numericToken = strongTokens[0];
  } else if (numberLikeTokens.length === 1) {
    numericToken = numberLikeTokens[0];
  } else {
    return trimmed;
  }

  const isNegative = numericToken.startsWith('(') || numericToken.startsWith('-');
  const digitsOnly = numericToken.replace(/\D/g, '');
  if (!digitsOnly) return trimmed;
  const num = Number(digitsOnly);
  return Number.isNaN(num) ? trimmed : isNegative ? -num : num;
}

// Vai dong (vd mã 230 "Bất động sản đầu tư" trong TIX) bi thieu 1 cot GIUA
// (thuong la "TM" - Thuyet minh - nam giua Ma so va cac cot gia tri), KHONG
// phai luon thieu cot DAU (STT) nhu gia dinh don gian (kieu "shift deu ca
// dong") tung dung trong lib/ai/qwen-vision-era financial-statements.ts cu -
// 1 shift duy nhat khong du cho truong hop nay (da xac nhan qua debug that voi
// TIX: van mat mã 230 khoi tong neu chi shift). Phan loai theo NOI DUNG tung o
// thay vi vi tri: nhan (co chu cai) -> cot nhan; token ngan thuan so (2-4 chu
// so, co the kem 1 chu cai vd "230"/"411a") -> cot "Ma so"; con lai (dang tien
// te that, hoac "-") -> cac cot gia tri, gan vao cac cot gia tri O CUOI header
// (theo dung thu tu con lai) - vi cac cot gia tri luon o CUOI header va thu tu
// giua chung khong doi, chi co the bi thieu 1 cot metadata o giua.
const MA_SO_PATTERN = /^\d{2,4}[a-zA-Z]?$/;

function looksLikeLabel(cell: string | null): boolean {
  return typeof cell === 'string' && /[a-zA-ZÀ-ỹ]{3,}/.test(cell);
}

// KHONG dung MA_SO_PATTERN o day (chi khop ma so DON gian nhu "212"/"117a") -
// se TU CHOI NHAM ca ma so con hop le co dau cham nhu "212.1"/"117.2" (dong
// chi tiet cap 4, rat pho bien), gay regression that (SSI 2026-07-11: dong
// "1.1. Các khoản đầu tư..." mã "212.1" bi coi la "khong hop le" chi vi co
// dau cham, kich hoat phan loai lai OAN, lam mat gia tri "Số cuối kỳ" that).
// Dung dieu kien NGUOC LAI voi looksLikeLabel() - ma so/STT KHONG BAO GIO
// chua 1 CHUOI CHU LIEN TIEP (>=3 ky tu) nhu nhan that, bat ke co dau cham/
// gach ngang hay khong - day moi la tin hieu on dinh de phan biet.
function looksLikeValidMaSoCell(cell: string | null): boolean {
  if (cell === null) return true;
  return !looksLikeLabel(cell);
}

function realignRowByContent(
  row: (string | null)[],
  columns: string[],
  labelColumnIndex: number,
  maSoIdx: number
): (string | null)[] {
  // Chi phan loai lai theo NOI DUNG khi THAT SU can (so luong o lech, HOAC o
  // dung vi tri "cot nhan" lai KHONG giong nhan - vd dong "TONG CONG TAI SAN"
  // bo qua cot STT rieng nen nhan bi lech vao dung vi tri cot STT du tong so
  // o van khop 6/6, xem vi du that o smoke test HSG 2026-07-05). Neu o dung vi
  // tri cot nhan DA la nhan that (truong hop binh thuong, da chiem da so cac
  // dong), GIU NGUYEN khong dong cham gi - tranh lam hong cac dong von da
  // dung (da gap that: thu phan loai lai VO DIEU KIEN cho MOI dong lam mot so
  // dong TS ngan han/dai han binh thuong bi xao tron sai, gay lech tong moi).
  //
  // THEM dieu kien: cot "Ma so" (neu co dat ten) phai chua gia tri HOP LY
  // (so ngan hoac trong/"-") - da gap that MBS Q2/2026 (2026-07-11): 1 trang
  // KQKD bi Mistral OCR THIEU dung 1 cot rong o header (7 cot thay vi 8 nhu
  // cac trang con lai CUNG bang), lam MOI ten cot tu vi tri do tro di lech 1
  // so voi du lieu that (header ghi "Ma so" nhung o do LAI la nhan chi tieu,
  // "Thuyet minh" nhung o do LAI la ma so that) - row.length VAN khop
  // columns.length (ca 2 deu 7, trung hop ngau nhien) VA o vi tri "nhan" gia
  // dinh (KE BEN "Ma so") van "trong nhu nhan" (that ra la nhan dung vi
  // tri, chi cac cot SAU no moi lech) nen dieu kien length+label o tren
  // KHONG bat duoc loi nay. Kiem tra them: gia tri O vi tri "Ma so" (theo
  // header) co dang hop le khong - neu KHONG (vd lai la 1 doan van ban dai)
  // thi chac chan header/du lieu da bi lech, phai phan loai lai theo NOI DUNG.
  if (
    row.length === columns.length &&
    looksLikeLabel(row[labelColumnIndex]) &&
    (maSoIdx === -1 || looksLikeValidMaSoCell(row[maSoIdx]))
  ) {
    return row;
  }

  const result: (string | null)[] = new Array(columns.length).fill(null);

  const labelCellIdx = row.findIndex((cell) => typeof cell === 'string' && /[a-zA-ZÀ-ỹ]{3,}/.test(cell));
  if (labelCellIdx !== -1) result[labelColumnIndex] = row[labelCellIdx];

  const remaining = row.filter((_, i) => i !== labelCellIdx);
  // SUA 2026-07-16 (PTI that): 1 dong CHI co toi da 1 o la ma so THAT (nam
  // NGAY SAU nhan - da neu ro trong thiet ke ban dau, xem doan duoi), nhung
  // cach nhan dien CU dua vao HINH DANG (MA_SO_PATTERN, chi khop so tran 2-4
  // chu so) bo sot ma so con co dau cham (vd "311.1"/"329.1" duoi "311"/"329"
  // - CUNG loai da tung sua rieng cho looksLikeValidMaSoCell o tren, nhung
  // chua lan toi day). Khi khong khop duoc, codeIdx=-1 khien CA mã số THAT
  // lan STT bi gop chung vao valueCells, roi bi cat bot 1 o do thua so luong
  // so voi valueSlots - lam mat han 1 cot gia tri that (dau nam) va lech het
  // cac cot con lai. Vi VI TRI (ngay sau nhan) da la tin hieu DUY NHAT can
  // thiet - khong can doan qua hinh dang con so nua - dung THANG vi tri do,
  // dong bo voi bat ky the loai ma so nao (co dau cham hay khong).
  const codeIdx = maSoIdx !== -1 && labelCellIdx !== -1 && labelCellIdx < row.length - 1 ? labelCellIdx : -1;
  const valueCells = remaining.filter((_, i) => i !== codeIdx);

  if (maSoIdx !== -1 && codeIdx !== -1) result[maSoIdx] = remaining[codeIdx];

  const valueSlots = columns.map((_, i) => i).filter((i) => i !== labelColumnIndex && i !== maSoIdx);
  if (valueCells.length > 0) {
    valueSlots.slice(-valueCells.length).forEach((slot, k) => {
      result[slot] = valueCells[k];
    });
  }

  return result;
}

// Ten chi tieu DAC TRUNG rieng cua tung bang (theo Thong tu 200/99, khong doi
// du ten BANG co doi ten - xem comment o tren) - dung de nhan dien 1 bang
// markdown DA PARSE thuoc bang nao qua NOI DUNG cac dong cua no thay vi tieu
// de dung truoc no.
const BALANCE_SHEET_CONTENT_MARKERS = [
  'TIEN VA CAC KHOAN TUONG DUONG TIEN',
  'DAU TU TAI CHINH NGAN HAN',
  'PHAI THU NGAN HAN CUA KHACH HANG',
  'TRA TRUOC CHO NGUOI BAN',
  'HANG TON KHO',
  'TAI SAN CO DINH HUU HINH',
  'BAT DONG SAN DAU TU',
  'NGUOI MUA TRA TIEN TRUOC',
  'VON CHU SO HUU',
  'TONG CONG TAI SAN',
  'TONG CONG NGUON VON',
  'VAY VA NO THUE TAI CHINH',
  // BCDKT Ngan hang (Mau B02a/TCTD-HN, Thong tu 49/2014/TT-NHNN) bi Mistral
  // tach thanh 2 bang RIENG giong VAS thuong (nua "A. TAI SAN" + nua "B. NO
  // PHAI TRA VA VON CHU SO HUU" o trang sau) - nhung nua B chi co 1 diem
  // khop VAS ("VON CHU SO HUU") trong khi cung khop luon marker offBalanceSheet
  // "TIEN GUI CUA KHACH HANG" (dong "III. Tien gui cua khach hang" that su cua
  // BCDKT, TRUNG chu voi dong "Tien gui cua khach hang" trong bang ngoai BCTC
  // cua CTCK) -> diem hoa 1-1, ca nua B bi am tham loai bo (da xac nhan qua
  // OCR that HDB Q1/2026, 2026-07-12). Them 2 marker RIENG cua NH (khong xuat
  // hien o CTCK/bao hiem/DN thuong) de nua B luon thang diem ro rang.
  'TIEN GUI VA VAY CAC TCTD KHAC',
  // VCB viet day du "to chuc tin dung", khong viet tat "TCTD" - can ca 2 bien
  // the (da xac nhan qua VCB Q1/2026, 2026-07-12).
  'TIEN GUI VA VAY CAC TO CHUC TIN DUNG KHAC',
  'PHAT HANH GIAY TO CO GIA',
];

const INCOME_STATEMENT_CONTENT_MARKERS = [
  'DOANH THU BAN HANG VA CUNG CAP DICH VU',
  'CAC KHOAN GIAM TRU DOANH THU',
  'DOANH THU THUAN VE BAN HANG',
  'GIA VON HANG BAN',
  'LOI NHUAN GOP VE BAN HANG',
  'DOANH THU HOAT DONG TAI CHINH',
  'CHI PHI BAN HANG',
  'CHI PHI QUAN LY DOANH NGHIEP',
  'LOI NHUAN THUAN TU HOAT DONG KINH DOANH',
  'LOI NHUAN SAU THUE THU NHAP DOANH NGHIEP',
  // KQKD mau bao hiem (Mau B02a-DNPNT, Thong tu 232/2012/TT-BTC) dung tu ngu
  // RIENG, khong trung markers VAS thuong nao o tren - "Phan II - chi tiet
  // theo hoat dong" hay bi Mistral tach thanh 2 bang markdown (ngat giua trang)
  // va NUA DAU (ma 01-11.1: Doanh thu phi bao hiem, Phi nhuong tai BH, Doanh
  // thu thuan HDKDBH, Chi boi thuong) truoc khi them cac marker duoi day KHONG
  // khop bat ky VAS marker nao ca -> classifyTableByContent tra ve null, ca
  // bang bi am tham BO QUA (khong loi, khong canh bao - phat hien qua doi
  // chieu that bao cao Bao hiem NN&PTNT Q1/2026, 2026-07-10). Chi them tu ngu
  // DAC TRUNG rieng cua bao hiem (khong trung voi doanh nghiep/ngan hang/chung
  // khoan thuong) nen an toan, khong lam sai lech phan loai cac bang khac.
  'DOANH THU PHI BAO HIEM',
  'PHI NHUONG TAI BAO HIEM',
  'DOANH THU THUAN HOAT DONG KINH DOANH BAO HIEM',
  'CHI BOI THUONG',
  'LOI NHUAN GOP HOAT DONG KINH DOANH BAO HIEM',
  'TONG CHI PHI HOAT DONG KINH DOANH BAO HIEM',
  // KQKD mau chung khoan (Mau B02-CTCK, Thong tu 210/2014 + 334/2016/TT-BTC)
  // cung dung tu ngu rieng, khong "CHI PHI QUAN LY DOANH NGHIEP" (CTCK ghi
  // "CHI PHI QUAN LY" hoac "...CONG TY CHUNG KHOAN", thieu hau to "DOANH
  // NGHIEP") - da xac nhan qua 2 bao cao that SSI/MBS 2026-07-11.
  'DOANH THU NGHIEP VU MOI GIOI CHUNG KHOAN',
  'CHI PHI NGHIEP VU MOI GIOI CHUNG KHOAN',
  'CONG DOANH THU HOAT DONG',
  'CONG CHI PHI HOAT DONG',
  'TONG LOI NHUAN KE TOAN TRUOC THUE',
  'LOI NHUAN KE TOAN SAU THUE',
  // KQKD mau Ngan hang (Mau B03/TCTD-HN, Thong tu 49/2014/TT-NHNN) dung tu
  // ngu rieng, khong trung markers VAS/bao hiem/CTCK nao o tren - da xac nhan
  // qua 2 bao cao that HDB/VCB Q1/2026 (2026-07-12). Truoc khi them 2 marker
  // nay, bang van duoc gan dung nho 1 diem khop TINH CO ("LOI NHUAN THUAN TU
  // HOAT DONG KINH DOANH" khop 1 phan trong dong "Loi nhuan thuan tu hoat dong
  // kinh doanh TRUOC CHI PHI DU PHONG RUI RO TIN DUNG") - them marker RIENG de
  // khong con phu thuoc may rui 1 diem khop nhu vay. KQKD Ngan hang co CA cot
  // "Quy nay"/"Luy ke tu dau nam" (rong hon, vd VCB) hay bi Mistral tach
  // THANH 2 TRANG RIENG (trang 1: tu "Thu nhap lai thuan" den "Tong loi nhuan
  // truoc thue"; trang 2 "tiep theo": tu "Chi phi thue TNDN" den "Loi nhuan
  // thuan...phan bo cho co dong") - trang 2 KHONG khop bat ky marker nao o
  // tren (chi con "Chi phi thue TNDN"/"Loi nhuan sau thue" ngan gon, khac
  // 'other' luon viet day du "...THU NHAP DOANH NGHIEP") nen bi am tham loai
  // bo, lam LNST/LNST Cty Me luon null - da xac nhan qua VCB Q1/2026
  // (2026-07-12, HDB KHONG co cot Luy ke nen KQKD gon hon, khong bi tach
  // trang). Them marker CHI cho trang 2 nay.
  'CHI PHI THUE TNDN',
  // SUA 2026-07-15 (theo phan hoi nguoi dung, xac nhan qua markdown OCR THAT
  // cua CTG Q1/2026, sau khi OCR gioi han 11 trang de xem lai): CTG ngat
  // trang MUON HON VCB 1 nhip - trang chua "Chi phi thue TNDN" (marker tren)
  // DUNG LAI o "XII. Chi phi thue TNDN", doan "XIII. Loi nhuan sau thue" tro
  // di nam trong 1 bang RIENG (dung ngay sau tieu de that "BÁO CÁO KẾT QUẢ
  // HOẠT ĐỘNG HỢP NHẤT (Tiếp theo)") KHONG con chua "Chi phi thue TNDN" nen
  // khong khop marker nao o tren, bi am tham loai bo. LAN DAU sua (cung ngay)
  // da DOAN SAI ca 2 cum tu dac trung (dung "cổ đông của Ngân hàng mẹ"/"cổ
  // đông thiểu số" - khong co that trong van ban) - markdown OCR THAT cho
  // thay CTG viet "XIII. Lợi nhuận sau thuế TNDN" / "XIV. Lợi ích của cổ
  // đông KHÔNG KIỂM SOÁT" (khong phai "thieu so") / "XV. Lợi nhuận thuần
  // của cổ đông Ngân hàng" (khong co "mẹ"). KHONG dung "LOI NHUAN SAU THUE"
  // tran (trung voi dong BCDKT rat pho bien "Loi nhuan sau thue CHUA PHAN
  // PHOI") - dung "LOI NHUAN SAU THUE TNDN" (hau to TNDN lam no khac han
  // dong BCDKT). "LOI ICH CUA CO DONG KHONG KIEM SOAT" giu nguyen dang OCR
  // (co "CUA") - khac voi marker equity da co san o statement-shared.ts
  // (KNOWN_EQUITY_DIRECT_CHILD_CONTENT, khong co "CUA") nen khong trung.
  'LOI NHUAN SAU THUE TNDN',
  'LOI ICH CUA CO DONG KHONG KIEM SOAT',
  'LOI NHUAN THUAN CUA CO DONG NGAN HANG',
  'LAI CO BAN TREN CO PHIEU',
];

const CASH_FLOW_CONTENT_MARKERS: ContentMarker[] = [
  // SUA 2026-07-16 (MCH that): chuyen 4 marker duoi tu chuoi CO DINH sang
  // MANG tu khoa BAT BUOC (AND, khong doi hoi lien tiep - xem ContentMarker/
  // matchesContentMarker) - MCH chen them "CAC"/"CAC KHOAN" giua cac cum tu
  // ("...TU CÁC hoạt động kinh doanh", "...VÀ CÁC KHOẢN tương đương tiền cuối
  // kỳ"), pha vo chuoi lien tuc cua ca 2 marker "TU HOAT DONG..." VA "TIEN VA
  // TUONG DUONG TIEN CUOI KY", khien CA 2 doan LCTT (hoat dong kinh doanh LAN
  // dau tu/tai chinh) khong khop bat ky marker cashFlow nao, bi phan loai
  // NHAM (doan 1 hoa diem tinh co voi "HANG TON KHO" cua BCDKT qua dong
  // "Bien dong hang ton kho", roi vao balanceSheet) hoac bi loai hoan toan
  // (doan 2, khong hoa diem voi bang nao ca).
  ['LUU CHUYEN TIEN', 'HOAT DONG KINH DOANH'],
  ['LUU CHUYEN TIEN', 'HOAT DONG DAU TU'],
  'LUU CHUYEN TIEN THUAN TRONG KY',
  ['TIEN VA', 'TUONG DUONG TIEN CUOI KY'],
  // SUA 2026-07-15 (theo phan hoi nguoi dung, xac nhan qua markdown OCR THAT
  // CTG Q1/2026): mau Ngan hang (B04a/TCTD-HN) viet DAY DU HON "Tiền và các
  // khoản tương đương tiền TẠI THỜI ĐIỂM cuối kỳ" (chen them "cac khoan"/"tai
  // thoi diem") - khong con la substring lien tuc cua marker tren, nen dong
  // "VII. ...cuoi ky" (thuong roi vao 1 bang RIENG chi 1 dong do ngat trang)
  // khong khop marker nao, van bi loai (du filter <3 dong da duoc sua o
  // duoi, xem parseStatementsFromMarkdown). Them bien the rieng, dac trung
  // du de khong trung BCDKT/KQKD/offBalanceSheet.
  'TAI THOI DIEM CUOI KY',
  'KHAU HAO TAI SAN CO DINH',
  'TIEN CHI TRA LAI VAY',
  'TIEN CHI NOP THUE THU NHAP DOANH NGHIEP',
];

// SUA 2026-07-14 (theo yeu cau nguoi dung, sau khi gap that PTI - xem lich su
// day du 3 phuong an DA THU trong comment ngay canh containsHeadingMarkerNearStart
// o tren, gom ca 1 bien the trung gian dung DUY NHAT dong "Tien va tuong duong
// tien cuoi ky" - lan luot bi loai vi deu dua vao so khop 1 CUM TU/1 DONG DON
// LE, luon co nguy co trung tinh co voi 1 dong khac o noi khac trong tai lieu
// (da xac nhan that: dong "...cuoi ky CUA KHACH HANG" trong bang ngoai BCTC
// cua CTCK, VND/BVS).
//
// PHUONG AN CUOI CUNG (theo de nghi nguoi dung 2026-07-14): thay vi khop 1
// DONG DON LE, doi hoi CA MOT CHU KY 3 DONG LIEN TIEP DUNG THEO TRINH TU BAT
// BUOC theo luat ke toan VN (ma so 50 -> 60 -> [61 tuy chon] -> 70, Mau
// B03-DN va tuong duong cho NH/CTCK/bao hiem - LUON co ca 3 buoc nay, khong
// phu thuoc loai hinh DN): "Luu chuyen tien thuan trong ky" -> "Tien va tuong
// duong tien DAU ky" -> "Tien va tuong duong tien CUOI ky". Da xac nhan qua 2
// bao cao that KHAC LOAI HINH (DRI "other", BID "bank") deu ra DUNG chu ky 3
// dong nay theo dung thu tu; con dong va cham da biet (VND/BVS, "...cuoi ky
// CUA KHACH HANG") KHONG co cap dong "thuan trong ky"/"dau ky" di truoc no -
// no chi giong o DUNG 1 dong don le, khong giong ca chu ky 3 buoc. Doi hoi ca
// 3 dong dung thu tu giam manh rui ro khop nham so voi 1 dong rieng le (van
// KHONG the chung minh dung 100% - suy luan tren van ban OCR, khong phai cau
// truc PDF that - nhung xac suat trung ngau nhien ca 1 CHU KY 3 BUOC bat buoc
// theo luat o 1 noi khac la rat thap). KHONG con dua vao containsHeadingMarkerNearStart
// ("#") nua theo de nghi nguoi dung - ham do van giu nguyen o tren, chua xoa,
// de dung lai/ket hop them neu can.
const CASH_FLOW_NET_ROW_MARKER = 'TIEN THUAN TRONG KY';
const CASH_FLOW_BALANCE_ROW_CORE_MARKER = 'TUONG DUONG TIEN';
// SUA 2026-07-16 (phan hoi nguoi dung, xac nhan qua CTS that): CTS dung
// "dau NAM"/"cuoi NAM" cho 2 dong so du dau/cuoi (trong khi chinh dong "Luu
// chuyen tien thuan TRONG KY" ngay truoc do van dung "KY" nhu binh thuong -
// khong nhat quan ngay trong CUNG 1 bao cao). Them ca "QUY" phong truoc (theo
// de nghi nguoi dung, chua xac nhan qua bao cao that nao dung dung bien the
// nay - de phong bao cao quy dung "dau quy"/"cuoi quy" thay vi "ky"/"nam").
const CASH_FLOW_BEGIN_ROW_SUFFIX_MARKERS = ['DAU KY', 'DAU NAM', 'DAU QUY'];
const CASH_FLOW_END_ROW_SUFFIX_MARKERS = ['CUOI KY', 'CUOI NAM', 'CUOI QUY'];
// So dong toi da cho phep xen giua 2 moc trong chu ky (vd dong tuy chon "Anh
// huong thay doi ty gia hoi doai" xen giua "dau ky" va "cuoi ky" - xac nhan
// qua DRI that). TANG tu 2 len 3 (2026-07-16, xac nhan qua FTS/CTCK that):
// mau CTCK con tach "dau ky"/"cuoi ky" thanh 2 dong con RIENG ("- Tien"/"-
// Cac khoan tuong duong tien") CONG THEM dong ty gia tuy chon - tong 3 dong
// xen giua, vuot nguong 2 truoc day. Khi khong tim thay chu ky (vd truong
// hop nay truoc khi sua), OCR probe se quet HET toan van (khong dung lai
// dung luc) VA pham vi tim bang mo rong het ca Thuyet minh, co the lam mot
// bang trong Thuyet minh (vd bang khau hao tai san co dinh chi tiet theo
// loai) bi tron nham cot voi BCDKT that qua mostCommonColumns - da xac nhan
// qua FTS Q1/2026 that (OCR het 83 trang, header BCDKT bi ghi de thanh cot
// cua 1 bang phu trong Thuyet minh).
const CASH_FLOW_ENDING_ROW_GAP = 3;

function isMarkdownDataRow(rawLine: string): boolean {
  return rawLine.trim().startsWith('|');
}

function matchesCashFlowNetRow(rawLine: string): boolean {
  return isMarkdownDataRow(rawLine) && normalizeLabelText(rawLine).includes(CASH_FLOW_NET_ROW_MARKER);
}

function matchesCashFlowBalanceRow(rawLine: string, suffixMarkers: string[]): boolean {
  if (!isMarkdownDataRow(rawLine)) return false;
  const normalized = normalizeLabelText(rawLine);
  return normalized.includes(CASH_FLOW_BALANCE_ROW_CORE_MARKER) && suffixMarkers.some((m) => normalized.includes(m));
}

// Tim vi tri dong "Tien va tuong duong tien cuoi ky" THAT SU - CHI tinh khi no
// la dong THU 3 (hoac thu 4 neu co dong ty gia xen giua) trong dung 1 chu ky 3
// buoc (xem comment o tren), khong phai chi can khop 1 dong don le. -1 neu
// khong tim thay du ca chu ky trong pham vi.
function findCashFlowEndingSequenceIndex(lines: string[], searchFromIndex: number): number {
  for (let i = searchFromIndex; i < lines.length; i++) {
    if (!matchesCashFlowNetRow(lines[i])) continue;
    let beginIndex = -1;
    for (let j = i + 1; j <= i + 1 + CASH_FLOW_ENDING_ROW_GAP && j < lines.length; j++) {
      if (matchesCashFlowBalanceRow(lines[j], CASH_FLOW_BEGIN_ROW_SUFFIX_MARKERS)) {
        beginIndex = j;
        break;
      }
    }
    if (beginIndex === -1) continue;
    for (let k = beginIndex + 1; k <= beginIndex + 1 + CASH_FLOW_ENDING_ROW_GAP && k < lines.length; k++) {
      if (matchesCashFlowBalanceRow(lines[k], CASH_FLOW_END_ROW_SUFFIX_MARKERS)) {
        return k;
      }
    }
  }
  return -1;
}

// SUA 2026-07-16 (theo phan hoi nguoi dung, xac nhan qua PVP that): mau DN
// thuong dung "Luu chuyen tien TE tu hoat dong tai chinh" cho dong TIEU DE
// muc, VA "Luu chuyen tien THUAN tu hoat dong tai chinh" cho dong TONG -
// CA HAI deu chen them 1 tu ("TE"/"THUAN") giua "TIEN" va "TU", khong con la
// substring lien tuc cua 1 chuoi co dinh. Dung 2 tu khoa RIENG (khong doi
// hoi lien tiep, giong cach da sua cho "TONG"/"TAI SAN" o lib/analysis.ts)
// thay vi 1 chuoi cung nhac - khop duoc ca 2 bien the tren LAN dang ngan
// "Luu chuyen tien tu hoat dong tai chinh" (Ngan hang/CTCK, khong chen tu nao).
function isCashFlowFinancingSectionLine(normalizedLine: string): boolean {
  return normalizedLine.includes('LUU CHUYEN TIEN') && normalizedLine.includes('HOAT DONG TAI CHINH');
}

// SUA 2026-07-16 (theo de nghi nguoi dung, sau khi gap that CTG - dong "cuoi
// ky" that nam CACH dong "dau ky" toi 28 dong do NGAT TRANG giua chung, vuot
// xa moi nguong CASH_FLOW_ENDING_ROW_GAP hop ly nao). Thay vi tiep tuc tang
// nguong gap (van co gioi han, se lai vo hieu voi 1 khoang cach khac trong
// tuong lai), dung 1 tin hieu THU TU (khong gioi han khoang cach) thay cho
// tin hieu KHOANG CACH: "Luu chuyen tien ... hoat dong tai chinh" LUON la
// MUC CUOI CUNG trong 3 muc chinh cua LCTT (kinh doanh/dau tu/tai chinh,
// bat buoc theo luat ke toan, thu tu khong doi) - dong "cuoi ky" THAT SU
// LUON nam SAU dong nay, bat ke co bao nhieu dong chi tiet/ngat trang xen
// giua. CHI dung ham nay lam DU PHONG (goi SAU KHI ham chinh xac hon o tren
// da thu va khong tim thay) - it rui ro hon dua lam chinh vi khong gioi han
// khoang cach (vd co the khop qua 1 doan van xuoi dai nhac lai ca 2 cum tu -
// da giam rui ro nay bang isMarkdownDataRow, chi nhan HANG BANG that).
function findCashFlowEndingByFinancingSectionOrder(lines: string[], searchFromIndex: number): number {
  let lastFinancingIndex = -1;
  for (let i = searchFromIndex; i < lines.length; i++) {
    if (!isMarkdownDataRow(lines[i])) continue;
    const normalized = normalizeLabelText(lines[i]);
    if (isCashFlowFinancingSectionLine(normalized)) lastFinancingIndex = i;
    if (lastFinancingIndex !== -1 && matchesCashFlowBalanceRow(lines[i], CASH_FLOW_END_ROW_SUFFIX_MARKERS)) {
      return i;
    }
  }
  return -1;
}

// Diem vao DUY NHAT cho ca containsNotesSectionMarker va parseStatementsFromMarkdown
// - thu phuong an chinh xac hon (khoang cach gioi han) TRUOC, chi fallback
// sang phuong an thu tu (khong gioi han khoang cach, rui ro hon mot chut)
// khi phuong an dau khong tim thay gi.
function findCashFlowEndingIndex(lines: string[], searchFromIndex: number): number {
  const strict = findCashFlowEndingSequenceIndex(lines, searchFromIndex);
  if (strict !== -1) return strict;
  return findCashFlowEndingByFinancingSectionOrder(lines, searchFromIndex);
}

// Rieng CTCK (Mau B01-CTCK): "Cac chi tieu ngoai bao cao tinh hinh tai chinh"
// - tai san/tien/no CTCK QUAN LY HO nha dau tu (KHONG thuoc BCDKT chinh cua
// CTCK). Nam NGAY SAU BCDKT trong tai lieu goc - da xac nhan qua 2 bao cao
// that SSI (hop nhat, Q1/2026) va MBS (kiem toan, nam 2025) 2026-07-11, ca 2
// deu dung dung cac tu khoa duoi day du cau chu khac nhau kha nhieu cho tung
// dong rieng le (vd SSI "cua CTCK", MBS "cua cong ty chung khoan"; SSI "Trung
// tam Luu ky Chung khoan", MBS "VSDC" - ten moi cua chinh to chuc do). KHONG
// dung "CHUNG QUYEN" lam marker (co xuat hien lai trong KQKD - vd "danh gia
// lai phai tra chung quyen" - se gay diem hoa voi incomeStatement, xem
// classifyTableByContent).
// "NO KHO DOI DA XU LY" (co san o tren) tinh co cung xuat hien trong bang
// "Cac chi tieu ngoai bao cao tinh hinh tai chinh" cua Ngan hang (muc 7, Mau
// B02a/TCTD-HN) - da xac nhan qua 3 bao cao that HDB/VCB/MBB Q1/2026
// (2026-07-12), nen bang nay da duoc gan dung KEY ngay ca truoc khi them
// marker rieng. Them "BAO LANH VAY VON" (dong 1, dac trung rieng cua NH,
// khong trung CTCK) de khong con phu thuoc 1 marker dung chung ngau nhien.
const OFF_BALANCE_SHEET_CONTENT_MARKERS = [
  'TAI SAN QUAN LY THEO CAM KET',
  'NO KHO DOI DA XU LY',
  'CO PHIEU DANG LUU HANH',
  'TIEN GUI CUA KHACH HANG',
  'VE TIEN GUI GIAO DICH CHUNG KHOAN',
  'BAO LANH VAY VON',
];

// SUA 2026-07-16 (phan hoi nguoi dung, xac nhan qua MIG that): 1 marker la
// CHUOI CO DINH se gay ton thuong voi cac cong ty chen them tu giua (vd
// "Lưu chuyển tiền THUẦN TỪ/ (SỬ DỤNG VÀO) hoạt động tài chính" - ca "THUAN"
// LAN "/ (SU DUNG VAO)" chen giua "TU" va "HOAT DONG", khong con la 1 chuoi
// lien tuc voi bat ky bien the co dinh nao). Cho phep 1 marker la MANG cac
// tu khoa BAT BUOC (AND, khong doi hoi lien tiep) thay vi 1 chuoi don - dung
// chung 1 tinh than voi cach da sua cho "TONG"/"TAI SAN" (lib/analysis.ts)
// va isCashFlowFinancingSectionLine o tren.
type ContentMarker = string | string[];
function matchesContentMarker(labelText: string, marker: ContentMarker): boolean {
  if (typeof marker === 'string') return labelText.includes(marker);
  return marker.every((m) => labelText.includes(m));
}

const CONTENT_MARKERS_BY_KEY: { key: keyof FinancialStatements; markers: ContentMarker[] }[] = [
  { key: 'balanceSheet', markers: BALANCE_SHEET_CONTENT_MARKERS },
  { key: 'incomeStatement', markers: INCOME_STATEMENT_CONTENT_MARKERS },
  { key: 'cashFlow', markers: [...CASH_FLOW_CONTENT_MARKERS, ['LUU CHUYEN TIEN', 'HOAT DONG TAI CHINH']] },
  { key: 'offBalanceSheet', markers: OFF_BALANCE_SHEET_CONTENT_MARKERS },
];

// "Bao cao tinh hinh bien dong von chu so huu" (mau B03-DN va tuong duong cho
// NH/CTCK/bao hiem) - mau bieu BAT BUOC dung dung 3 cum tu cot nay theo luat
// ke toan (KHONG doi ten giua cac loai hinh doanh nghiep, khac han cach dat
// ten linh hoat cua BCDKT/KQKD/LCTT). Phat hien qua CỘT (table.columns), KHONG
// phai qua nhan dong nhu classifyTableByContent - day la tin hieu CAU TRUC on
// dinh hon nhieu so voi dua vao 1 nhan dong don le nhu "VON CHU SO HUU" (xem
// bug FTS 2026-07-15 duoi).
const EQUITY_CHANGES_COLUMN_MARKERS = ['SO DU DAU NAM', 'SO DU DAU KY', 'TANG GIAM TRONG KY', 'SO DU CUOI KY', 'SO DU CUOI NAM'];

// SUA 2026-07-15 (theo phan hoi nguoi dung, xac nhan qua FTS Q1/2026 that):
// "Bao cao bien dong von chu so huu" nam GIUA BCDKT that va KQKD/LCTT (khac
// vi tri da ghi nhan truoc do o comment containsNotesSectionMarker - vi tri co
// the khac nhau tuy cong ty) - bang nay co 1 dong TONG tieu de "Von chu so
// huu" NEN khop marker 'VON CHU SO HUU' cua BALANCE_SHEET_CONTENT_MARKERS,
// VA khong khop du markers nao cua 3 key con lai de bi loai qua "hoa diem" ->
// classifyTableByContent gan NHAM ca bang nay vao 'balanceSheet', bang GOP LAN
// voi BCDKT that (mostCommonColumns) khien columns cuoi cung la CUA BANG SAI
// (vd "So du dau nam"/"So tang/giam trong ky"/"So du cuoi ky" thay vi "Ma
// so"/"Thuyet minh"/"So cuoi ky"/"So dau nam" cua BCDKT that) - toan bo BCDKT
// xuat ra Excel bi hong (cot rac, KQKD an theo cung bi anh huong vi cung
// nguyen nhan can pham vi). Chan bang nay TRUOC KHI cham diem theo nhan dong -
// dung CAU TRUC COT (bat bien theo luat) thay vi co gang liet ke them tru
// (dung tinh than "uu tien tin hieu cau truc" da chot truoc do).
function isEquityChangesStatementTable(table: ParsedTable): boolean {
  const columnText = table.columns.map((c) => normalizeLabelText(String(c ?? ''))).join(' | ');
  const matches = EQUITY_CHANGES_COLUMN_MARKERS.reduce((count, marker) => count + (columnText.includes(marker) ? 1 : 0), 0);
  return matches >= 2;
}

// SUA 2026-07-17 (phan hoi nguoi dung, xac nhan qua ABW/ATS/CTS/GEE/NTC/UDJ/VPD
// Q2/2026 that): classifyTableByContent cham diem tren TOAN BO text cac dong
// GOP LAI, khong kiem tra bang co THAT SU la 1 bang chi tieu ke toan hay
// khong - 2 loai bang trang bia hay vo tinh "trung tu khoa" ma bi gan NHAM
// vao 1 trong 3 bang chinh (dong dau bang that bi thay bang rac):
//
// 1. Bang "Muc luc" (liet ke TEN 4 bang + so trang, vd "Bao cao tinh hinh tai
//    chinh | 01-04") - chinh no LIET KE ten cac bang nen tu khoa cua ca 4 key
//    (balanceSheet/incomeStatement/cashFlow/notes) deu xuat hien, ngau nhien
//    "thang" 1 key nao do khi cac key khac hoa diem thap hon. Nhan dien: bang
//    co >=2 dong/cot la TEN NGUYEN VAN 1 trong cac bao cao/muc chinh (mau
//    bieu bat buoc dung dung cum tu nay lam TIEU DE muc luc, khong doi theo
//    cong ty) - khac han 1 chi tieu ke toan that (khong bao gio ten 1 dong la
//    "Bao cao tinh hinh tai chinh" nguyen van).
// 2. Bang "so sanh nhanh"/"highlights" o trang bia (vd "Tong doanh thu | Ky
//    nay | Ky truoc | Chenh lech | Ty le tang/giam") - dung dung tu vung
//    "Doanh thu" trung INCOME_STATEMENT_CONTENT_MARKERS nhung la 1 bang tom
//    tat rieng (3-10 dong), KHONG PHAI bang KQKD day du. Nhan dien qua cum tu
//    dac trung CHI co o loai bang tom tat nay (BCDKT/KQKD/LCTT day du theo
//    mau bieu chuan khong bao gio dung "Ty le tang/giam"/"Chenh lech...so voi
//    ky truoc" lam ten cot/dong).
const COVER_PAGE_SECTION_NAME_MARKERS = [
  'BAO CAO TINH HINH TAI CHINH',
  'BAO CAO KET QUA HOAT DONG',
  'BAO CAO LUU CHUYEN TIEN TE',
  'THUYET MINH BAO CAO TAI CHINH',
  'BAO CAO CUA BAN TONG GIAM DOC',
  'BAO CAO CUA BAN GIAM DOC',
  'BAO CAO KIEM TOAN',
];

function isCoverPageOrSummaryTable(table: ParsedTable): boolean {
  const combinedText = [...table.columns, ...table.rows.flat()]
    .map((cell) => normalizeLabelText(String(cell ?? '')))
    .join(' | ');

  const sectionNameMatches = COVER_PAGE_SECTION_NAME_MARKERS.reduce(
    (count, marker) => count + (combinedText.includes(marker) ? 1 : 0),
    0
  );
  if (sectionNameMatches >= 2) return true;

  const hasTangGiam = combinedText.includes('TANG GIAM') || combinedText.includes('TANG/GIAM');
  const hasPercentChangeWording = combinedText.includes('TY LE') && hasTangGiam;
  const hasDifferenceWording =
    combinedText.includes('CHENH LECH') && (hasTangGiam || combinedText.includes('SO VOI KY TRUOC') || combinedText.includes('CUNG KY'));
  return hasPercentChangeWording || hasDifferenceWording;
}

// Dem so tu khoa dac trung cua tung bang xuat hien trong NHAN cac dong cua 1
// bang markdown da parse - gan bang do vao key co diem cao nhat, CHI khi diem
// do RO RANG vuot troi (khong hoa voi key khac) va > 0. Khong ep gan bua khi
// khong ro rang (tra ve null - bang bi bo qua, an toan hon la gan sai vao 1
// bang khong lien quan, vd bang phu "Co cau von dieu le" o trang bia).
function classifyTableByContent(table: ParsedTable): keyof FinancialStatements | null {
  if (isEquityChangesStatementTable(table)) return null;
  if (isCoverPageOrSummaryTable(table)) return null;
  // Dung labelIndex DA TINH SAN cua bang (parseAllTablesInRange, co xet noi
  // dong mau) - KHONG tinh lai chi qua ten cot o day: da gap that MBS Q2/2026
  // (2026-07-11), bang "Nợ phải trả"/"Vốn chủ sở hữu" co CA 2 cot dau deu
  // trong (khong ten) - tinh lai chi qua ten se fallback ve cot 0 (that ra la
  // cot STT "C."/"I."/"1.", KHONG phai nhan that), cham diem toan chuoi ngan
  // vo nghia, khong khop marker nao ca -> ca bang bi am tham loai bo hoan
  // toan (khong loi, khong canh bao).
  const labelIndex = table.labelIndex;
  const labelText = table.rows.map((row) => normalizeLabelText(String(row[labelIndex] ?? ''))).join(' | ');

  const scores = CONTENT_MARKERS_BY_KEY.map(({ key, markers }) => ({
    key,
    score: markers.reduce((count, marker) => count + (matchesContentMarker(labelText, marker) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);

  const [best, second] = scores;
  if (best.score === 0 || best.score === second.score) return null;
  return best.key;
}

// KQKD bao hiem (Mau B02/B02a-DNPNT, Thong tu 232/2012/TT-BTC) tach lam 2
// "Phan" RIENG, moi Phan co 1 tieu de ngan dat NGAY TRUOC bang cua no - "Phan
// I ... tong hop" (bang gon) va "Phan II ... chi tiet theo hoat dong" (bang
// day du hon, CHUA het so lieu cua Phan I nhung tach nho hon nua - vd "Doanh
// thu phi bao hiem"/"Chi boi thuong" CHI co o Phan II, khong co dong rieng o
// Phan I). Dung de uu tien lay Phan II khi xuat Excel 3 bang (yeu cau user
// 2026-07-11) - xem cho dung tai parseStatementsFromMarkdown. "PHAN I" khop
// NHAM ca vao "PHAN II" (la tien to cua no) nen phai loai truong hop do rieng.
type IncomeStatementPart = 'summary' | 'detail';
const INCOME_STATEMENT_PART_MARKERS: { part: IncomeStatementPart; test: (normalizedLine: string) => boolean }[] = [
  { part: 'detail', test: (l) => l.includes('PHAN II') && (l.includes('CHI TIET') || l.includes('THEO HOAT DONG')) },
  { part: 'summary', test: (l) => l.includes('PHAN I') && l.includes('TONG HOP') && !l.includes('PHAN II') },
];

// SUA 2026-07-15 (theo phan hoi nguoi dung, sau vu CTG doan LNST/dong "cuoi
// ky" LCTT bi mat vi ngat trang): thay vi tiep tuc doan tung cum tu BEN
// TRONG bang con (se luon co rui ro sai voi cong ty/mau bieu khac - "Loi ich
// cua co dong khong kiem soat" la thuat ngu CHUAN pho bien, khong phai chu
// hiem can dò), dung chinh TIEU DE THAT (dong "#", mau bieu BAT BUOC lap lai
// nguyen ten bang KEM "(Tiếp theo)" moi khi ngat trang - quy dinh chung,
// khong doi theo cong ty) lam tin hieu phan loai cho bang con ngay sau no -
// tin cay hon han vi khong phu thuoc bang con do viet chu gi ben trong.
const CONTINUATION_HEADING_MARKERS: { key: keyof FinancialStatements; test: (normalizedLine: string) => boolean }[] = [
  { key: 'balanceSheet', test: (l) => (l.includes('BANG CAN DOI KE TOAN') || l.includes('BAO CAO TINH HINH TAI CHINH')) && l.includes('TIEP THEO') },
  { key: 'incomeStatement', test: (l) => l.includes('KET QUA HOAT DONG') && l.includes('TIEP THEO') },
  { key: 'cashFlow', test: (l) => l.includes('LUU CHUYEN TIEN TE') && l.includes('TIEP THEO') },
];

interface ParsedTable extends StatementTable {
  incomeStatementPart?: IncomeStatementPart;
  // Bang con nay dung NGAY SAU 1 tieu de that dang "(Tiếp theo)" khop 1
  // trong 3 mau bieu tren - uu tien hon classifyTableByContent (xem
  // parseStatementsFromMarkdown) vi day la tin hieu CAU TRUC on dinh, khong
  // phu thuoc wording cua tung dong ben trong bang con.
  continuationKey?: keyof FinancialStatements;
  // Cot nhan/Ma so CUA RIENG bang con nay (co the khac vi tri/ten giua cac
  // bang con cua CUNG 1 bang chinh - xem comment o alignRowToColumns).
  labelIndex: number;
  maSoIndex: number;
  // SUA 2026-07-16 (phan hoi nguoi dung, xac nhan qua MIG that): pham vi
  // DONG THO ([startLineIndex, endLineIndex)) bang nay chiem trong markdown
  // goc - dung de gan CUNG cashFlow cho bang chua dung DONG da duoc
  // findCashFlowEndingIndex xac dinh CHAC CHAN la dong ket thuc LCTT (xem
  // parseStatementsFromMarkdown) - uu tien hon ca continuationKey lan diem
  // noi dung, vi day la SUY LUAN TRUC TIEP tu chinh tin hieu da dung de tinh
  // diem cat, khong phai do lai tu dau bang 1 bo marker khac (co the hoa diem).
  startLineIndex: number;
  endLineIndex: number;
}

// Tim TAT CA bang markdown ("header" + dong phan cach "---" + cac dong du
// lieu) trong 1 pham vi dong cho truoc.
function parseAllTablesInRange(lines: string[]): ParsedTable[] {
  const tables: ParsedTable[] = [];
  let currentIncomeStatementPart: IncomeStatementPart | undefined;
  // Chi ap dung cho bang NGAY SAU tieu de "(Tiếp theo)" - reset ve undefined
  // ngay sau khi gan cho 1 bang (khac currentIncomeStatementPart, ton tai
  // xuyen suot nhieu bang: tieu de "(Tiếp theo)" chi mo ta CHINH bang di
  // ngay sau no, khong phai moi bang con lai cua tai lieu).
  let pendingContinuationKey: (keyof FinancialStatements) | undefined;
  let i = 0;
  while (i < lines.length) {
    const headerCells = splitMarkdownRow(lines[i]);
    if (!headerCells) {
      if (looksLikeHeadingLine(lines[i])) {
        const normalized = normalizeLabelText(lines[i]);
        const marker = INCOME_STATEMENT_PART_MARKERS.find((m) => m.test(normalized));
        if (marker) currentIncomeStatementPart = marker.part;
        const continuationMarker = CONTINUATION_HEADING_MARKERS.find((m) => m.test(normalized));
        if (continuationMarker) pendingContinuationKey = continuationMarker.key;
      }
      i++;
      continue;
    }
    const nextCells = i + 1 < lines.length ? splitMarkdownRow(lines[i + 1]) : null;
    if (!nextCells || !isSeparatorRow(nextCells)) {
      i++;
      continue;
    }
    // SUA 2026-07-16 (FTS that): 1 dong DU LIEU THAT (vd "2. Chênh lệch đánh
    // giá... | 412 | ...") tinh co bi 1 dong phan cach "---" gia (Mistral OCR
    // tu chen sau khi 1 con dau/watermark bi doc thanh rac lam gian doan bang
    // dang doc, xem vong lap ben duoi) theo ngay sau no - khop dung dieu kien
    // "header + separator" o tren, bi hieu NHAM la tieu de 1 bang MOI, lam
    // toan bo cac cot cua no (bao gom ca CHINH dong du lieu nay) bi dung lam
    // TEN COT thay vi noi dung, hong het ca bang. Mot dong tieu de THAT (ten
    // cot) khong bao gio chua 1 o la ma so TRAN (vd "412" - dung 2-4 chu so,
    // khop MA_SO_PATTERN) - day CHI co the la du lieu.
    //
    // SUA TIEP 2026-07-16 (MCH that): truoc day khi phat hien truong hop nay
    // chi bo qua (i++), gay MAT TRANG ca bang (vd doan "hoat dong tai chinh"
    // + chuoi ket thuc LCTT 50->60->70 cua MCH - markdown goc THIEU HAN dong
    // tieu de that, nhay thang vao du lieu, dau phan cach "---" nam SAU dong
    // du lieu dau tien thay vi sau tieu de - cau truc bang van CO THAT, chi
    // thieu ten cot). Thay vi bo qua, KHOI PHUC: dung CHINH dong bi tu choi
    // nay lam DONG DU LIEU DAU TIEN (khong phai tieu de), header dung placeholder
    // rong (cung do dai) - cac ham doc noi dung (findLabelColumnIndex,
    // classifyTableByContent...) van hoat dong dung vi CHI dua vao NOI DUNG
    // dong, khong dua vao ten cot that.
    const headerLooksLikeData = headerCells.some((c) => MA_SO_PATTERN.test(c.trim()));

    // KQKD Quy thuong co header 2 DONG: dong 1 la nhom ky ("Quy nay"/"Luy ke
    // tu dau nam...", header markdown THAT SU), dong 2 la "Nam nay VND"/"Nam
    // truoc VND" duoi tung nhom - nhung Mistral xuat 2 dong nay THANH 2 dong
    // markdown RIENG (dong 2 bi coi la DONG DU LIEU DAU TIEN, khong phai
    // header) thay vi gop lai. Neu khong gop, headerCells CHI co "Quy
    // nay"/"Luy ke..." ma KHONG BIET cot nao la nam nay/nam truoc trong tung
    // nhom - trong khi THU TU 2 nhom Nam nay/Nam truoc trong MOI cot GIA TRI
    // (Quy nay/Luy ke) co the KHAC NHAU giua cac cong ty (da xac nhan user
    // 2026-07-11: co cty in Quy nay->Cung ky->Luy ke nay->Luy ke truoc, co
    // cty lai in Quy nay->Luy ke nay->Cung ky->Luy ke truoc) - buoc PHAI biet
    // ca 2 tin hieu (nhom ky TU header dong 1, nam nay/truoc TU header dong
    // 2) gop lai moi xac dinh dung cot bat ke thu tu, xem
    // incomeStatementPeriodColumns (lib/analysis.ts). Nhan dien dong 2:
    // KHONG co nhan (o dau trong) VA MOI o con lai (neu co) deu CHI chua
    // "Nam nay"/"Nam truoc" (khong phai so lieu/nhan chi tieu that). Bo qua
    // toan bo buoc gop nay khi headerLooksLikeData (khong co tieu de that de gop).
    let effectiveHeaderCells = headerLooksLikeData ? headerCells.map(() => '') : headerCells;
    const peekCells = i + 2 < lines.length ? splitMarkdownRow(lines[i + 2]) : null;
    let headerRowCount = 2;
    if (!headerLooksLikeData && peekCells && looksLikePeriodSubHeaderRow(peekCells)) {
      // "Quy nay"/"Luy ke..." o dong 1 THUONG chi ghi 1 lan o O DAU TIEN cua
      // nhom (o thu 2 tro di cua CUNG nhom de trong - markdown the hien 1 o
      // gop truc quan bang nhieu o rong lien tiep) - dien tiep (forward-fill)
      // TU o co chu GAN NHAT sang cac o trong ngay sau, CHI trong pham vi
      // dong nay (truoc khi gop voi dong 2), de "Quy nay"/"Luy ke..." lan
      // toi CA 2 cot con (Nam nay/Nam truoc) cua nhom do thay vi chi 1 cot.
      let lastGroupLabel = '';
      const filledHeaderCells = headerCells.map((c) => {
        if (c.trim() !== '') {
          lastGroupLabel = c;
          return c;
        }
        return lastGroupLabel;
      });
      effectiveHeaderCells = filledHeaderCells.map((c, idx) =>
        [c, peekCells[idx] ?? ''].filter((s) => s.trim() !== '').join(' ').trim()
      );
      headerRowCount = 3;
    }

    const rawRows: string[][] = headerLooksLikeData ? [headerCells] : [];
    let j = i + headerRowCount;
    let skipRun = 0;
    while (j < lines.length) {
      // Mistral noi cac trang bang "\n\n" - 1 dong trong ngan giua 2 trang
      // KHONG co nghia la bang da het (da gap that voi TIX: 1 dong trong duy
      // nhat o ranh gioi trang khien bang bi cat som, roi dong ngay sau do -
      // vo tinh co dau "---" theo sau - bi hieu nham thanh header cua 1 bang
      // MOI, lam mat han dong do khoi du lieu that). Cho phep "di xuyen" qua
      // toi da 2 dong trong/rac lien tiep truoc khi ket luan bang da het.
      //
      // Rac o day KHONG CHI la dong trong - da gap that voi IDV (2026-07-08,
      // OCR probe that qua Mistral): dong footer so trang don doc (vd "Trang
      // 4") chen GIUA 2 trang, KHONG di kem dong trong nao ca, tung lam gian
      // doan ngay lap tuc (truoc day chi "!rowCells" la break thang, khong co
      // khoan dung nao) - roi dong DU LIEU that ngay sau do (vd "19. Loi
      // nhuan sau thue...") vo tinh duoc theo sau boi 1 dong phan cach "---"
      // (Mistral tu chen phan cach nay o MOI trang moi, coi dong dau tien cua
      // trang la "tieu de"), bi hieu nham thanh HEADER cua 1 bang hoan toan
      // moi - lam mat trang ca dong do lan cac dong theo sau (khong con tu
      // khoa dac trung nao de classifyTableByContent nhan dung bang). Gop
      // chung dong trong VA dong rac (khong parse duoc thanh hang bang) vao 1
      // bo dem, cho phep toi da 2 dong loai nay truoc khi ket luan bang het that.
      //
      // NANG NGUONG 3 -> 12 (2026-07-16, FTS that): con dau/watermark cong ty
      // (anh de len giua bang) co the bi Mistral OCR thanh CA CHUC dong ky tu
      // vun vat lien tiep (vd "01-"/"ỒNG"/"Ồ PH"/"NG"/"FP"/"Ồ T" - 10 dong rac
      // giua 2 dong du lieu that "1.5. Cổ phiếu quỹ" ma 411.5 va "2. Chênh
      // lệch đánh giá..." ma 412) - vuot xa nguong 3 dong cu, khien bang bi
      // cat NGANG giua chung, mat han phan con lai (Loi nhuan chua phan phoi,
      // Tong cong nguon von...). Van GIU CO GIOI HAN (khong bo han) - tranh
      // nuot nham 1 doan van ban/thuyet minh THAT SU dai giua 2 bang khac
      // nhau thanh 1 bang duy nhat; ket hop voi guard "tu choi dong DU LIEU
      // gia lam header" o vong ngoai (xem MA_SO_PATTERN o tren) de dong dau
      // tien sau doan rac van duoc nhan dung la tiep tuc CHINH bang nay, khong
      // bi tach thanh bang moi.
      if (lines[j].trim() === '') {
        skipRun++;
        if (skipRun > 12) break;
        j++;
        continue;
      }
      // Tieu de muc THAT (vd "# **CÁC CHỈ TIÊU NGOÀI BÁO CÁO...**", luon bat
      // dau bang "#" trong markdown Mistral tra ve - da xac nhan qua moi tieu
      // de muc that trong tai lieu) la ranh gioi CHAC CHAN, khac han rac
      // watermark (khong bao gio bat dau bang "#") - dung NGAY, khong tinh
      // vao nguong 12 dong o tren, tranh nuot nham CA 1 bang khac (vd bang
      // ngoai BCTC ngay sau BCDKT) vao chinh bang dang doc do nguong da nang.
      if (lines[j].trim().startsWith('#')) break;
      const rowCells = splitMarkdownRow(lines[j]);
      if (!rowCells) {
        skipRun++;
        if (skipRun > 12) break;
        j++;
        continue;
      }
      skipRun = 0;
      if (isSeparatorRow(rowCells)) {
        j++; // dong phan cach GIA chen giua bang (ngat trang) - bo qua, khong phai du lieu that
        continue;
      }
      rawRows.push(rowCells);
      j++;
    }
    // Header bi NGAT TRANG giua bang co the CHI lap lai cac cot GIA TRI o
    // cuoi (bo sot han cot STT/nhan o dau) - da gap that VCB Q1/2026
    // (2026-07-12): bang "Cac chi tieu ngoai BCTC" cua Ngan hang nam LIEN
    // TIEP sau BCDKT, dong header lap lai giua trang chi con "| Thuyet minh |
    // 31/3/2026 | 31/12/2025 |" (3 cot) trong khi MOI dong du lieu van du 5 o
    // (STT/Nhan/Thuyet minh/2 cot gia tri) - realignRowByContent (thiet ke cho
    // lech 1 cot don le) khong du cho lech DEN 2 cot he thong nhu the nay, dem
    // GOP NHAM 1 trong 2 cot gia tri that vao vi tri Thuyet minh, day cot gia
    // tri con lai (dau ky) ra NGOAI PHAM VI header, bi ROI MAT hoan toan - sai
    // ca 2 cot gia tri (khong phai null, la SO SAI trong nhu dung). Neu da so
    // dong du lieu (qua nua) DEU dai hon header 1 luong CO DINH, suy ra header
    // that su phai rong hon - bu them cot RONG o DAU (STT/nhan luon o dau, gia
    // tri luon o cuoi - xem quy uoc trailing-align o alignRowToColumns duoi).
    if (rawRows.length > 0) {
      const rowLengthCounts = new Map<number, number>();
      for (const row of rawRows) rowLengthCounts.set(row.length, (rowLengthCounts.get(row.length) ?? 0) + 1);
      let dominantLength = effectiveHeaderCells.length;
      let dominantCount = 0;
      for (const [len, count] of rowLengthCounts) {
        if (count > dominantCount) {
          dominantCount = count;
          dominantLength = len;
        }
      }
      if (dominantLength > effectiveHeaderCells.length && dominantCount > rawRows.length / 2) {
        const missing = dominantLength - effectiveHeaderCells.length;
        effectiveHeaderCells = [...new Array(missing).fill(''), ...effectiveHeaderCells];
      }
    }
    // Tinh labelIdx SAU KHI da doc het dong tho cua bang (khong con truoc do
    // nua) - can du lieu mau de content-scoring hoat dong khi header khong dat
    // ten cot nhan ro rang (xem findLabelColumnIndex, statement-shared.ts).
    const labelIdx = findLabelColumnIndex(effectiveHeaderCells, rawRows);
    const namedMaSoIdx = effectiveHeaderCells.findIndex((c) => normalizeLabelText(c).includes('MA SO'));
    // "Ma so" trung vi tri voi nhan (labelIdx) nghia la header nay THIEU 1 cot
    // (nhan chua tung duoc dat ten rieng, header gan nham ten "Ma so" vao dung
    // vi tri du lieu that la nhan) - da gap that MBS Q2/2026 (2026-07-11): 1
    // trang KQKD OCR ra header 7 cot thay vi 8 nhu cac trang con lai cung
    // bang, thieu dung 1 cot "trong" giua STT va "Ma so". KHONG the tin ten
    // cot "Ma so" luc nay (thuc te dang tro vao dung vi tri nhan, se de
    // realignRowByContent() ghi de "Ma so" LEN TREN nhan, xoa mat nhan that -
    // da xac nhan qua debug that). Suy ra vi tri "Ma so" THAT SU = ngay SAU
    // nhan (quy uoc quan sat duoc o MOI bang da doi chieu: ma so luon nam sat
    // canh nhan, khong bao gio cach xa).
    const maSoIdx = namedMaSoIdx === labelIdx ? labelIdx + 1 : namedMaSoIdx;
    // Cot "Ma so" cung KHONG duoc parseNumericCell (giu nguyen la chuoi, giong
    // cot nhan) - da gap that (2026-07-11): ma so con (vd "212.1"/"01.1", co
    // dau cham) bi parseNumericCell noi lien thanh 1 SO SAI (vd "2121"/"11" -
    // xoa mat dau cham), vua hien SAI trong Excel xuat ra vua lam mat tin hieu
    // "co dau cham = muc con, da gop vao dong cha" can cho
    // findUnreliableIncomeStatementCells (statement-shared.ts) phan biet dong
    // CHI TIET CAP 1 (can cong) voi muc con long ben trong 1 chi tieu khac
    // (khong duoc cong lai, tranh dem 2 lan).
    const rows = rawRows.map((rowCells) => {
      const realigned = realignRowByContent(rowCells, effectiveHeaderCells, labelIdx, maSoIdx);
      return realigned.map((cell, idx) => (idx === labelIdx || idx === maSoIdx || cell === null ? cell : parseNumericCell(cell)));
    });
    tables.push({
      columns: effectiveHeaderCells,
      rows,
      incomeStatementPart: currentIncomeStatementPart,
      continuationKey: pendingContinuationKey,
      labelIndex: labelIdx,
      maSoIndex: maSoIdx,
      startLineIndex: i,
      endLineIndex: j,
    });
    pendingContinuationKey = undefined; // chi ap dung cho DUNG bang vua tao, khong lan sang bang tiep theo
    i = j;
  }
  return tables;
}

// Bang can doi ke toan VAS thuong bi Mistral tach thanh 2 bang markdown RIENG
// trong cung 1 muc (1 bang "TAI SAN" mã 100-270, roi 1 bang "NGUON VON" mã
// 300-440 o trang sau, vi 2 nua co tieu de cot dau khac nhau) - da gap that
// voi TIX: neu chi lay 1 bang "dai nhat" se mat het nua con lai (mat ca mã
// 270, 300, 400, 440). Gop TAT CA bang tim duoc trong pham vi muc lai, bo qua
// cac bang qua ngan (<3 dong, thuong la bang phu nhu "Co cau von dieu le" o
// trang bia, khong phai bang chinh).
// Dung boi lib/export/financial-statements.ts (OCR THEO LO qua Mistral cho
// bao cao scan dai, xem lib/pdf-text.ts needsOcrProbe) de biet KHI NAO dung
// gui them lo trang tiep theo - da thay tieu de "Thuyet minh" tuc la 3 bang
// chinh da nam TRON trong markdown gom duoc, khong can OCR them trang nao
// nua. Dung chung 1 logic voi diem chan cashFlow trong parseStatementsFromMarkdown
// duoi (khong dinh nghia lai fuzzy-match rieng - Mistral OCR do chinh xac cao,
// khop chuoi thang la du).
export function containsNotesSectionMarker(markdown: string): boolean {
  const lines = markdown.split(/\r?\n/);
  return findCashFlowEndingIndex(lines, 0) !== -1;
}

export function parseStatementsFromMarkdown(markdown: string): FinancialStatements {
  const lines = markdown.split(/\r?\n/);
  const normalizedLines = lines.map((l) => normalizeLabelText(l));

  // Cat truoc "Thuyet minh" neu co - cac bang phu BEN TRONG Thuyet minh (vd
  // thuyet minh chi tiet "Phai thu ngan han cua khach hang" liet ke tung doi
  // tac) van co the trung tu khoa noi dung o duoi, se bi nham la BCDKT/KQKD
  // that neu khong cat truoc. Neu dau vao CHI la pham vi truoc Thuyet minh
  // (buoc "Tai BCTC" thong thuong), khong tim thay dong nao ca - giu nguyen ca
  // markdown.
  //
  // QUAN TRONG: trang bia theo mau MOI (Thong tu 99/2025) liet ke ten ca 4
  // bang (ke ca "Thuyet minh bao cao tai chinh") o dang danh sach thuong (vd
  // "4 - Thuyết minh báo cáo tài chính (Mẫu số: B09a – DN)"), y het van de da
  // gap voi cac tieu de bang khac (xem comment o tren) - neu khop dong nay se
  // cat mat CA phan noi dung that con o phia sau, bao ca 3 bang ve rong. Chi
  // chap nhan diem cat nam SAU dong dau tien co tu khoa noi dung THAT SU
  // (nam trong 1 bang, khong phai dang liet ke ten bang) - dam bao da qua
  // khoi trang bia/muc luc.
  // CHI tinh la "dong noi dung that" khi dong do la 1 HANG BANG markdown that
  // su (splitMarkdownRow khac null: bat dau/ket thuc bang "|") - KHONG chi can
  // khop chuoi tren BAT KY dong nao. Da gap that (SHS Q1/2026, 2026-07-12):
  // cong van cong bo thong tin (van xuoi, dung TRUOC ca trang bia/muc luc BCTC)
  // co cau "Loi nhuan sau thue thu nhap doanh nghiep tai Bao cao ket qua kinh
  // doanh Quy 1 nam 2026 giam 12%..." - TINH CO chua dung nguyen van marker
  // "LOI NHUAN SAU THUE THU NHAP DOANH NGHIEP", khien firstContentLine khop
  // qua SOM (dong van xuoi, khong phai dong bang that). Dieu do lam "mo khoa"
  // qua som cho notesLine chap nhan dong muc luc "Bao cao tinh hinh bien dong
  // von chu so huu" (chi la TEN liet ke trong "NOI DUNG", khong phai noi dung
  // Thuyet minh that) lam diem cat, xoa mat CA 3 bang that phia sau (0 dong ca
  // BCDKT/KQKD/LCTT). Yeu cau dong phai la hang bang that moi tinh, giong nguyen
  // tac da ap dung cho looksLikeHeadingLine/MAX_HEADING_LINE_LENGTH o tren (loai
  // cau van xuoi dai tinh co trung tu khoa).
  const allContentMarkers = CONTENT_MARKERS_BY_KEY.flatMap(({ markers }) => markers);
  const firstContentLine = lines.findIndex(
    (line, i) => splitMarkdownRow(line) !== null && allContentMarkers.some((m) => matchesContentMarker(normalizedLines[i], m))
  );
  const cashFlowEndingIndex = findCashFlowEndingIndex(lines, firstContentLine === -1 ? 0 : firstContentLine);
  const notesLine = cashFlowEndingIndex !== -1 ? cashFlowEndingIndex + 1 : -1;
  const relevantLines = notesLine !== -1 ? lines.slice(0, notesLine) : lines;

  // Tim TAT CA bang markdown trong pham vi, roi gan MOI bang vao 1 trong 3
  // bang chinh theo NOI DUNG cua no (xem classifyTableByContent o tren) - KHONG
  // con dua vao tieu de dung truoc bang. Bang can doi ke toan VAS thuong bi
  // Mistral tach thanh 2 bang markdown RIENG (1 bang "TAI SAN" mã 100-270, 1
  // bang "NGUON VON" mã 300-440 o trang sau, vi 2 nua co tieu de cot dau khac
  // nhau) - moi nua van tu co du tu khoa dac trung rieng (vd nua NGUON VON co
  // "VON CHU SO HUU"/"TONG CONG NGUON VON") nen van duoc gan dung key du parse
  // rieng ra 2 bang, roi gop lai o duoi. Bo qua cac bang qua ngan (<3 dong,
  // thuong la bang phu nhu "Co cau von dieu le" o trang bia) - TRU KHI bang do
  // van khop RO RANG 1 key noi dung (xem SUA 2026-07-15 duoi).
  //
  // SUA 2026-07-15 (theo phan hoi nguoi dung, xac nhan qua markdown OCR THAT
  // CTG Q1/2026): dong "VII. Tiền và các khoản tương đương tiền tại thời
  // điểm cuối kỳ" (dong ket thuc LCTT that su) nam MOT MINH trong 1 bang
  // markdown CHI CO 1 DONG DU LIEU (Mistral tach rieng do ngat trang, dung
  // ngay sau tieu de that "BÁO CÁO LƯU CHUYỂN TIỀN TỆ HỢP NHẤT (Tiếp theo)")
  // - bi loai boi dieu kien "<3 dong" TRUOC CA KHI kip cham diem noi dung.
  // THU dung classifyTableByContent lam dieu kien giu lai (dua vao tu khoa
  // BEN TRONG bang), nhung dong nay tinh co khop CA marker LCTT ("cuoi ky")
  // LAN marker BCDKT ("Tien va cac khoan tuong duong tien" - ten 1 khoan muc
  // tai san chuan) -> hoa diem -> van tra null -> van bi loai. Doi han sang
  // dung continuationKey (tu tieu de that "(Tiếp theo)" ngay truoc bang, xem
  // CONTINUATION_HEADING_MARKERS) lam dieu kien giu/gan key CHINH - tin cay
  // hon nhieu vi KHONG phu thuoc bang con viet chu gi ben trong (mau bieu
  // BAT BUOC lap lai dung ten + "(Tiếp theo)" khi ngat trang, khong doi theo
  // tung cong ty/each ky viet tat khac nhau).
  // SUA 2026-07-16 (phan hoi nguoi dung, xac nhan qua MIG that): neu bang
  // con nay CHUA CHINH dong da duoc findCashFlowEndingIndex xac dinh CHAC
  // CHAN la diem ket thuc LCTT (dung de tinh notesLine o tren), no LA
  // cashFlow - khong can (va khong nen) cham diem lai tu dau bang
  // classifyTableByContent, vi tin hieu do co the hoa diem voi BCDKT (chinh
  // dong "cuoi ky" luon chua ca cum "tien va cac khoan tuong duong tien",
  // trung marker BCDKT) roi bi loai oan. Day la SUY LUAN TRUC TIEP tu chinh
  // tin hieu da dung o tren, dang tin cay hon ca continuationKey (khong phu
  // thuoc co tieu de "(Tiếp theo)" hay khong - MIG lap lai tieu de KHONG kem
  // "(Tiếp theo)" nen continuationKey khong giup duoc truong hop nay).
  const definiteCashFlowTable = (t: ParsedTable): boolean =>
    cashFlowEndingIndex !== -1 && cashFlowEndingIndex >= t.startLineIndex && cashFlowEndingIndex < t.endLineIndex;

  const tables = parseAllTablesInRange(relevantLines).filter(
    (t) => t.rows.length >= 3 || t.continuationKey !== undefined || definiteCashFlowTable(t) || classifyTableByContent(t) !== null
  );

  const grouped: Record<keyof FinancialStatements, ParsedTable[]> = {
    balanceSheet: [],
    incomeStatement: [],
    cashFlow: [],
    offBalanceSheet: [],
  };
  for (const table of tables) {
    const key = table.continuationKey ?? (definiteCashFlowTable(table) ? 'cashFlow' : classifyTableByContent(table));
    if (key) grouped[key].push(table);
  }

  const result: FinancialStatements = {
    balanceSheet: { columns: [], rows: [] },
    incomeStatement: { columns: [], rows: [] },
    cashFlow: { columns: [], rows: [] },
    offBalanceSheet: { columns: [], rows: [] },
  };
  for (const key of ['balanceSheet', 'incomeStatement', 'cashFlow', 'offBalanceSheet'] as const) {
    // KQKD bao hiem: uu tien Phan II (chi tiet theo hoat dong) - loai het bang
    // Phan I (tong hop) khoi ket qua khi Phan II thuc su co mat (yeu cau user
    // 2026-07-11, xem comment INCOME_STATEMENT_PART_MARKERS o tren). Bao cao
    // KHONG co Phan II (khong phai mau bao hiem, hoac OCR khong bat duoc Phan
    // II) thi giu nguyen hanh vi cu - khong loai gi ca.
    const hasDetailPart = key === 'incomeStatement' && grouped[key].some((t) => t.incomeStatementPart === 'detail');
    const matchedTables = hasDetailPart ? grouped[key].filter((t) => t.incomeStatementPart !== 'summary') : grouped[key];
    if (matchedTables.length > 0) {
      const { columns, labelIndex, maSoIndex } = mostCommonColumns(matchedTables);
      result[key] = {
        columns,
        rows: matchedTables.flatMap((t) =>
          t.rows.map((row) => alignRowToColumns(row, t.labelIndex, t.maSoIndex, columns.length, labelIndex, maSoIndex))
        ),
      };
    }
  }

  return result;
}

// Gop cac bang con (nhieu trang cua CUNG 1 bang chinh) co the LECH so cot -
// da gap that nhieu lan (insurance Phan I/Phan II thieu han 1 cot; CTCK MBS
// 2026-07-11 ca hai chieu: mot trang thua 1 cot trong, mot trang khac lai
// THIEU 1 cot rieng cho nhan). Khop THEO TEN khong dang tin cay cho cac cot
// KHONG dat ten ("") vi 1 bang co the co NHIEU cot "" (STT, nhan, cac o
// trong giua 2 cot gia tri...) - findIndex() luon khop vao cot "" DAU TIEN,
// lam nhieu cot dich cung tro ve 1 cot nguon, nhan doi du lieu.
//
// Thay vao do, dung 2 "moc neo" DA TINH SAN cho tung bang con (labelIndex,
// maSoIndex - xem findLabelColumnIndex/parseAllTablesInRange, co xet ca noi
// dung chu khong chi ten cot) de xac dinh CHINH XAC 2 cot quan trong nhat
// (nhan, ma so) bat ke ten cot that su la gi. PHAN CON LAI (Thuyet minh + cac
// cot gia tri, luon nam SAU ma so va theo dung thu tu tu trai qua phai) duoc
// canh theo DUOI (trailing-align, giong huong xu ly "valueSlots.slice(-N)"
// da dung trong realignRowByContent) - vi cac cot gia tri LUON o cuoi header
// va thu tu giua chung khong doi, chi so luong cot metadata (Thuyet minh) o
// GIUA moi co the khac nhau giua cac trang.
function alignRowToColumns(
  row: (string | number | null)[],
  sourceLabelIndex: number,
  sourceMaSoIndex: number,
  targetLength: number,
  targetLabelIndex: number,
  targetMaSoIndex: number
): (string | number | null)[] {
  if (row.length === targetLength && sourceLabelIndex === targetLabelIndex && sourceMaSoIndex === targetMaSoIndex) {
    return row;
  }

  const result: (string | number | null)[] = new Array(targetLength).fill(null);
  result[targetLabelIndex] = row[sourceLabelIndex] ?? null;
  if (targetMaSoIndex !== -1) result[targetMaSoIndex] = sourceMaSoIndex === -1 ? null : row[sourceMaSoIndex] ?? null;

  // Cac cot DUNG TRUOC nhan/ma so (thuong la STT) cung can duoc canh lai -
  // truoc day bi BO SOT hoan toan (chi xu ly nhan/ma so + phan trailing),
  // khien STT LUON bi xoa thanh null moi khi 1 trang can canh lai cot. Hau
  // qua: isLikelySubtotalRow (dua vao STT rong = dong tong) hieu NHAM moi
  // dong chi tiet la dong tong, lam rong memberRowIndexes va bo sot kiem tra
  // cheo (vd nhom "Cong doanh thu hoat dong" cua MBS Q2/2026). Canh theo DAU
  // doan leading (STT luon sat truoc nhan/ma so) tuong tu cach canh trailing.
  const sourceLeadingEnd = sourceMaSoIndex === -1 ? sourceLabelIndex : Math.min(sourceLabelIndex, sourceMaSoIndex);
  const targetLeadingEnd = targetMaSoIndex === -1 ? targetLabelIndex : Math.min(targetLabelIndex, targetMaSoIndex);
  const sourceLeading = row.slice(0, sourceLeadingEnd);
  const targetLeadingSlots = Array.from({ length: targetLeadingEnd }, (_, i) => i);
  const nLead = Math.min(sourceLeading.length, targetLeadingSlots.length);
  targetLeadingSlots.slice(-nLead).forEach((slot, k) => {
    result[slot] = sourceLeading.slice(-nLead)[k];
  });

  const sourceTrailingStart = Math.max(sourceLabelIndex, sourceMaSoIndex) + 1;
  const targetTrailingStart = Math.max(targetLabelIndex, targetMaSoIndex) + 1;
  const sourceTrailing = row.slice(sourceTrailingStart);
  const targetTrailingSlots = Array.from({ length: targetLength - targetTrailingStart }, (_, i) => targetTrailingStart + i);
  const n = Math.min(sourceTrailing.length, targetTrailingSlots.length);
  // Lay N cot CUOI CUNG cua ca 2 ben (cot gia tri luon o cuoi) - neu 1 ben co
  // nhieu cot "giua" hon (vd Thuyet minh co o ben nay, khong co o ben kia),
  // phan du o DAU doan trailing se tu dong bi bo qua (van giu null) thay vi
  // lam lech cac cot gia tri that o cuoi.
  targetTrailingSlots.slice(-n).forEach((slot, k) => {
    result[slot] = sourceTrailing.slice(-n)[k];
  });

  return result;
}

// Chon bo cot CHUAN de gop cac bang con: lay bo cot XUAT HIEN NHIEU LAN NHAT
// (theo TEN da normalize), KHONG con lay bo "RONG NHAT" nhu truoc - da gap
// that CTCK (MBS 2026-07-11): 1 trang KQKD le OCR ra THEM 1 cot trong du thua
// (2 cot "" lien tiep thay vi 1, co le loi render trang cua Mistral) rong hon
// het cac trang con lai CUNG bang - neu lay "rong nhat" se chon NHAM bo cot
// LE nay lam chuan. Da xac nhan qua doi chieu that: bo cot LAP LAI nhieu lan
// nhat (vd 5-6 trang deu dung 1 kieu 5-cot) moi la bo cot CHUAN THAT SU cua ca
// bang, chi 1 trang le dung kieu khac la loi OCR cuc bo. Hoa nhau ve so lan
// (vd insurance Phan I/Phan II - moi ben CHI xuat hien 1 lan) thi uu tien bo
// RONG hon (giu dung hanh vi cu cho truong hop nay).
function mostCommonColumns(tables: ParsedTable[]): { columns: string[]; labelIndex: number; maSoIndex: number } {
  const counts = new Map<string, { count: number; columns: string[]; labelIndex: number; maSoIndex: number }>();
  for (const table of tables) {
    const key = table.columns.map((c) => normalizeLabelText(c)).join('|');
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { count: 1, columns: table.columns, labelIndex: table.labelIndex, maSoIndex: table.maSoIndex });
  }
  let best: { count: number; columns: string[]; labelIndex: number; maSoIndex: number } = {
    count: 0,
    columns: tables[0].columns,
    labelIndex: tables[0].labelIndex,
    maSoIndex: tables[0].maSoIndex,
  };
  for (const entry of counts.values()) {
    if (entry.count > best.count || (entry.count === best.count && entry.columns.length > best.columns.length)) {
      best = entry;
    }
  }
  return { columns: best.columns, labelIndex: best.labelIndex, maSoIndex: best.maSoIndex };
}

// Chuan hoa markdown Mistral tra ve thanh dang van ban ma lib/export/pdf.ts da
// ky vong cho phan "Toan van bao cao" (xem drawNotesTableLine): dong dang bang
// la "nhan | gia_tri1 | gia_tri2" - KHONG co dau "|" o dau/cuoi dong (khac voi
// markdown chuan cua Mistral, luon co "|" bao quanh ca 2 dau).
export function cleanMarkdownForPdfText(markdown: string): string {
  return markdown
    .split(/\r?\n/)
    .filter((line) => !/^!\[img-\d+\.\w+\]/.test(line.trim())) // bo dong placeholder anh (khong co du lieu anh that, include_image_base64: false)
    .map((line) => {
      let cleaned = line.replace(/\*\*/g, '').replace(/^#+\s*/, '');
      const trimmed = cleaned.trim();
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        if (cells.every((c) => /^:?-+:?$/.test(c) || c === '')) return ''; // dong phan cach bang markdown ("| --- | --- |")
        cleaned = cells.join(' | ');
      }
      return cleaned;
    })
    .join('\n');
}
