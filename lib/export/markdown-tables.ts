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
  const codeCells = remaining.filter((c) => typeof c === 'string' && MA_SO_PATTERN.test(c.trim()));
  const valueCells = remaining.filter((c) => !(typeof c === 'string' && MA_SO_PATTERN.test(c.trim())));

  if (maSoIdx !== -1 && codeCells.length > 0) result[maSoIdx] = codeCells[0];

  const valueSlots = columns.map((_, i) => i).filter((i) => i !== labelColumnIndex && i !== maSoIdx);
  valueSlots.slice(-valueCells.length).forEach((slot, k) => {
    result[slot] = valueCells[k];
  });

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

const CONTENT_MARKERS_BY_KEY: { key: keyof FinancialStatements; markers: string[] }[] = [
  { key: 'balanceSheet', markers: BALANCE_SHEET_CONTENT_MARKERS },
  { key: 'incomeStatement', markers: INCOME_STATEMENT_CONTENT_MARKERS },
  { key: 'cashFlow', markers: CASH_FLOW_CONTENT_MARKERS },
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

// Tim TAT CA bang markdown ("header" + dong phan cach "---" + cac dong du
// lieu) trong 1 pham vi dong cho truoc.
function parseAllTablesInRange(lines: string[]): StatementTable[] {
  const tables: StatementTable[] = [];
  let i = 0;
  while (i < lines.length) {
    const headerCells = splitMarkdownRow(lines[i]);
    if (!headerCells) {
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
    let blankRun = 0;
    while (j < lines.length) {
      // Mistral noi cac trang bang "\n\n" - 1 dong trong ngan giua 2 trang
      // KHONG co nghia la bang da het (da gap that voi TIX: 1 dong trong duy
      // nhat o ranh gioi trang khien bang bi cat som, roi dong ngay sau do -
      // vo tinh co dau "---" theo sau - bi hieu nham thanh header cua 1 bang
      // MOI, lam mat han dong do khoi du lieu that). Cho phep "di xuyen" qua
      // toi da 2 dong trong lien tiep truoc khi ket luan bang da het.
      if (lines[j].trim() === '') {
        blankRun++;
        if (blankRun > 2) break;
        j++;
        continue;
      }
      const rowCells = splitMarkdownRow(lines[j]);
      if (!rowCells) break;
      blankRun = 0;
      if (isSeparatorRow(rowCells)) {
        j++; // dong phan cach GIA chen giua bang (ngat trang) - bo qua, khong phai du lieu that
        continue;
      }
      const realigned = realignRowByContent(rowCells, headerCells, labelIdx);
      rows.push(realigned.map((cell, idx) => (idx === labelIdx || cell === null ? cell : parseNumericCell(cell))));
      j++;
    }
    tables.push({ columns: headerCells, rows });
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
  return lines.some((line) => looksLikeHeadingLine(line) && NOTES_SECTION_MARKERS.some((m) => normalizeLabelText(line).includes(m)));
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
  const allContentMarkers = [...BALANCE_SHEET_CONTENT_MARKERS, ...INCOME_STATEMENT_CONTENT_MARKERS, ...CASH_FLOW_CONTENT_MARKERS];
  const firstContentLine = normalizedLines.findIndex((line) => allContentMarkers.some((m) => line.includes(m)));
  const notesLine = normalizedLines.findIndex(
    (line, i) =>
      (firstContentLine === -1 || i > firstContentLine) &&
      looksLikeHeadingLine(lines[i]) &&
      NOTES_SECTION_MARKERS.some((m) => line.includes(m))
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

  const grouped: Record<keyof FinancialStatements, StatementTable[]> = {
    balanceSheet: [],
    incomeStatement: [],
    cashFlow: [],
  };
  for (const table of tables) {
    const key = classifyTableByContent(table);
    if (key) grouped[key].push(table);
  }

  const result: FinancialStatements = {
    balanceSheet: { columns: [], rows: [] },
    incomeStatement: { columns: [], rows: [] },
    cashFlow: { columns: [], rows: [] },
  };
  for (const key of ['balanceSheet', 'incomeStatement', 'cashFlow'] as const) {
    const matchedTables = grouped[key];
    if (matchedTables.length > 0) {
      const columns = matchedTables.reduce((a, b) => (b.columns.length > a.length ? b.columns : a), matchedTables[0].columns);
      result[key] = { columns, rows: matchedTables.flatMap((t) => t.rows) };
    }
  }

  return result;
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
