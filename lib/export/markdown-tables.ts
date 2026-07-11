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
// vao vi cung co the trung tu khoa noi dung (xem classifyTableByContent).
// Test that: dong chan trang lap "Cac thuyet minh la MOT BO PHAN KHONG TACH
// ROI cua Bao cao tai chinh nay" KHONG khop chuoi lien tiep "THUYET MINH BAO
// CAO TAI CHINH" (co chen them tu o giua) nen khong bi nham voi tieu de
// chuong that.
//
// Cong ty CHUNG KHOAN (CTCK, Mau B04a-CTCK) co THEM 1 bao cao "Bao cao tinh
// hinh bien dong von chu so huu" nam GIUA cashFlow va Thuyet minh - bang nay
// KHONG thuoc 3 bang app dang xuat (balanceSheet/incomeStatement/cashFlow) nen
// phai chan dung TRUOC no, khong thi no bi lan vao ket qua.
const NOTES_SECTION_MARKERS = ['THUYET MINH BAO CAO TAI CHINH', 'THUYET MINH BCTC', 'BIEN DONG VON CHU SO HUU'];

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

// CHI dung cho diem cat "Thuyet minh"/"Bien dong von chu so huu"
// (NOTES_SECTION_MARKERS) - KHAC voi looksLikeHeadingLine() o tren (van giu
// nguyen cho cac cho khac). Tieu de that cua bang "Bao cao tinh hinh bien
// dong von chu so huu" (CTCK, Mau B04a-CTCK) hay bi Mistral noi LIEN vao doan
// ngay thang phia sau, DOI KHI khong co ca khoang trang (da gap that SSI/MBS
// 2026-07-11: "...NAM 2026cho ky ke toan ket thuc ngay...", dai 85-115 ky tu)
// - neu doi hoi CA DONG (ke ca doan ngay noi them) phai ngan nhu
// looksLikeHeadingLine se BO SOT tieu de that, khong chan dung bang nay truoc
// Thuyet minh, lam no ro ri vao BCDKT (nhieu dong chi tieu Von CSH trung ten
// voi phan Von CSH cua BCDKT that, gay sai lech nghiem trong - vd tat ca chi
// tieu BCDKT tra ve null vi bi gop nham cot voi bang 9-10 cot nay). Chi doi
// hoi tu khoa xuat hien XONG (ket thuc) trong MAX_HEADING_LINE_LENGTH ky tu
// DAU dong, khong doi hoi toan bo dong phai ngan - van du chat de loai cau
// van xuoi dai trong Thuyet minh (tu khoa thuong nam GIUA cau, xa vi tri dau).
function containsHeadingMarkerNearStart(rawLine: string, markers: string[]): boolean {
  const trimmed = rawLine.trim();
  if (trimmed.length === 0 || trimmed.startsWith('|')) return false;
  const normalized = normalizeLabelText(trimmed);
  return markers.some((m) => {
    const index = normalized.indexOf(m);
    return index !== -1 && index + m.length <= MAX_HEADING_LINE_LENGTH;
  });
}

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

const NUMERIC_LIKE_PATTERN = /^\(?-?[\d.,\s]+\)?$/;

function parseNumericCell(value: string): string | number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!NUMERIC_LIKE_PATTERN.test(trimmed) || !/\d/.test(trimmed)) return trimmed;
  const isNegative = trimmed.startsWith('(') || trimmed.startsWith('-');
  const digitsOnly = trimmed.replace(/\D/g, '');
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

