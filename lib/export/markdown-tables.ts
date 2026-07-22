import {
  findLabelColumnIndex,
  normalizeGroupLabelForContentMatch,
  normalizeLabelText,
  type FinancialStatements,
  type StatementTable,
} from './statement-shared';

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

// SUA 2026-07-22 (xac nhan qua PPC/PVR that): mot so bao cao Mistral OCR GHEP
// nhan tieng Viet + ban dich tieng Anh vao CHUNG 1 O (2 dong markdown le ra
// tach rieng bi OCR nhap lai), vd o goc: "**TỔNG CỘNG TÀI SẢN (270 = 100 +
// 200)** ***TOTAL ASSETS (270 = 100 + 200)***" - lam nhan dai/xau va co the
// gop phan lam trat khop nhan (Nhom A). Tin hieu CAU TRUC AN TOAN (khong doan
// theo tu vung/ngon ngu, giong tinh than
// feedback_prefer_structural_over_wording_fixes): cong thuc trong ngoac
// "(NNN...)' (chua so, dac trung rieng cho tung dong BCTC) LAP LAI Y HET lan
// 2 trong CUNG 1 o - chi cat khi phat hien DUNG mau nay (an toan voi viet tat
// hop le nhu "FVTPL"/"TNDN", vi cac tu do khong bao gio tao ra 1 cong thuc
// trong ngoac lap lai 2 lan).
function stripDuplicateFormulaTranslation(cell: string): string {
  const formulaMatch = cell.match(/\([^()]*\d[^()]*\)/);
  if (!formulaMatch) return cell;
  const formula = formulaMatch[0];
  const firstEnd = cell.indexOf(formula) + formula.length;
  const secondIndex = cell.indexOf(formula, firstEnd);
  if (secondIndex === -1) return cell;
  return cell.slice(0, firstEnd).trim();
}

function splitMarkdownRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed
    .slice(1, -1)
    .split('|')
    .map((cell) => stripDuplicateFormulaTranslation(cell.replace(/\*\*/g, '').trim()));
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

// SUA 2026-07-22 (xac nhan qua PPC that): 1 so bao cao dung KHOANG TRANG lam
// dau phan cach hang nghin thay vi dau "." (vd "3 331 514 267 301" thay vi
// "3.331.514.267.301"), bi tach thanh nhieu token RIENG BIET boi vong lap
// tren, khong token nao la "manh" (khong co dau phan cach/am/du 4 chu so) nen
// roi vao nhanh "khong chac chan" o duoi, tra ve chuoi tho - lam MOI chi tieu
// doc tu bang nay = null. KHAC HAN voi bug MBS da neu tren (2 so THAT SU
// DOC LAP, MOI so DA TU no co dau "." rieng, chi vo tinh dung canh nhau) -
// phan biet bang dieu kien BAT BUOC: khong token nao duoc co dau "."/","
// (neu co, chac chan la 1 so DA HOAN CHINH doc lap, khong duoc ghep tiep) VA
// nhom DAU 1-3 chu so, cac nhom SAU dung 3 chu so (dung quy tac nhom hang
// nghin chuan, giong cach extractIntegerDigits da kiem chung cho dau ".").
function looksLikeSpaceGroupedNumber(tokens: string[]): boolean {
  if (tokens.length < 2) return false;
  if (tokens.some((t) => /[.,]/.test(t))) return false;
  const core = tokens.map((t) => t.replace(/^\(/, '').replace(/\)$/, '').replace(/^-/, ''));
  if (!/^\d{1,3}$/.test(core[0])) return false;
  return core.slice(1).every((t) => /^\d{3}$/.test(t));
}

// Ghep cac token da xac nhan la 1 so duy nhat (looksLikeSpaceGroupedNumber)
// thanh 1 chuoi dang "." chuan - tai su dung nguyen logic am/dau ngoac +
// extractIntegerDigits co san ben duoi thay vi viet lai rieng.
function joinSpaceGroupedNumber(tokens: string[]): string {
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const sign = first.startsWith('-') ? '-' : '';
  const openParen = first.startsWith('(') ? '(' : '';
  const closeParen = last.endsWith(')') ? ')' : '';
  const core = tokens.map((t) => t.replace(/^\(/, '').replace(/\)$/, '').replace(/^-/, ''));
  return `${sign}${openParen}${core.join('.')}${closeParen}`;
}

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
  } else if (looksLikeSpaceGroupedNumber(numberLikeTokens)) {
    numericToken = joinSpaceGroupedNumber(numberLikeTokens);
  } else {
    return trimmed;
  }

  // SUA 2026-07-18 (GTA that): nhom hang nghin phan cach boi dau "." BAT BUOC
  // dung 3 chu so (tru nhom dau tien, 1-3 chu so) - vi du "112.763.996.9"
  // (nhom cuoi chi 1 chu so) la 1 o bi OCR CAT CUT/hong (thieu chu so), KHONG
  // PHAI so hop le. Truoc day digitsOnly chi noi TRAN cac nhom lai
  // ("1127639969") ma khong kiem tra do dai tung nhom, bien 1 o hong thanh 1
  // SO SAI TRONG NHU DUNG (nguy hiem hon tra ve null/chuoi tho - gay canh bao
  // sai lech hang ty dong o buoc kiem tra cheo phia sau). Neu vi pham, tra ve
  // chuoi tho (giong cac truong hop khong chac chan khac trong ham nay) de
  // downstream coi la KHONG CO tin hieu so, khong dung so sai.
  const isNegative = numericToken.startsWith('(') || numericToken.startsWith('-');
  const digitsOnly = extractIntegerDigits(numericToken);
  if (!digitsOnly) return trimmed;
  const num = Number(digitsOnly);
  return Number.isNaN(num) ? trimmed : isNegative ? -num : num;
}

// Tach phan nguyen (bo phan thap phan) tu 1 token so, ho tro CA 2 quy uoc
// phan cach: VN (dau "." nhom nghin, dau "," thap phan) VA quoc te (dau ","
// nhom nghin, dau "." thap phan). Nhom thap phan luon la nhom SAU CUNG chi co
// 1-2 chu so (khac nhom nghin luon dung DUNG 3 chu so) - day la tin hieu CAU
// TRUC de phan biet, khong doan theo ky tu cu the dau nao la gi.
//
// SUA 2026-07-20 (PHN that): file nay dung dau "," lam phan cach nghin
// ("219,304,461,655") nhung 2 dong "Số đầu năm" lai co duoi thap phan ".0"
// ("219,304,461,655.0") - dung quy uoc quoc te nguoc voi gia dinh VN cu. Ham
// cu chi kiem tra HINH DANG nhom (hasValidThousandGrouping, gia dinh cung "."
// la nhom nghin) roi xoa TRANG TRO moi ky tu khong phai so
// (.replace(/\D/g,'')) - VO TINH noi ca duoi thap phan vao phan nguyen thay
// vi BO no, lam gia tri gap 10 lan (219,304,461,655.0 -> "2193044616550" thay
// vi "219304461655"). VND khong co don vi le nen phan thap phan (neu co,
// thuong chi la ".0" do lam tron khi xuat file) LUON phai bi BO, khong duoc
// cong don vao phan nguyen. Kiem tra cheo (validateBalanceSheet) da tu phat
// hien va bao dung 5 canh bao lech 10 lan cho ca 2 dong bi anh huong (200 va
// 280) truoc khi co fix nay - xac nhan co che canh bao van hoat dong dung,
// chi thieu buoc TU SUA gia tri.
function extractIntegerDigits(numericToken: string): string | null {
  const core = numericToken.replace(/^[-(]+/, '').replace(/[)]+$/, '');
  const lastDot = core.lastIndexOf('.');
  const lastComma = core.lastIndexOf(',');

  if (lastDot !== -1 && lastComma !== -1) {
    // Ca 2 dau deu xuat hien: dau xuat hien SAU CUNG la ung vien thap phan,
    // dau con lai la nhom nghin.
    const decimalIsDot = lastDot > lastComma;
    const decimalIdx = decimalIsDot ? lastDot : lastComma;
    const thousandsSep = decimalIsDot ? ',' : '.';
    const integerPart = core.slice(0, decimalIdx);
    const fractionPart = core.slice(decimalIdx + 1);
    if (!/^\d{1,2}$/.test(fractionPart)) return null;
    const groups = integerPart.split(thousandsSep);
    if (!/^\d+$/.test(groups[0])) return null;
    if (!groups.slice(1).every((g) => /^\d{3}$/.test(g))) return null;
    return groups.join('');
  }

  if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? '.' : ',';
    const groups = core.split(sep);
    if (groups.length === 1) return /^\d+$/.test(groups[0]) ? groups[0] : null;
    const lastGroup = groups[groups.length - 1];
    if (/^\d{3}$/.test(lastGroup)) {
      if (!/^\d+$/.test(groups[0])) return null;
      if (!groups.slice(1).every((g) => /^\d{3}$/.test(g))) return null;
      return groups.join('');
    }
    if (groups.length === 2 && /^\d{1,2}$/.test(lastGroup)) {
      return /^\d+$/.test(groups[0]) ? groups[0] : null;
    }
    return null;
  }

  return /^\d+$/.test(core) ? core : null;
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

