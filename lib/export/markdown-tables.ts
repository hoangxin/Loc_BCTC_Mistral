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
const SECTION_MARKERS: { key: keyof FinancialStatements; markers: string[] }[] = [
  { key: 'balanceSheet', markers: ['BANG CAN DOI KE TOAN'] },
  { key: 'incomeStatement', markers: ['KET QUA HOAT DONG KINH DOANH', 'KET QUA KINH DOANH'] },
  { key: 'cashFlow', markers: ['LUU CHUYEN TIEN TE'] },
];

// Dung de CHAN pham vi muc cuoi cung (Luu chuyen tien te) khi dau vao la TOAN
// VAN CA TAI LIEU (ke ca Thuyet minh - xem lib/export/full-document.ts, goi
// ham nay tren markdown KHONG gioi han trang, khac voi lib/pipeline.ts Buoc 2
// van chi truyen pham vi truoc Thuyet minh nhu cu). Neu khong chan, muc cuoi
// se "nuot" het hang chuc bang phu trong Thuyet minh (khong co muc nao sau no
// trong SECTION_MARKERS de lam moc dung). Dung DUNG cu phap ("|" y het cach
// SECTION_MARKERS o tren) khong can fuzzy-match kieu Tesseract (lib/pdf-text.ts)
// vi day la OCR Mistral, do chinh xac cao hon nhieu - test that: dong chan
// trang lap "Cac thuyet minh la MOT BO PHAN KHONG TACH ROI cua Bao cao tai
// chinh nay" KHONG khop chuoi lien tiep "THUYET MINH BAO CAO TAI CHINH" (co
// chen them tu o giua) nen khong bi nham voi tieu de chuong that.
const NOTES_SECTION_MARKERS = ['THUYET MINH BAO CAO TAI CHINH', 'THUYET MINH BCTC'];

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
export function parseStatementsFromMarkdown(markdown: string): FinancialStatements {
  const lines = markdown.split(/\r?\n/);
  const normalizedLines = lines.map((l) => normalizeLabelText(l));

  // Trang bia BCTC hau nhu luon co 1 "muc luc" liet ke CA 3 ten bang (+
  // Thuyet minh) cung luc, dang 1 dong BANG markdown rieng (vd "| Bảng cân đối
  // kế toán | : Mẫu số B01 - DN |") - da gap that (2026-07-05, smoke test):
  // neu tim khop DAU TIEN se bat trung dong muc luc nay cho CA 3 marker (nam
  // sat nhau vai dong), khien 2 muc dau (balanceSheet/incomeStatement) co
  // pham vi chi vai dong (rong, khong bang nao), va cashFlow (marker cuoi
  // cung trong danh sach SECTION_MARKERS) "nuot" toan bo phan con lai cua tai
  // lieu - dung ca 3 bang that lan vao 1 key. Fix: bo qua cac dong dang BANG
  // ("|...|", muc luc trang bia luon o dang nay) khi tim tieu de muc - tieu de
  // that su la dong van ban thuong (vd "# **BẢNG CÂN ĐỐI KẾ TOÁN**").
  const sectionStarts: { key: keyof FinancialStatements; startLine: number }[] = [];
  for (const { key, markers } of SECTION_MARKERS) {
    const idx = normalizedLines.findIndex((line, i) => looksLikeHeadingLine(lines[i]) && markers.some((m) => line.includes(m)));
    if (idx !== -1) sectionStarts.push({ key, startLine: idx });
  }
  sectionStarts.sort((a, b) => a.startLine - b.startLine);

  const result: FinancialStatements = {
    balanceSheet: { columns: [], rows: [] },
    incomeStatement: { columns: [], rows: [] },
    cashFlow: { columns: [], rows: [] },
  };

  for (let s = 0; s < sectionStarts.length; s++) {
    const { key, startLine } = sectionStarts[s];
    let endLine = s + 1 < sectionStarts.length ? sectionStarts[s + 1].startLine : lines.length;
    if (s === sectionStarts.length - 1) {
      // Muc cuoi cung - neu dau vao la toan van ca tai lieu (xem comment
      // NOTES_SECTION_MARKERS) thi phai tu chan truoc "Thuyet minh", khong de
      // mac dinh chay toi het van ban.
      const notesLine = normalizedLines.findIndex(
        (line, i) => i > startLine && looksLikeHeadingLine(lines[i]) && NOTES_SECTION_MARKERS.some((m) => line.includes(m))
      );
      if (notesLine !== -1) endLine = notesLine;
    }
    const tables = parseAllTablesInRange(lines.slice(startLine, endLine));

    const relevantTables = tables.filter((t) => t.rows.length >= 3);
    if (relevantTables.length > 0) {
      const columns = relevantTables.reduce((a, b) => (b.columns.length > a.length ? b.columns : a), relevantTables[0].columns);
      result[key] = { columns, rows: relevantTables.flatMap((t) => t.rows) };
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