function realignRowByContent(row: (string | null)[], columns: string[], labelColumnIndex: number): (string | null)[] {
  // Chi phan loai lai theo NOI DUNG khi THAT SU can (so luong o lech, HOAC o
  // dung vi tri "cot nhan" lai KHONG giong nhan - vd dong "TONG CONG TAI SAN"
  // bo qua cot STT rieng nen nhan bi lech vao dung vi tri cot STT du tong so
  // o van khop 6/6, xem vi du that o smoke test HSG 2026-07-05). Neu o dung vi
  // tri cot nhan DA la nhan that (truong hop binh thuong, da chiem da so cac
  // dong), GIU NGUYEN khong dong cham gi - tranh lam hong cac dong von da
  // dung (da gap that: thu phan loai lai VO DIEU KIEN cho MOI dong lam mot so
  // dong TS ngan han/dai han binh thuong bi xao tron sai, gay lech tong moi).
  if (row.length === columns.length && looksLikeLabel(row[labelColumnIndex])) return row;

  const result: (string | null)[] = new Array(columns.length).fill(null);
  const maSoIdx = columns.findIndex((c) => normalizeLabelText(c).includes('MA SO'));

  const labelCellIdx = row.findIndex((cell) => typeof cell === 'string' && /[a-zA-ZÀ-ỹ]{3,}/.test(cell));
  if (labelCellIdx !== -1) result[labelColumnIndex] = row[labelCellIdx];

  const remaining = row.filter((_, i) => i !== labelCellIdx);
  // CHI lay o KHOP DAU TIEN lam "ma so" - vai dong (vd "Lãi cơ bản trên cổ
  // phiếu") co GIA TRI THAT SU (309, 314...) nho, ngau nhien cung khop
  // MA_SO_PATTERN (2-4 chu so) nhu chinh o ma so that - loc ca dam theo
  // .filter() se nhan NHAM tat ca la "ma so", bo trong valueCells (0 phan tu),
  // roi ".slice(-0)" (bug JS: tra ve CA MANG thay vi mang rong) ghi de moi cot
  // gia tri thanh undefined - da gap that (2026-07-08, IDV mã 70 "Lãi cơ bản
  // trên cổ phiếu (*)": 309/314/851/949 deu bi coi la ma so, xoa sach 4 cot
  // gia tri that). Mot dong CHI co toi da 1 o la ma so that (nam ngay sau
  // nhan) - moi o con lai, du co khop MA_SO_PATTERN hay khong, deu la gia tri.
  const codeIdx = remaining.findIndex((c) => typeof c === 'string' && MA_SO_PATTERN.test(c.trim()));
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
];

const CASH_FLOW_CONTENT_MARKERS = [
  'LUU CHUYEN TIEN TU HOAT DONG KINH DOANH',
  'LUU CHUYEN TIEN TU HOAT DONG DAU TU',
  'LUU CHUYEN TIEN TU HOAT DONG TAI CHINH',
  'LUU CHUYEN TIEN THUAN TRONG KY',
  'TIEN VA TUONG DUONG TIEN CUOI KY',
  'KHAU HAO TAI SAN CO DINH',
  'TIEN CHI TRA LAI VAY',
  'TIEN CHI NOP THUE THU NHAP DOANH NGHIEP',
];

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
const OFF_BALANCE_SHEET_CONTENT_MARKERS = [
  'TAI SAN QUAN LY THEO CAM KET',
  'NO KHO DOI DA XU LY',
  'CO PHIEU DANG LUU HANH',
  'TIEN GUI CUA KHACH HANG',
  'VE TIEN GUI GIAO DICH CHUNG KHOAN',
];

const CONTENT_MARKERS_BY_KEY: { key: keyof FinancialStatements; markers: string[] }[] = [
  { key: 'balanceSheet', markers: BALANCE_SHEET_CONTENT_MARKERS },
  { key: 'incomeStatement', markers: INCOME_STATEMENT_CONTENT_MARKERS },
  { key: 'cashFlow', markers: CASH_FLOW_CONTENT_MARKERS },
  { key: 'offBalanceSheet', markers: OFF_BALANCE_SHEET_CONTENT_MARKERS },
];