// Chuoi CHI gom ky tu La Ma (I,V,X,L,C,D,M, co the kem 1 dau phan cach don le)
// - la STT MUC (vd "III.", "VIII", "II)"), KHONG PHAI nhan that - du co the
// TINH CO khop pattern "3+ chu cai lien tiep" duoi day (vd "III" = 3 chu "I").
// Da xac nhan qua CSV that (2026-07-17): dong that su la "III. | Các khoản
// phải thu ngắn hạn | 130 | ...| gia tri |" bi hieu SAI la "da dung vi tri
// san" (chi vi o dau tien "III." tinh co "trong nhu nhan that"), GIU NGUYEN
// hang thay vi phan loai lai theo noi dung - lam nhan THAT ("Các khoản phải
// thu ngắn hạn") bi ket qua o SAI cot (dinh o vi tri STT), khien dong nay
// KHONG con duoc nhan dien la ranh gioi nhom "cap-1" ke tiep, pha tan het
// pham vi tinh tong cho nhom truoc no. Loai truong hop nay TRUOC khi kiem tra
// pattern chu cai chung.
const PURE_ROMAN_NUMERAL_CELL = /^[IVXLCDM]+\s*[.\/)-]?\s*$/;

function looksLikeLabel(cell: string | null): boolean {
  if (typeof cell !== 'string') return false;
  if (PURE_ROMAN_NUMERAL_CELL.test(cell.trim())) return false;
  return /[a-zA-ZÀ-ỹ]{3,}/.test(cell);
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

  // SUA 2026-07-17 (backtest 16 bao cao Q2/2026 that, CSV): dung LAI
  // looksLikeLabel() (da loai STT La Ma thuan tuy nhu "III.") thay vi 1 regex
  // tho rieng o day - truoc day 2 noi nay dung 2 kiem tra KHAC NHAU (fast-path
  // o tren da sua, nhung buoc tim "o nao la nhan" trong nhanh phan loai lai
  // NAY van dung regex tho cu, KHONG duoc huong loi ich sua o tren) - dong
  // "III. | Các khoản phải thu ngắn hạn | 130 | ..." van bi chon o[0]="III."
  // lam nhan (van khop pattern "3+ chu cai" tho), day nhan THAT ("Các khoản
  // phải thu ngắn hạn") sang vi tri SAI (cot Ma so).
  const labelCellIdx = row.findIndex((cell) => looksLikeLabel(cell));
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
  // SUA 2026-07-16 (token-AND, duoc NEO bao ve): nhieu DN ghi gon "Loi nhuan
  // gop" (khong "ve ban hang va cung cap dich vu") - noi ve cum ngan "LOI NHUAN
  // GOP" (van doc quyen KQKD, khong o BCDKT/LCTT; khop luon bien the bao hiem
  // "Loi nhuan gop hoat dong kinh doanh bao hiem"). An toan de noi vi day cung
  // la 1 NEO income (ANCHOR_MARKERS_BY_KEY) - neu tinh co khop nham 1 bang khac
  // co neo rieng, neo bang do van thang.
  'LOI NHUAN GOP',
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
  // SUA 2026-07-17 (backtest 16 bao cao Q2/2026 that, BSL): tach ['TONG LOI
  // NHUAN','TRUOC THUE'] rieng (thay the "TONG LOI NHUAN KE TOAN TRUOC THUE"
  // cung nhac) de hut bien the Ngan hang bo "ke toan" (nguoi dung luu y
  // 2026-07-16). KHONG them bien the "bo Tong" (['LOI NHUAN KE TOAN','TRUOC
  // THUE']) o day nua - DA THU va BO (xac nhan qua BSL that): thuyet minh "Chi
  // phi thue TNDN hien hanh" (RAT PHO BIEN, hau het cong ty deu co) thuong BAT
  // DAU bang CHINH XAC dong "Loi nhuan ke toan truoc thue" (khong "Tong") de
  // doi chieu thue suat - ngay ca o tang diem THUONG (+1, khong phai neo 100),
  // 1 bang thuyet minh NHO (4-5 dong, khong co marker nao khac) van du de
  // "thang" (diem 1 > 0, khong hoa) va bi phan loai NHAM thanh incomeStatement -
  // SAI THAM LANG (khong canh bao). NGHIEM TRONG HON: lib/analysis.ts:501 co
  // finder `byLabel(['LOI NHUAN KE TOAN TRUOC THUE'])` dung CHINH cum nay tra
  // cuu 1 chi tieu phan tich - neu dong thuyet minh lot vao bang, finder co
  // nguy co lay NHAM gia tri doi chieu thue suat (khac han LNTT that) thay vi
  // dong KQKD that, sai am tham 1 chi tieu hien thi cho nguoi dung. Chap nhan
  // MAT do phu (KQKD bo "Tong" VA "ke toan" cung luc, hiem) de tranh rui ro nay -
  // 1 bang KQKD that luon con nhieu marker KHAC (Doanh thu thuan, Gia von hang
  // ban, Loi nhuan gop...) du nhan dung du thieu rieng dong nay.
  ['TONG LOI NHUAN', 'TRUOC THUE'],
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

// SUA 2026-07-17 (theo yeu cau nguoi dung, sau khi BSL that lo ra ca lop 1 LAN
// lop 2 o tren deu KHONG tim duoc diem ket thuc LCTT): trang LCTT "hoat dong
// tai chinh" cua BSL bi Mistral OCR ra 1 KHOI JSON CAPTION (khong phai bang
// markdown "| ... |" chuan) - khong co dong "Tien dau ky"/"Tien cuoi ky" nao o
// DANG BANG THAT trong ca tai lieu de 2 lop tren bam vao, Thuyet minh lot het
// vao pham vi quet.
//
// LOP DU PHONG THU 3: KHOI PHUC lai co che HEADING+TU KHOA da tung dung LAM
// CHINH truoc day (2026-07-14, xem lich su "phuong an (c)" ngay tren comment
// nay - da GIU LAI duoi dang comment, chua xoa - va NOTES_SECTION_MARKERS)
// nhung bi thay boi co che CASH_FLOW_ENDING_SEQUENCE (lop 1/2 o tren) lam
// CHINH theo de nghi nguoi dung luc do - comment cu ghi ro co che nay "Hoat
// dong dung" (khong loi, chi bi thay vi nguoi dung muon 1 tin hieu thong nhat
// hon lam CHINH). Dung lai y nguyen tinh than do lam DU PHONG cuoi cung.
//
// Muc tieu de: TEN CHINH THUC cua chinh mau bieu Thuyet minh - "Bản thuyết
// minh báo cáo tài chính" (Mau B09-DN, Thong tu 200/2014/TT-BTC) - la ten GOI
// PHAP LY co dinh cua ca mau bieu, khong phai 1 cach dien dat tuy chon. Ban
// dau thu dung tieu de MUC 3 cu the ("Chuan muc va Che do ke toan ap dung")
// nhung KIEM TRA LAI qua chinh du lieu BSL that moi phat hien BSL dung so muc/
// ten muc KHAC (muc 3 cua BSL la "Tóm tắt những chính sách kế toán chủ yếu",
// khong co muc rieng ten "Chuẩn mực và Chế độ kế toán ap dung" - cum do chi
// xuat hien duoi dang VAN XUOI long trong muc 2(a) "Tuyên bố về tuân thủ") -
// SO MUC/TEN MUC CON LAI (1,2,3,4...) bien doi qua nhieu giua cac cong ty de
// dung an toan. NGUOC LAI, TEN CHINH cua ca mau bieu ("Bản thuyết minh báo
// cáo tài chính"/"Thuyết minh báo cáo tài chính") xac nhan xuat hien O CA 2
// bao cao that (BSL: "**Thuyết minh báo cáo tài chính quý 2...**" dang chu
// dam KHONG "#"; FTS: "## BẢN THUYẾT MINH BÁO CÁO TÀI CHÍNH RIÊNG" dang "##")
// - dung looksLikeHeadingLine (dong ngan, khong phai hang bang - KHONG doi
// hoi "#" nhu ban goc 2026-07-14, vi BSL khong dung "#" cho dong nay) thay vi
// yeu cau "#" nghiem ngat, de tuong thich CA 2 kieu OCR danh dau tieu de.
//
// AN TOAN VOI COLLISION DA BIET (trang bia liet ke ten 4 bang dang danh sach,
// xem comment parseStatementsFromMarkdown ve firstContentLine): ham nay CHI
// duoc goi voi `searchFromIndex` = diem DA XAC NHAN qua noi dung bang THAT (
// firstContentLine, sau trang bia) - dong lap lai ten "Thuyet minh" o trang
// bia (TRUOC firstContentLine) nam NGOAI pham vi tim kiem cua ham nay, khong
// con rui ro khop nham nhu lan dau thu (2026-07-14).
const NOTES_SECTION_TITLE_MARKERS = [['THUYET MINH', 'BAO CAO TAI CHINH']];

// SUA 2026-07-22 (xac nhan qua NCT that): cau dan chieu lap lai o CUOI MOI
// TRANG ("Các Thuyết minh đính kèm là bộ phận hợp thành của Báo cáo tài
// chính"/bien the "...la bo phan khong the tach roi cua...") CUNG chua ca 2
// token 'THUYET MINH' va 'BAO CAO TAI CHINH' nhu tieu de that, va la 1 CAU
// NGAN (<80 ky tu, khong bat dau bang "|") nen lot qua looksLikeHeadingLine -
// bi hieu NHAM la tieu de that cua muc Thuyet minh, khien findNotesSectionStartIndex
// (phuong an du phong CUOI CUNG khi ca 2 phuong an chinh xac hon deu that bai -
// dung o cac bao cao bi OCR cut ngang truoc khi toi LCTT/Thuyet minh that, vd
// NCT) cat pham vi bang NGAY SAU dong dau tien co ca 2 tu khoa, xoa mat BCDKT/
// KQKD dang doc dang do. Loai truong hop nay bang tu khoa DAC TRUNG RIENG cua
// cau dan chieu (khong bao gio xuat hien trong 1 dong TIEU DE that, vd "Thuyết
// minh báo cáo tài chính quý 2..."): "DINH KEM" (dinh kem) va "BO PHAN" (bo
// phan hop thanh/khong the tach roi).
const NOTES_SECTION_DISCLAIMER_EXCLUDE_MARKERS = ['DINH KEM', 'BO PHAN'];

function isNotesSectionTitleHeadingLine(normalizedLine: string): boolean {
  if (NOTES_SECTION_DISCLAIMER_EXCLUDE_MARKERS.some((m) => normalizedLine.includes(m))) return false;
  return NOTES_SECTION_TITLE_MARKERS.some((tokens) => tokens.every((t) => normalizedLine.includes(t)));
}

function findNotesSectionStartIndex(lines: string[], searchFromIndex: number): number {
  for (let i = searchFromIndex; i < lines.length; i++) {
    if (!looksLikeHeadingLine(lines[i])) continue;
    if (isNotesSectionTitleHeadingLine(normalizeLabelText(lines[i]))) return i;
  }
  return -1;
}

// Diem vao DUY NHAT cho ca containsNotesSectionMarker va parseStatementsFromMarkdown
// - thu phuong an chinh xac hon (khoang cach gioi han) TRUOC, fallback sang
// phuong an thu tu (khong gioi han khoang cach) khi phuong an dau khong tim
// thay gi, CUOI CUNG fallback sang tieu de mandated cua Thuyet minh (lop 3,
// BSL that) khi CA 2 lop tren deu that bai (vd 1 trang LCTT bi OCR hong hoan
// toan, khong con dong bang nao de bam vao).
function findCashFlowEndingIndex(lines: string[], searchFromIndex: number): number {
  const strict = findCashFlowEndingSequenceIndex(lines, searchFromIndex);
  if (strict !== -1) return strict;
  const byOrder = findCashFlowEndingByFinancingSectionOrder(lines, searchFromIndex);
  if (byOrder !== -1) return byOrder;
  const notesStart = findNotesSectionStartIndex(lines, searchFromIndex);
  if (notesStart !== -1) return notesStart - 1;
  return -1;
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

// SUA 2026-07-16 (theo de nghi nguoi dung): marker "NEO" = tu khoa chi xuat
// hien o DUNG 1 trong 4 bang (khong map mo giua cac bang). classifyTableByContent
// cham diem TUONG DOI, nen 1 marker MAP MO (vd "Tien va cac khoan tuong duong
// tien" co o CA BCDKT lan dong ket thuc LCTT) co the cong diem GIA cho sai bang
// va lat nham phan loai. Y tuong nguoi dung: neu bang chua 1 NEO cua LCTT (vd
// "Luu chuyen tien tu hoat dong tai chinh") thi dong "tien va tuong duong tien"
// trong bang do CHAC CHAN thuoc LCTT, khong the la BCDKT - NEO thang marker map
// mo. Cho neo trong so LON (ANCHOR_WEIGHT) de 1 neo luon ap dao moi so marker
// map mo -> co the noi long marker map mo sang token-AND (tang recall) ma KHONG
// so lat nham bang.
//
// NGUYEN TAC CHON NEO: CHI gom marker CHAC CHAN doc quyen 1 bang. Neu bo sot 1
// marker le ra doc quyen -> chi mat 1 phan tin hieu an toan, bang do roi ve cham
// diem tho nhu cu (van dung). Neo SAI (thuc te co o bang khac) moi nguy hiem ->
// chon BAO THU. KHONG gom cac marker da biet MAP MO: "TIEN VA... TUONG DUONG
// TIEN" (BCDKT + LCTT), "HANG TON KHO" (BCDKT + LCTT bien dong), "VON CHU SO HUU"
// (BCDKT + bao cao bien dong VCSH), "LOI ICH... CO DONG KHONG KIEM SOAT" (KQKD +
// VCSH BCDKT), "NO KHO DOI DA XU LY"/"TIEN GUI CUA KHACH HANG" (offBS + BCDKT NH).
// NEO lay tu MAU BIEU CHUAN Thong tu (KHONG suy tu sample - sample it + nhieu):
//   other: TT200/2014 + TT99/2025 (B01/B02/B03-DN)
//   bank:  TT49/2014/TT-NHNN + TT200 (B02/B03/B04-TCTD)
//   CTCK:  TT210/2014 + TT334/2016 (B01/B02/B03-CTCK)
//   bao hiem: TT232/2012/TT-BTC (B01/B02/B03-DNPNT)
// Da doi chieu tung ung vien qua mirror-check tren corpus that
// (scripts/_debug-anchor-validate.ts) va LOAI cac dong "soi guong" THAT theo
// chuan (xuat hien o ca 1 bang anh em). LUU Y: mirror-check tren sample co
// NHIEU (bao cao OCR loi lam thuyet minh lot sang bang khac, hoac cache cu phan
// loai nham) - KHONG auto-loai theo sample; chuan Thong tu la nguon chan ly,
// mirror-check chi de canh bao ra soat. Vi du da CAN NHAC va GIU (chuan noi doc
// quyen, mirror la nhieu): "LOI NHUAN GOP" (RYG lot thuyet minh vao BCDKT),
// "LUU CHUYEN TIEN..." (cache cu xep nham dong LCTT vao BCDKT). Vi du da LOAI
// (mirror THAT theo chuan): "VON GOP CUA CHU SO HUU" (LCTT "Tien thu... nhan
// von gop cua CSH"), "TAI SAN DAI HAN" (LCTT dau tu "mua sam... tai san dai han
// khac"), "DU PHONG NGHIEP VU" (KQKD bao hiem "chi phi du phong nghiep vu"),
// "PHI NHUONG TAI BAO HIEM" (BCDKT "Du phong phi nhuong tai bao hiem" - bug MIG),
// "PHAT HANH GIAY TO CO GIA" (LCTT NH), cac neo offBS CTCK (soi guong BCDKT vi
// bang "ngoai BCTHTC" hay bi gop chung voi BCDKT).
// TOKEN-AND cho tung neo: CHI giu tu khoa PHAN BIET COT LOI (mang = AND, khong
// doi hoi lien tiep) de HUT bien the wording (chen "ngan han"/"ve ban hang..."/
// "cong ty chung khoan" giua) - KHONG khop ca cum cung tung chu (nguon goc lỗi
// gion). 2 RANG BUOC an toan (da doi chieu mirror-check corpus that,
// scripts/_debug-anchor-validate.ts):
//  1) Token phai du DAC TRUNG de KHONG soi guong bang anh em (vd bo "phai thu
//     cua khach hang" vi CTCK "ngoai BCTHTC" cung co "phai thu...cua khach hang").
//  2) TRANH token PHAN TAN: classifyTableByContent khop token tren NHAN CA
//     BANG gop lai -> 2 token roi rac (o 2 dong khac nhau) van khop. Vd
//     ['LOI NHUAN SAU THUE','THU NHAP DOANH NGHIEP'] khop NHAM BCDKT (co "LNST
//     chua phan phoi" + "thue TNDN hoan lai" o 2 dong) -> dung CUM LIEN
//     'LOI NHUAN SAU THUE THU NHAP DOANH NGHIEP'. Cac cum con lai da kiem: 2
//     token luon di CUNG 1 dong chi tieu, khong phan tan.
const ANCHOR_MARKERS_BY_KEY: Partial<Record<keyof FinancialStatements, ContentMarker[]>> = {
  balanceSheet: [
    // NGUYEN TAC (nguoi dung 2026-07-16): neo BCDKT phai la khoan MUC SO DU
    // (stock) KHONG THE xuat hien duoi dang DONG TIEN/CHI PHI (flow) o LCTT/KQKD.
    // -> chi dung TONG, TAI SAN CO DINH, VON/QUY/LNST. TRANH cac khoan von luu
    // dong (phai thu/phai tra/nguoi mua tra truoc/vay) vi LCTT GIAN TIEP dieu
    // chinh "tang giam" chung, va ban CHI TIET cua 1 so cong ty liet ke dich
    // danh (vd "tra no goc VAY VA NO THUE TAI CHINH", "tang giam PHAI TRA NGUOI
    // BAN") -> soi guong, neo GIA. Da BO: Nguoi mua tra tien truoc, Phai tra
    // nguoi ban, Vay va no thue tai chinh, va 2 neo CTCK (Phai tra HDGD chung
    // khoan / Tien nop Quy ho tro thanh toan - "Tien nop..." ban chat la dong
    // tien chi o LCTT). CTCK/NH van duoc neo qua cac dong TONG.
    ['TONG CONG TAI SAN'],          // ma 270
    ['TONG CONG NGUON VON'],        // ma 440
    ['TAI SAN NGAN HAN'],           // ma 100 (header muc, LCTT khong co)
    ['TAI SAN CO DINH HUU HINH'],   // ma 221
    ['TAI SAN CO DINH VO HINH'],    // ma 227
    // SUA 2026-07-17 (phat hien qua backtest 16 bao cao Q2/2026 that, BSL):
    // BO ca 3 neo "tung quy/von rieng le" (Quy khen thuong+phuc loi, LNST chua
    // phan phoi, Thang du von co phan) - KHAC voi cac neo TONG/TAI SAN CO DINH
    // o tren (khong the co thuyet minh "bien dong" rieng), MOI quy/von don le
    // trong BCDKT THUONG co 1 thuyet minh BIEN DONG RIENG (mau bang "Bao cao
    // tinh hinh bien dong VCSH" dang CHUYEN VI - cot la TUNG quy/von, dong la
    // moc thoi gian/su kien: "Trich quy khen thuong phuc loi", "Co tuc"...) -
    // EQUITY_CHANGES_COLUMN_MARKERS (kiem tra qua isEquityChangesStatementTable)
    // CHI bat duoc dang bang CHUAN (dong=quy, cot=thoi gian), KHONG bat duoc
    // dang CHUYEN VI nay, nen bang thuyet minh nay truoc day bi loai an toan
    // (diem = 0, khong khop marker nao) - neo token-AND ['QUY KHEN THUONG',
    // 'PHUC LOI'] moi them lai KHOP dung dong "Trich quy khen thuong phuc loi"
    // (mo ta bien dong, KHONG phai dong BCDKT that) trong bang thuyet minh nay,
    // keo CA BANG THUYET MINH (con nam trong pham vi quet do notesLine chua cat
    // het - gioi han rieng, khong sua o day) vao BCDKT that - SAI THAM LANG
    // (khong mismatch nao duoc bao, vi khong dung cong thuc nao ca) - nguy hiem
    // hon ca 1 mismatch co canh bao. Nguyen tac tu day: CHI neo BCDKT bang cac
    // dong KHONG THE co thuyet minh bien dong dang nay (Tong/Tai san co dinh) -
    // BAT KY quy/von DON LE nao (du la ten khac) deu co nguy co tuong tu, khong
    // chi rieng 3 cai da phat hien.
    // Ngan hang (TT49) - dung TONG rieng cua NH (mau khong co "Tong cong ...")
    ['TONG TAI SAN'],
    ['TONG NO PHAI TRA', 'VON CHU SO HUU'],
    // Bao hiem (TT232) - "Tai san tai bao hiem" doc quyen BCDKT (KHAC "phi
    // nhuong tai bao hiem" ben KQKD; la so du tai san, khong phai dong tien).
    ['TAI SAN TAI BAO HIEM'],
  ],
  incomeStatement: [
    // Pho quat / DN thuong (TT200) - dung tu khoa GON, doc quyen KQKD
    ['DOANH THU THUAN'],            // ma 10 ("...ve ban hang..."/"...HDKD bao hiem")
    // SUA 2026-07-17 (theo phan hoi nguoi dung): TRUOC DAY tung siet ['GIA
    // VON']->['GIA VON HANG BAN'] va BO han ['CHI PHI QUAN LY'] khoi neo, vi 1
    // bao cao (BSL) co thuyet minh chi tiet "Gia von KHAC"/"Chi phi quan ly
    // KHAC" khop nham. DA REVERT theo yeu cau nguoi dung: siet/bo mot marker
    // TONG QUAT (dung cho MOI cong ty) chi vi 1 bao cao cu the la sai huong -
    // rui ro BO SOT bien the that cua cac cong ty KHAC (vd "Gia von" khong co
    // "hang ban", hay CTCK ghi "Chi phi quan ly cong ty chung khoan") lon hon
    // nhieu so voi loi ich tranh 1 mismatch hiem. Nguyen nhan that cua BSL la
    // O TANG DIEM CAT (notesLine khong cat het vi trang LCTT "hoat dong tai
    // chinh" cua BSL bi Mistral OCR ra 1 khoi JSON caption thay vi bang
    // markdown chuan, khong the tim thay chu ky ket thuc) - KHONG phai loi
    // marker. Day la 1 loi OCR hiem, kho khai quat hoa (giong tinh than
    // feedback_prefer_structural_over_wording_fixes) - chap nhan BSL co the
    // con hien mismatch/canh bao do phan du (thuyet minh lot qua) thay vi
    // noi long marker cho MOI bao cao khac de vá rieng 1 truong hop.
    ['GIA VON'],                    // ma 11
    ['LOI NHUAN GOP'],              // ma 20 (hut ca "...HDKD bao hiem")
    ['GIAM TRU DOANH THU'],         // ma 02
    ['CHI PHI BAN HANG'],           // ma 25
    ['CHI PHI QUAN LY'],            // ma 26 (hut "...doanh nghiep"/"...cong ty CK")
    // KHONG dung ['LOI NHUAN THUAN','HOAT DONG KINH DOANH'] (ma 30) lam neo:
    // LCTT GIAN TIEP Ngan hang (TT49, Mau B04a/TCTD-HN) co dong CHINH THUC "Loi
    // nhuan thuan tu hoat dong kinh doanh TRUOC NHUNG THAY DOI ve tai san va
    // cong no hoat dong" NGAY TRONG muc "I. Luu chuyen tien tu hoat dong kinh
    // doanh" - chua CA 2 token nay trong CUNG 1 bang LCTT that (khong phai suy
    // doan, la dong chinh thuc theo mau bieu). Neo se soi guong that voi LCTT
    // Ngan hang -> BO, du KHONG hien trong corpus (chi 4 bao cao bank, co the
    // OCR chua bat het chi tiet LCTT NH).
    //
    // SUA 2026-07-17 (BSL that): BO CA 2 bien the "Loi nhuan [ke toan/Tong]
    // truoc thue" khoi TANG NEO (100 diem) - thuyet minh "Chi phi thue TNDN
    // hien hanh" (RAT PHO BIEN, hau het cong ty deu co) thuong BAT DAU bang
    // dung dong "Loi nhuan ke toan truoc thue" de doi chieu thue suat, khop
    // nham va lat CA bang thuyet minh do thanh incomeStatement neu no lot qua
    // notesLine (gioi han rieng cua tung tai lieu, chua sua o day) - SAI THAM
    // LANG (khong mismatch/canh bao nao ca, nguy hiem hon 1 mismatch co bao).
    // Da CHUYEN CA 2 xuong tang marker THUONG (+1 diem, xem
    // INCOME_STATEMENT_CONTENT_MARKERS o tren) - van hut duoc bien the thieu
    // "Tong"/"ke toan" (yeu cau nguoi dung 2026-07-16) nhung o muc diem thap
    // hon nhieu, khong du de 1 minh quyet dinh phan loai 1 bang khong co marker
    // that nao khac.
    'LOI NHUAN SAU THUE THU NHAP DOANH NGHIEP', // ma 60 (CUM LIEN - tranh token phan tan)
    ['CHI PHI THUE', 'TNDN', 'HIEN HANH'], // ma 51
    ['CHI PHI THUE', 'TNDN', 'HOAN LAI'],  // ma 52
    ['LAI CO BAN TREN CO PHIEU'],   // ma 70
    // Bao hiem (TT232 B02-DNPNT)
    ['DOANH THU PHI BAO HIEM'],
    ['CHI BOI THUONG'],             // KHAC "du phong boi thuong" (BCDKT)
    // Chung khoan (TT210 B02-CTCK)
    ['NGHIEP VU MOI GIOI CHUNG KHOAN'], // ca doanh thu lan chi phi moi gioi
    ['CONG DOANH THU HOAT DONG'],
    ['CONG CHI PHI HOAT DONG'],
    // Ngan hang (TT49 B03-TCTD)
    ['THU NHAP LAI THUAN'],
    ['LAI THUAN', 'HOAT DONG DICH VU'],
    // KHONG dung ['DU PHONG RUI RO TIN DUNG'] lam neo: LCTT GIAN TIEP Ngan hang
    // (TT49) co dong dieu chinh phi tien mat CHINH THUC "Chi phi du phong rui ro
    // tin dung" NGAY TRONG muc "I. Luu chuyen tien tu hoat dong kinh doanh" (cong
    // lai khoan chi phi khong bang tien tu Loi nhuan truoc thue) - chua dung
    // token nay trong LCTT that. Cung ly do voi neo tren, BO du corpus chua bat
    // duoc.
  ],
  cashFlow: [
    // 3 muc chinh - "LUU CHUYEN TIEN" chi co o LCTT (moi loai hinh)
    ['LUU CHUYEN TIEN', 'HOAT DONG KINH DOANH'],
    ['LUU CHUYEN TIEN', 'HOAT DONG DAU TU'],
    ['LUU CHUYEN TIEN', 'HOAT DONG TAI CHINH'],
    ['LUU CHUYEN TIEN THUAN TRONG KY'],
    ['TIEN CHI TRA', 'LAI VAY'],
    ['TIEN CHI NOP THUE', 'THU NHAP DOANH NGHIEP'],
    ['TIEN THU', 'BAN HANG', 'CUNG CAP DICH VU'], // LCTT truc tiep (KHAC "doanh thu ban hang" KQKD)
    'TIEN THU TU PHAT HANH CO PHIEU', // CUM LIEN (token phan tan o BCDKT NH)
    // KHONG dung "khau hao TSCD" (1 so KQKD chi tiet co "chi phi khau hao") va
    // "...tuong duong tien cuoi ky" (soi guong BCDKT) - LCTT da du neo.
  ],
  offBalanceSheet: [
    // CHI giu neo Ngan hang (ngoai bang) - chi tieu "ngoai BCTHTC" CTCK hay bi
    // gop chung voi BCDKT -> soi guong. offBS van phan loai qua marker thuong.
    ['BAO LANH VAY VON'],
  ],
};

// 1 neo ap dao MOI so marker map mo (moi bang co <100 marker) - dam bao "co
// neo cua bang X" luon thang "chi co marker map mo cua bang Y".
const ANCHOR_WEIGHT = 100;

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
// SUA 2026-07-22 (xac nhan qua AGR that, mau CTCK Thong tu 210): BCDKT THAT
// (standalone, khong phai bang bien dong VCSH) dung dung ten cot "SỐ DƯ CUỐI
// KỲ"/"SỐ DƯ ĐẦU NĂM" thay vi "Số cuối kỳ"/"Số đầu năm" thuong gap - trung
// vo tinh 2/5 EQUITY_CHANGES_COLUMN_MARKERS, bi loai NHAM khoi ca 3 bang
// chinh (balanceSheet VA offBalanceSheet cua AGR deu bi mat trang vi cung 1
// nguyen nhan). Them tin hieu NOI DUNG de phan biet AN TOAN: bang bien dong
// VCSH (dang "dong la tung quy/von, cot la thoi gian/su kien") KHONG BAO GIO
// co dong "TAI SAN NGAN HAN"/"TONG CONG TAI SAN" (2 neo TAI SAN mot chieu,
// chi BCDKT that moi co, khong lien quan gi den von/quy) - neu co it nhat 1
// trong 2 neo nay o COT NHAN, chac chan la BCDKT that du trung cot, KHONG
// duoc loai.
function isEquityChangesStatementTable(table: ParsedTable): boolean {
  const columnText = table.columns.map((c) => normalizeLabelText(String(c ?? ''))).join(' | ');
  const matches = EQUITY_CHANGES_COLUMN_MARKERS.reduce((count, marker) => count + (columnText.includes(marker) ? 1 : 0), 0);
  if (matches < 2) return false;
  const labelIndex = table.labelIndex;
  const labelText = table.rows.map((row) => normalizeLabelText(String(row[labelIndex] ?? ''))).join(' | ');
  // "TAI SAN QUAN LY THEO CAM KET" - dong tieu de rieng cua bang "Cac chi
  // tieu ngoai BCTHTC" (CTCK, Thong tu 210) - AGR con bi mat trang bang nay
  // vi CUNG trung marker cot voi bang BCDKT that o tren, dung lai chinh
  // marker da co san (OFF_BALANCE_SHEET_CONTENT_MARKERS) thay vi lap lai.
  if (
    labelText.includes('TAI SAN NGAN HAN') ||
    labelText.includes('TONG CONG TAI SAN') ||
    labelText.includes('TAI SAN QUAN LY THEO CAM KET')
  ) {
    return false;
  }
  return true;
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

  // SUA 2026-07-22 (xac nhan qua BTP that): "TANG GIAM"/"CHENH LECH" LA TU
  // VUNG BINH THUONG trong 1 bang LCTT (phuong phap gian tiep) THAT SU - vd
  // "Tăng, giảm các khoản phải thu"/"Tăng giảm hàng tồn kho" (dong dieu chinh
  // von luu dong, hau nhu bat buoc co) VA "Lãi, lỗ CHÊNH LỆCH tỷ giá hối đoái
  // do đánh giá lại..." (dong dieu chinh ty gia, rat pho bien voi cong ty co
  // giao dich ngoai te) - CA HAI deu la NOI DUNG DONG (row), khong phai TEN
  // COT nhu vi du "highlight table" that su ("Tổng doanh thu | Kỳ này | Kỳ
  // trước | Chênh lệch | Tỷ lệ tăng/giảm" - o do 2 cum tu nay la TEN COT).
  // Truoc day cham diem tren combinedText (gom CA rows), khien 1 bang LCTT
  // that (co ca 2 dong tren) bi hieu NHAM la bang tom tat, xoa mat toan bo
  // LCTT. Doi sang CHI xet table.columns (dung dung tin hieu CAU TRUC ma vi
  // du gom trong comment tren mo ta - TEN COT, khong phai noi dung dong).
  const columnText = table.columns.map((cell) => normalizeLabelText(String(cell ?? ''))).join(' | ');
  const hasTangGiam = columnText.includes('TANG GIAM') || columnText.includes('TANG/GIAM');
  const hasPercentChangeWording = columnText.includes('TY LE') && hasTangGiam;
  const hasDifferenceWording =
    columnText.includes('CHENH LECH') && (hasTangGiam || columnText.includes('SO VOI KY TRUOC') || columnText.includes('CUNG KY'));
  // SUA 2026-07-18 (FTS that): bang "giai trinh bien dong loi nhuan" (bat
  // buoc theo Thong tu 96/2020/TT-BTC, cong bo kem BCTC) dung dung ten dong
  // "Loi nhuan truoc thue"/"Loi nhuan sau thue" GIONG HET KQKD that nhung la
  // 1 bang tom tat rieng (don vi "Trieu dong" ghi NGAY TRONG ten cot, kem 1
  // cot "Bien dong (%)" o cuoi) - KQKD/BCDKT chuan khong bao gio dung "Bien
  // dong" lam ten cot (chi cong bo 1 dong "Don vi tinh" duy nhat ben ngoai
  // bang, khong co cot % rieng).
  const hasBienDongPercentWording = combinedText.includes('BIEN DONG') && combinedText.includes('%');
  return hasPercentChangeWording || hasDifferenceWording || hasBienDongPercentWording;
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

  const countMatches = (markers: ContentMarker[] | undefined): number =>
    (markers ?? []).reduce((count, marker) => count + (matchesContentMarker(labelText, marker) ? 1 : 0), 0);

  // Diem = (so NEO khop) * ANCHOR_WEIGHT + (so marker khop). Neo (tu khoa doc
  // quyen 1 bang) ap dao marker map mo, nen 1 bang chua neo cua LCTT khong the
  // bi lat thanh BCDKT chi vi tinh co chua "tien va tuong duong tien" (xem
  // ANCHOR_MARKERS_BY_KEY). Marker map mo van gop 1 diem le - CHI dung phan
  // xu khi KHONG bang nao co neo (giu nguyen hanh vi tho cu cho truong hop do).
  const scores = CONTENT_MARKERS_BY_KEY.map(({ key, markers }) => ({
    key,
    score: countMatches(ANCHOR_MARKERS_BY_KEY[key]) * ANCHOR_WEIGHT + countMatches(markers),
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
// SUA 2026-07-18 (CTS that): truoc day CHI set pendingContinuationKey khi gap
// tieu de khop "(Tiếp theo)", KHONG BAO GIO clear no khi gap tieu de KHAC -
// neu 1 tieu de "(Tiếp theo)" (vd "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG RIÊNG (tiếp
// theo)") lai dung ngay TRUOC 1 trang KHONG co bang that theo sau (vd trang
// chu ky nguoi lap/ke toan truong/nguoi dai dien - CTS lap lai tieu de KQKD
// "(tiếp theo)" o dau trang chu ky, khong con bang nao ca), pendingContinuationKey
// van CON SET khi vong lap toi duoc tieu de bao cao KHAC hoan toan (vd "BÁO
// CÁO LƯU CHUYỂN TIỀN TỆ...") va gan NHAM ca bang LCTT do vao incomeStatement.
// Tach rieng "tieu de GOC" (khong doi hoi "tiếp theo") de dung LAM TIN HIEU
// CLEAR: gap dung tieu de goc CUA 1 trong 3 mau bieu ma KHONG kem "tiếp theo"
// nghia la dang o 1 bang MOI/dau tien cua mau do (khong phai tiep noi bang
// truoc) - bat ke la CUNG mau hay mau KHAC, tin hieu "tiep noi" cu (neu co)
// da het hieu luc, phai clear. Neu tieu de KHONG khop mau bieu nao (vd ma so
// "B01a-CTCK", ten nguoi ky) thi GIU NGUYEN pendingContinuationKey - day la
// ly do KHONG the don gian "clear moi khi gap heading line", se pha vo truong
// hop hop le (tieu de that ngay sau lai co 1-2 dong ma-so/ten cong ty truoc
// khi toi bang that).
const STATEMENT_TITLE_BASE_MARKERS: { key: keyof FinancialStatements; test: (normalizedLine: string) => boolean }[] = [
  { key: 'balanceSheet', test: (l) => l.includes('BANG CAN DOI KE TOAN') || l.includes('BAO CAO TINH HINH TAI CHINH') },
  { key: 'incomeStatement', test: (l) => l.includes('KET QUA HOAT DONG') },
  { key: 'cashFlow', test: (l) => l.includes('LUU CHUYEN TIEN TE') },
];
// CTS that: tieu de LCTT thuc te dai hon 80 ky tu (MAX_HEADING_LINE_LENGTH)
// vi co gan them cau "cho ky ke toan ket thuc ngay..." - khong lot qua duoc
// looksLikeHeadingLine nen tin hieu CLEAR o tren khong bao gio kich hoat cho
// dung dong nay. Dung nguong RIENG, rong hon, CHI cho tin hieu title-base (an
// toan hon tang MAX_HEADING_LINE_LENGTH toan cuc - ham do con dung cho muc
// dich khac o noi khac trong file, xem dong su dung).
const MAX_STATEMENT_TITLE_LINE_LENGTH = 160;

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
      }
      // Xem comment o STATEMENT_TITLE_BASE_MARKERS: tieu de goc CO "tiep
      // theo" -> SET (hanh vi cu); tieu de goc KHONG co "tiep theo" -> CLEAR
      // (tin hieu tiep noi cu, neu co, da het hieu luc); khong khop tieu de
      // goc nao -> GIU NGUYEN (ma-so/ten cong ty/chu ky khong lam thay doi
      // trang thai dang cho). Dung nguong dai rieng (MAX_STATEMENT_TITLE_LINE_LENGTH),
      // KHONG dung looksLikeHeadingLine/MAX_HEADING_LINE_LENGTH o tren - xem
      // comment o do.
      const trimmedLine = lines[i].trim();
      if (trimmedLine.length > 0 && trimmedLine.length <= MAX_STATEMENT_TITLE_LINE_LENGTH && !trimmedLine.startsWith('|')) {
        const normalized = normalizeLabelText(lines[i]);
        const titleBase = STATEMENT_TITLE_BASE_MARKERS.find((m) => m.test(normalized));
        if (titleBase) pendingContinuationKey = normalized.includes('TIEP THEO') ? titleBase.key : undefined;
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

// SUA 2026-07-18 (theo yeu cau nguoi dung, xac nhan qua BSL that): Mistral OCR
// DOI KHI tra 1 bang KHONG PHAI markdown "| ... |" chuan, ma la 1 KHOI JSON
// mo ta anh (dang "[{"box_2d": [...], "label": "table", "caption": "<table>
// ...</table>"}]") - xac nhan qua OCR LAI RIENG 1 trang (BSL, trang 7, LCTT
// "hoat dong tai chinh") CHO KET QUA GIONG HET, chung to day KHONG PHAI do
// ngu canh cac trang xung quanh ma la Mistral nhat quan xu ly bang nay theo
// kieu do (co the do cau truc bang goc trong PDF bat thuong - 4 cot header
// nhung 2 cot trung ten "30/6/2025"). DU LIEU (bang HTML nhung trong "caption")
// van con nguyen, chi khac dinh dang - chuyen doi THANH bang markdown "| ... |"
// TUONG DUONG TRUOC KHI vao pipeline parse chinh, tai dung 100% logic parse/
// phan loai/neo da kiem chung thay vi tao 1 duong xu ly song song rieng.
//
// LUU Y QUAN TRONG: khoi JSON nay co the bi Mistral CAT CUT GIUA CHUNG (xac
// nhan qua BSL - dung ngay giua 1 the <b>, thieu han dong cuoi cung "Tien cuoi
// ky"). Regex CHI trich CAC DONG <tr>...</tr> HOAN CHINH (doi hoi ca the dong
// "</tr>") - dong bi cat cut se KHONG khop, tu dong bi bo qua AN TOAN (mat 1
// phan du lieu that bi Mistral cat, khong phai loi tach dong sai).
const JSON_CAPTION_TABLE_START = /\[\{"box_2d":\s*\[[^\]]*\],\s*"label":\s*"table",\s*"caption":\s*"((?:[^"\\]|\\.)*)/g;

function unescapeJsonCaptionString(s: string): string {
  return s.replace(/\\"/g, '"').replace(/\\\//g, '/').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
}

function stripHtmlToPlainCell(cellHtml: string): string {
  return cellHtml
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?b>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlTableToRows(html: string): string[][] {
  const rows: string[][] = [];
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRe.exec(html)) !== null) {
    const cells: string[] = [];
    const cellRe = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(trMatch[1])) !== null) cells.push(stripHtmlToPlainCell(cellMatch[1]));
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

// SUA 2026-07-18 (theo phan hoi nguoi dung, xac nhan qua BSL that): khi tao
// khoi JSON-caption, Mistral DOI KHI TU NHAN DOI 1 cot header (vd "Quý 2 kết
// thúc ngày 30/6/2025 VND" xuat hien LIEN TIEP 2 LAN) trong khi PHAN CON LAI
// cua tai lieu (cac muc LCTT khac cung bang - "hoat dong kinh doanh"/"dau tu")
// CHI co 2 cot gia tri that (Quy 2 nam nay, Quy 2 nam truoc) - nguoi dung xac
// nhan qua doi chieu PDF goc truc tiep. DA CHUNG MINH BANG SO HOC (khop dung
// tong "Luu chuyen tien thuan tu hoat dong tai chinh" da biet, ca 2 cot 2026
// VA 2025) rang trong MOI cap header GIONG HET nhau LIEN TIEP, cot GIU LAI
// DUNG la cot SAU CUNG trong cap (cot truoc do la "ao", lap lai nham) - ap
// dung cho TAT CA cac dong (header va du lieu), dua tren TIN HIEU CAU TRUC
// (header trung chu lien tiep), khong phai suy doan rieng cho tung dong.
function dropDuplicateAdjacentHeaderColumns(rows: string[][]): string[][] {
  if (rows.length === 0) return rows;
  const header = rows[0];
  const keepIndexes: number[] = [];
  for (let i = 0; i < header.length; i++) {
    const isDuplicateOfNext = i + 1 < header.length && header[i].trim() !== '' && header[i].trim() === header[i + 1].trim();
    if (isDuplicateOfNext) continue; // bo cot nay - giu cot SAU (i+1) o buoc lap ke tiep
    keepIndexes.push(i);
  }
  if (keepIndexes.length === header.length) return rows;
  return rows.map((row) => keepIndexes.map((idx) => row[idx] ?? ''));
}

// Chuyen 1 khoi JSON-caption-bang THANH bang markdown "| ... |" tuong duong
// (dong dau tu <thead> lam header, chen dong phan cach, cac dong con lai lam
// du lieu - dung quy uoc "dong dau la header" xac nhan qua cau truc BSL that:
// <thead><tr><th>...</th></tr></thead><tr><td>...). Neu khong trich duoc dong
// nao (khong khop regex/khong co du lieu) - GIU NGUYEN van ban goc, khong lam
// mat du lieu.
function convertJsonCaptionTablesToMarkdown(markdown: string): string {
  return markdown.replace(JSON_CAPTION_TABLE_START, (fullMatch, rawCaption: string) => {
    const html = unescapeJsonCaptionString(rawCaption);
    const rowsRaw = htmlTableToRows(html);
    if (rowsRaw.length === 0) return fullMatch;
    const rows = dropDuplicateAdjacentHeaderColumns(rowsRaw);
    const colCount = Math.max(...rows.map((r) => r.length));
    const pad = (row: string[]) => {
      const padded = [...row];
      while (padded.length < colCount) padded.push('');
      return padded;
    };
    const mdRows = rows.map((r) => `| ${pad(r).join(' | ')} |`);
    const separator = `| ${new Array(colCount).fill('---').join(' | ')} |`;
    // SUA 2026-07-18 (BSL that): THEM 1 dong tieu de "#" TRUNG LAP (khong khop
    // bat ky content marker cu the nao - INCOME_STATEMENT_PART_MARKERS/
    // CONTINUATION_HEADING_MARKERS) NGAY TRUOC bang moi chuyen doi. Neu khong,
    // parseAllTablesInRange (vong lap chinh) co the coi doan van xuoi ngay
    // TRUOC no (ten cong ty/ten mau bieu/can cu phap ly, ~8-10 dong) la "rac
    // duoc phep xuyen qua" (nguong 12 dong, thiet ke cho watermark OCR - xem
    // comment o do) va NOI NHAM bang moi nay vao LIEN TUC voi bang LCTT truoc
    // do (thay vi tach thanh 2 bang con rieng biet de mostCommonColumns/
    // alignRowToColumns xu ly dung nhu thiet ke) - gay dong tieu de phu (sub-
    // header 2-dong cua bang TRUOC) bi lap lai nham thanh 1 dong du lieu rac
    // giua chung. Dong "#" la ranh gioi CUNG DUY NHAT khong tinh vao nguong 12
    // dong (xem dieu kien rieng ngay dau vong lap trong).
    return `\n# (Bảng phục hồi từ OCR)\n\n${mdRows[0]}\n${separator}\n${mdRows.slice(1).join('\n')}\n`;
  });
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
  const lines = convertJsonCaptionTablesToMarkdown(markdown).split(/\r?\n/);
  return findCashFlowEndingIndex(lines, 0) !== -1;
}

// Phat hien (KHONG sua) truong hop pha vo gia dinh THIET KE cua co che cat
// pham vi ngay tren/parseStatementsFromMarkdown duoi: ca he thong gia dinh
// LCTT LUON la bang CUOI CUNG trong 3 bang chinh truoc Thuyet minh (dung
// diem ket thuc LCTT lam diem cat "notesLine" - moi thu SAU diem do bi coi
// la Thuyet minh va bi bo qua). Da xac nhan that WSS Q2/2026 (2026-07-22,
// CTCK mau "Rieng"): tai lieu goc co THU TU KHAC - LCTT (+ 1 bang LCTT phu
// "hoat dong moi gioi/uy thac") nam TRUOC KQKD, khien diem cat roi dung
// GIUA tai lieu va KQKD (nam SAU diem cat) bi mat trang hoan toan du van con
// nguyen trong markdown OCR. Day la thay doi GIA DINH KIEN TRUC (tim dong
// thoi CA 3 diem ket thuc BCDKT/KQKD/LCTT roi lay diem XA NHAT, thay vi 1
// diem cat duy nhat theo thu tu co dinh), rui ro regression cao cho ca kho
// bao cao dang dung dung thu tu chuan - CHU DINH KHONG sua o day, chi phat
// hien de bao canh bao RO RANG cho nguoi dung tu kiem tra tay (xem
// buildResultFromMarkdown, lib/export/financial-statements.ts) thay vi de
// KQKD/BCDKT am tham bien mat khong dau vet nhu truoc.
// 3 phuong an do THAT BAI truoc khi chot phuong an duoi (kiem chung qua toan
// bo corpus 234 bao cao cache, scripts/_debug-order-violation-corpus-check.ts):
//  1) Khop tu khoa THEO TUNG DONG (moi marker, ke ca marker map mo): ~21% bao
//     cao BINH THUONG bi bao nham (vd VCK - da xac nhan la bao cao BINH
//     THUONG) vi bang chi tiet Thuyet minh (giai trinh doanh thu/tai san
//     theo loai...) thuong xuyen dung lai dung tu vung BCDKT/KQKD.
//  2) classifyTableByContent (cham diem CA BANG qua neo + marker map mo,
//     dung de gan bang chinh trong parseStatementsFromMarkdown duoi) tren
//     TUNG BANG sau diem cat cashFlowEndingIndex: van con ~16% bao nham - vua
//     ke thua rui ro marker map mo o (1), VUA phu thuoc cashFlowEndingIndex
//     (co the SAI vi 1 nguyen nhan hoan toan khac - da xac nhan qua ORS/IMP:
//     dong TOC/dong trong bi nham la diem ket thuc LCTT that, khong lien
//     quan gi den thu tu tai lieu - la 1 LOP LOI RIENG, khong nen tron voi
//     canh bao nay).
//  3) Dung ANCHOR_MARKERS_BY_KEY (chi neo, khong marker map mo) nhung VAN so
//     sanh voi cashFlowEndingIndex nhu (2): van dinh loi phu thuoc diem cat
//     sai o tren (ORS/IMP), VA van con vai truong hop neo BCDKT/KQKD xuat
//     hien trong 1 bang CHINH SACH KE TOAN/thuyet minh chinh sach (vd CSV:
//     bang lich khau hao TSCD nhac lai "Tai san co dinh vo hinh" trong PHAN
//     MO TA chinh sach, khong phai so lieu that; GGG: doan van mo ta nguyen
//     tac ghi nhan doanh thu hop dong xay dung nhac "Doanh thu thuan").
// Phuong an CUOI: BO HAN buoc tim diem cat (khong con phu thuoc
// findCashFlowEndingIndex/cashFlowEndingIndex nua) - so sanh THANG vi tri
// XUAT HIEN DAU TIEN cua 1 neo LCTT (ANCHOR_MARKERS_BY_KEY.cashFlow) so voi
// vi tri XUAT HIEN DAU TIEN cua 1 neo KQKD, CHI tren cac dong la HANG BANG
// THAT (splitMarkdownRow khac null - loai doan van mo ta chinh sach nhu GGG,
// thuong la van xuoi khong nam trong bang) VA nam trong 1 bang du du lieu
// (>=3 dong). Neu neo LCTT xuat hien SOM HON neo KQKD dau tien trong ca tai
// lieu - dung LA vi pham thu tu (LCTT truoc KQKD), khop CHINH XAC dinh nghia
// bug WSS, khong con lien quan gi den viec diem cat co tinh dung hay khong.
// (Cham RIENG voi incomeStatement, KHONG gop ca balanceSheet - xem comment o
// detectCashFlowBeforeOtherStatementsOrderViolation duoi: BCDKT LUON nam
// TRUOC LCTT trong ca 2 thu tu, gop vao se che mat vi pham that.)
function findFirstAnchorTableLineIndex(lines: string[], normalizedLines: string[], tables: ParsedTable[], keys: ('balanceSheet' | 'incomeStatement' | 'cashFlow')[]): number {
  const anchors = keys.flatMap((key) => ANCHOR_MARKERS_BY_KEY[key] ?? []);
  let best = -1;
  for (const t of tables) {
    if (t.rows.length < 3) continue;
    if (isEquityChangesStatementTable(t) || isCoverPageOrSummaryTable(t)) continue;
    for (let i = t.startLineIndex; i < t.endLineIndex; i++) {
      if (splitMarkdownRow(lines[i]) === null) continue;
      if (anchors.some((marker) => matchesContentMarker(normalizedLines[i], marker))) {
        if (best === -1 || i < best) best = i;
        break;
      }
    }
  }
  return best;
}

export function detectCashFlowBeforeOtherStatementsOrderViolation(markdown: string): boolean {
  const lines = convertJsonCaptionTablesToMarkdown(markdown).split(/\r?\n/);
  const normalizedLines = lines.map((l) => normalizeLabelText(l));
  const tables = parseAllTablesInRange(lines);
  const cashFlowFirst = findFirstAnchorTableLineIndex(lines, normalizedLines, tables, ['cashFlow']);
  if (cashFlowFirst === -1) return false;
  // CHI so voi incomeStatement (KHONG gop ca balanceSheet): BCDKT LUON nam
  // TRUOC LCTT trong ca thu tu CHUAN LAN thu tu bat thuong cua WSS (BCDKT ->
  // LCTT -> KQKD, thay vi BCDKT -> KQKD -> LCTT) - gop ca balanceSheet vao se
  // luon lay duoc vi tri BCDKT (som hon LCTT o CA 2 thu tu) lam
  // "mainStatementFirst", che mat chinh vi pham that (KQKD nam SAU LCTT).
  const incomeStatementFirst = findFirstAnchorTableLineIndex(lines, normalizedLines, tables, ['incomeStatement']);
  if (incomeStatementFirst === -1) return false;
  return cashFlowFirst < incomeStatementFirst;
}

export function parseStatementsFromMarkdown(rawMarkdown: string): FinancialStatements {
  const markdown = convertJsonCaptionTablesToMarkdown(rawMarkdown);
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
    const matchedTables = dropRedundantDuplicateTables(
      hasDetailPart ? grouped[key].filter((t) => t.incomeStatementPart !== 'summary') : grouped[key]
    );
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

// TT99/2025 buoc mot so doanh nghiep cong bo CA mau "Q-02x" (rieng cho ky Quy,
// co ca cot Quy LAN cot Luy ke) LAN mau "B02-DN" chuan (ky giua nien do, CHI co
// cot Luy ke) cho CUNG 1 bao cao KQKD - xac nhan qua markdown that TTS/TIS/IFS
// Q2/2026. 2 bang nay lap lai GAN NHU TOAN BO cung 1 danh sach chi tieu (tu
// "Doanh thu ban hang" den "Loi nhuan sau thue"), khac nhau o SO COT gia tri.
// Neu gop chung nhu 2 NUA bo sung that cua 1 bang (vd BCDKT tach TAI SAN/NGUON
// VON qua trang) bang flatMap, cac dong TRUNG TEN gay: (1) du lieu hien trong
// Excel co hang chuc dong lap/rac; (2) findRowIndexByContentMarkers (uu tien
// "khop cuoi cung" de xu ly rac dau/cuoi bang - xem statement-shared.ts) co
// the chon nham dong cua bang IT COT hon (cac cot con thieu = null) lam
// target/term, gay canh bao sai "X khong khop X" du du lieu goc hoan toan
// dung (xac nhan qua TTS/TIS that: dong "Loi nhuan gop" bi doc thanh 0 vi
// khop nham vao ban sao chi co cot Luy ke).
//
// Phan biet voi 2 NUA bo sung THAT (TAI SAN/NGUON VON, Phan I/Phan II bao
// hiem...) qua TY LE NHAN TEN CHI TIEU TRUNG NHAU: 2 nua bo sung that gan nhu
// khong co ten chung nhau (moi nua mo ta 1 tap chi tieu khac nhau hoan toan),
// trong khi 2 ban sao cua CUNG 1 bao cao lap lai da so ten. Day la tin hieu
// CAU TRUC (dua vao NOI DUNG chi tieu, khong dua vao ten mau bieu/tu khoa rieng
// cua tung thong tu) nen ap dung chung cho ca 4 loai bang, khong rieng KQKD.
function normalizedRowLabelSet(table: ParsedTable): Set<string> {
  const labels = new Set<string>();
  for (const row of table.rows) {
    const raw = row[table.labelIndex];
    if (typeof raw !== 'string') continue;
    const normalized = normalizeGroupLabelForContentMatch(raw);
    if (normalized) labels.add(normalized);
  }
  return labels;
}

function dropRedundantDuplicateTables(tables: ParsedTable[]): ParsedTable[] {
  // Bang co continuationKey da duoc xac nhan CHAC CHAN la phan tiep cua 1
  // bang khac qua tieu de "(Tiếp theo)" that - khong xet trung o day, luon
  // giu lai nguyen ven.
  const candidateIdx = tables.map((_, idx) => idx).filter((idx) => tables[idx].continuationKey === undefined);
  if (candidateIdx.length < 2) return tables;

  // 1 bang bi ngat trang (page break) co the tach thanh NHIEU bang markdown
  // rieng ma KHONG co tieu de "(Tiếp theo)" (xac nhan qua TTS that: KQKD 23
  // dong tach thanh 2 bang 17+6 dong o 2 trang, khong co continuationKey) -
  // so sanh TUNG fragment rieng le voi bang trung lap se KHONG vuot nguong
  // (moi fragment chi mang 1 phan nho danh sach chi tieu). Nhom cac bang
  // CUNG so cot lai truoc (fragment cua 1 bang giu nguyen so cot qua cac
  // trang), dung UNION nhan cua ca nhom de so sanh trung lap.
  const clusters = new Map<number, number[]>(); // columns.length -> danh sach idx (vao `tables`)
  for (const idx of candidateIdx) {
    const key = tables[idx].columns.length;
    const arr = clusters.get(key) ?? [];
    arr.push(idx);
    clusters.set(key, arr);
  }
  const clusterKeys = [...clusters.keys()];
  const clusterLabelSets = clusterKeys.map((key) => {
    const set = new Set<string>();
    for (const idx of clusters.get(key)!) for (const label of normalizedRowLabelSet(tables[idx])) set.add(label);
    return set;
  });

  const droppedClusterKeys = new Set<number>();
  for (let x = 0; x < clusterKeys.length; x++) {
    if (droppedClusterKeys.has(x)) continue;
    for (let y = x + 1; y < clusterKeys.length; y++) {
      if (droppedClusterKeys.has(y)) continue;
      const a = clusterLabelSets[x];
      const b = clusterLabelSets[y];
      if (a.size === 0 || b.size === 0) continue;
      let shared = 0;
      for (const label of a) if (b.has(label)) shared++;
      const overlapRatio = shared / Math.min(a.size, b.size);
      // Nguong cao (60%+, toi thieu 3 chi tieu trung) - chi bat cac truong hop
      // trung lap RO RANG, tranh loai oan 2 nua bo sung that tinh co chung 1-2
      // ten chi tieu pho bien.
      if (shared < 3 || overlapRatio < 0.6) continue;
      // La 2 ban sao cua cung 1 bao cao - giu cluster co nhieu cot gia tri
      // hon (sieu tap thong tin, xac nhan qua TTS/TIS/IFS: mau Q-02x luon co
      // ca Quy LAN Luy ke, mau B02-DN chi co Luy ke).
      const loser = clusterKeys[x] >= clusterKeys[y] ? y : x;
      droppedClusterKeys.add(loser);
    }
  }
  if (droppedClusterKeys.size === 0) return tables;
  const droppedIdx = new Set<number>();
  droppedClusterKeys.forEach((x) => clusters.get(clusterKeys[x])!.forEach((idx) => droppedIdx.add(idx)));
  return tables.filter((_, idx) => !droppedIdx.has(idx));
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