// Dem so tu khoa dac trung cua tung bang xuat hien trong NHAN cac dong cua 1
// bang markdown da parse - gan bang do vao key co diem cao nhat, CHI khi diem
// do RO RANG vuot troi (khong hoa voi key khac) va > 0. Khong ep gan bua khi
// khong ro rang (tra ve null - bang bi bo qua, an toan hon la gan sai vao 1
// bang khong lien quan, vd bang phu "Co cau von dieu le" o trang bia).
function classifyTableByContent(table: StatementTable): keyof FinancialStatements | null {
  const labelIndex = findLabelColumnIndex(table.columns);
  const labelText = table.rows.map((row) => normalizeLabelText(String(row[labelIndex] ?? ''))).join(' | ');

  const scores = CONTENT_MARKERS_BY_KEY.map(({ key, markers }) => ({
    key,
    score: markers.reduce((count, marker) => count + (labelText.includes(marker) ? 1 : 0), 0),
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

interface ParsedTable extends StatementTable {
  incomeStatementPart?: IncomeStatementPart;
}

// Tim TAT CA bang markdown ("header" + dong phan cach "---" + cac dong du
// lieu) trong 1 pham vi dong cho truoc.
function parseAllTablesInRange(lines: string[]): ParsedTable[] {
  const tables: ParsedTable[] = [];
  let currentIncomeStatementPart: IncomeStatementPart | undefined;
  let i = 0;
  while (i < lines.length) {
    const headerCells = splitMarkdownRow(lines[i]);
    if (!headerCells) {
      if (looksLikeHeadingLine(lines[i])) {
        const normalized = normalizeLabelText(lines[i]);
        const marker = INCOME_STATEMENT_PART_MARKERS.find((m) => m.test(normalized));
        if (marker) currentIncomeStatementPart = marker.part;
      }
      i++;
      continue;
    }
    const nextCells = i + 1 < lines.length ? splitMarkdownRow(lines[i + 1]) : null;
    if (!nextCells || !isSeparatorRow(nextCells)) {
      i++;
      continue;
    }

    const labelIdx = findLabelColumnIndex(headerCells);
    const rows: (string | number | null)[][] = [];
    let j = i + 2;
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
      if (lines[j].trim() === '') {
        skipRun++;
        if (skipRun > 3) break;
        j++;
        continue;
      }
      const rowCells = splitMarkdownRow(lines[j]);
      if (!rowCells) {
        skipRun++;
        if (skipRun > 3) break;
        j++;
        continue;
      }
      skipRun = 0;
      if (isSeparatorRow(rowCells)) {
        j++; // dong phan cach GIA chen giua bang (ngat trang) - bo qua, khong phai du lieu that
        continue;
      }
      const realigned = realignRowByContent(rowCells, headerCells, labelIdx);
      rows.push(realigned.map((cell, idx) => (idx === labelIdx || cell === null ? cell : parseNumericCell(cell))));
      j++;
    }
    tables.push({ columns: headerCells, rows, incomeStatementPart: currentIncomeStatementPart });
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
  return lines.some((line) => containsHeadingMarkerNearStart(line, NOTES_SECTION_MARKERS));
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
  const allContentMarkers = CONTENT_MARKERS_BY_KEY.flatMap(({ markers }) => markers);
  const firstContentLine = normalizedLines.findIndex((line) => allContentMarkers.some((m) => line.includes(m)));
  const notesLine = lines.findIndex(
    (line, i) => (firstContentLine === -1 || i > firstContentLine) && containsHeadingMarkerNearStart(line, NOTES_SECTION_MARKERS)
  );
  const relevantLines = notesLine !== -1 ? lines.slice(0, notesLine) : lines;

  // Tim TAT CA bang markdown trong pham vi, roi gan MOI bang vao 1 trong 3
  // bang chinh theo NOI DUNG cua no (xem classifyTableByContent o tren) - KHONG
  // con dua vao tieu de dung truoc bang. Bang can doi ke toan VAS thuong bi
  // Mistral tach thanh 2 bang markdown RIENG (1 bang "TAI SAN" mã 100-270, 1
  // bang "NGUON VON" mã 300-440 o trang sau, vi 2 nua co tieu de cot dau khac
  // nhau) - moi nua van tu co du tu khoa dac trung rieng (vd nua NGUON VON co
  // "VON CHU SO HUU"/"TONG CONG NGUON VON") nen van duoc gan dung key du parse
  // rieng ra 2 bang, roi gop lai o duoi. Bo qua cac bang qua ngan (<3 dong,
  // thuong la bang phu nhu "Co cau von dieu le" o trang bia).
  const tables = parseAllTablesInRange(relevantLines).filter((t) => t.rows.length >= 3);

  const grouped: Record<keyof FinancialStatements, ParsedTable[]> = {
    balanceSheet: [],
    incomeStatement: [],
    cashFlow: [],
    offBalanceSheet: [],
  };
  for (const table of tables) {
    const key = classifyTableByContent(table);
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
      const columns = mostCommonColumns(matchedTables);
      result[key] = {
        columns,
        rows: matchedTables.flatMap((t) => t.rows.map((row) => alignRowToColumns(row, t.columns, columns))),
      };
    }
  }

  return result;
}

// KQKD mau bao hiem (B02a-DNPNT) tach thanh "Phan I - tong hop" (KHONG co cot
// "Thuyet minh") va "Phan II - chi tiet theo hoat dong" (CO cot "Thuyet
// minh") - 2 bang con nay bi Mistral tach rieng nhung gop chung 1 bang
// incomeStatement o tren, lay bo cot RONG NHAT (Phan II, 7 cot) lam chuan. Neu
// khong can chinh, cac dong tu Phan I (chi co 6 cot) se bi LECH 1 COT sang
// trai khi doc theo VI TRI cot cua bo cot chuan 7-cot (vd lib/analysis.ts doc
// nham cot "Thuyet minh" thanh 1 cot gia tri, day toan bo 4 cot gia tri that
// lui 1 vi tri) - phat hien qua doi chieu that bao cao Bao hiem NN&PTNT
// (Agribank Insurance) Q1/2026 2026-07-10. Khop lai tung cot theo TEN (qua
// normalizeLabelText, khong theo vi tri) roi dien null cho cot cua bang con
// khong co - CHI xay ra voi mau bao hiem (3 loai hinh con lai khong co dang
// "Phan I/Phan II" nhieu bang con khac so cot), nhung sua o day (dung chung
// cho ca 3 bang) de an toan chung neu sau nay gap truong hop tuong tu.
function alignRowToColumns(
  row: (string | number | null)[],
  sourceColumns: string[],
  targetColumns: string[]
): (string | number | null)[] {
  if (sourceColumns.length === targetColumns.length) return row;
  return targetColumns.map((col) => {
    const sourceIndex = sourceColumns.findIndex((c) => normalizeLabelText(c) === normalizeLabelText(col));
    return sourceIndex === -1 ? null : row[sourceIndex] ?? null;
  });
}

// Chon bo cot CHUAN de gop cac bang con: lay bo cot XUAT HIEN NHIEU LAN NHAT
// (theo TEN da normalize), KHONG con lay bo "RONG NHAT" nhu truoc - da gap
// that CTCK (MBS 2026-07-11): 1 trang KQKD le OCR ra THEM 1 cot trong du thua
// (2 cot "" lien tiep thay vi 1, co le loi render trang cua Mistral) rong hon
// het cac trang con lai CUNG bang - neu lay "rong nhat" se chon NHAM bo cot
// LE nay lam chuan, roi alignRowToColumns() khop TEN cot rong ("") se khop
// NHAM ca 2 cot "" trong bo chuan vao CUNG 1 cot "" nguon (findIndex luon tra
// vi tri DAU tien) - nhan doi nhan hang loat dong, sai toan bo % (moi metric
// KQKD tra ve null). Da xac nhan qua doi chieu that: bo cot LAP LAI nhieu lan
// nhat (vd 5-6 trang deu dung 1 kieu 5-cot) moi la bo cot CHUAN THAT SU cua ca
// bang, chi 1 trang le dung kieu khac la loi OCR cuc bo. Hoa nhau ve so lan
// (vd insurance Phan I/Phan II - moi ben CHI xuat hien 1 lan) thi uu tien bo
// RONG hon (giu dung hanh vi cu cho truong hop nay).
function mostCommonColumns(tables: ParsedTable[]): string[] {
  const counts = new Map<string, { count: number; columns: string[] }>();
  for (const table of tables) {
    const key = table.columns.map((c) => normalizeLabelText(c)).join('|');
    const existing = counts.get(key);
    if (existing) existing.count++;
    else counts.set(key, { count: 1, columns: table.columns });
  }
  let best: { count: number; columns: string[] } = { count: 0, columns: tables[0].columns };
  for (const entry of counts.values()) {
    if (entry.count > best.count || (entry.count === best.count && entry.columns.length > best.columns.length)) {
      best = entry;
    }
  }
  return best.columns;
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
