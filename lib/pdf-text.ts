import { readFile } from 'fs/promises';
// QUAN TRONG: van phai import truoc 'pdf-parse' du file nay KHONG con goi
// getScreenshot() nua (da bo Tesseract) - crash "DOMMatrix is not defined"
// gap phai tren Vercel (2026-07-07) xay ra NGAY LUC IMPORT 'pdf-parse' (module
// pdfjs-dist ben trong co code o muc module chay ngay khi require, "new
// DOMMatrix()" - KHONG doi toi luc goi ham render nao ca), nen chi can
// `import { PDFParse } from 'pdf-parse'` o day (dung cho getText(), doc thu
// khong OCR) la DU DE KICH HOAT LAI crash do neu thieu import nay truoc.
import { CanvasFactory } from 'pdf-parse/worker';
import { PDFParse } from 'pdf-parse';

// Nguong toi thieu (tren TUNG TRANG) de coi la "trang co text layer that su".
// Quan trong: kiem tra theo tung trang chu KHONG phai cong don ca tai lieu -
// nhieu BCTC scan co trang bia la PDF that (co chu that) nhung tat ca cac
// trang so lieu con lai la anh scan; neu kiem tra tren tong do dai ca file thi
// text cua rieng trang bia cung du vuot nguong va bo sot OCR cho toan bo
// phan con lai (da gap that voi file FIR_...).
const MIN_PAGE_TEXT_LENGTH = 30;
const DETECT_CONCURRENCY = 2;

// Dung chung o day (tim diem cat tren text layer THAT) va lib/export/transcribe.ts
// (chia lo trang de goi vision model) - tranh 2 noi tu dinh nghia logic
// fuzzy-match rieng.
const COMBINING_DIACRITICS = new RegExp('[̀-ͯ]', 'g');

function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toUpperCase();
}

// Phan biet ban tieng Viet voi ban tieng Anh CUNG 1 BCTC (Vietstock thuong
// kem ca 2 ban trong 1 zip, xem lib/report-source.ts isEnglishVariantEntry -
// loc theo TEN FILE that bai voi cac file KHONG co dau hieu ngon ngu trong
// ten, vd "HCM_Baocaotaichinh_Q1_2026.pdf" vs "..._1.pdf", da gap that
// 2026-07-12). Kiem tra theo NOI DUNG: mat do ky tu co dau tieng Viet (dau
// thanh sau khi tach NFD, VA chu "d") tren tong so ky tu chu - van ban tieng
// Viet that (BCTC) luon co ty le RAT CAO (~0.33-0.38, do that tren mau OCR
// TIX/MBS that), tieng Anh gan nhu tuyet doi 0 (khong co dau nao). Nguong
// 0.03 thap hon ~10 lan so voi ty le that de chiu duoc trang ít chu/nhieu
// bang so, van cach xa tuyet doi voi tieng Anh.
const VIETNAMESE_DIACRITIC_RATIO_THRESHOLD = 0.03;

export function vietnameseDiacriticRatio(text: string): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const normalized = text.normalize('NFD');
  const diacriticCount = (normalized.match(COMBINING_DIACRITICS) ?? []).length;
  const dCount = (text.match(/đ|Đ/g) ?? []).length; // "d" KHONG tach duoc qua NFD (la 1 ky tu rieng, khong phai d+dau ket hop)
  return (diacriticCount + dCount) / letters.length;
}

export function looksLikeVietnameseText(text: string): boolean {
  return vietnameseDiacriticRatio(text) >= VIETNAMESE_DIACRITIC_RATIO_THRESHOLD;
}

// Levenshtein + fuzzy match - dung rieng cho truong hop text layer THAT (PDF
// born-digital) vi text nay van co the co loi go/OCR-nguon-goc nhe. Truong
// hop scan (xem needsOcrProbe duoi) khong con qua day nua - Mistral OCR do
// chinh xac cao hon Tesseract nhieu, khop chuoi thang o lib/export/markdown-tables.ts
// la du, khong can fuzzy.
function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[] = new Array(rows * cols);
  for (let i = 0; i < rows; i++) dp[i * cols] = i;
  for (let j = 0; j < cols; j++) dp[j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i * cols + j] = Math.min(
        dp[(i - 1) * cols + j] + 1,
        dp[i * cols + (j - 1)] + 1,
        dp[(i - 1) * cols + (j - 1)] + cost
      );
    }
  }
  return dp[rows * cols - 1];
}

function fuzzyMatch(text: string, target: string): boolean {
  const haystack = text.replace(/\s+/g, '');
  const needle = target.replace(/\s+/g, '');
  const maxDistance = Math.max(1, Math.round(needle.length * 0.25));
  for (const size of [needle.length - 1, needle.length, needle.length + 1]) {
    if (size <= 0) continue;
    for (let start = 0; start + size <= haystack.length; start++) {
      if (levenshteinDistance(haystack.slice(start, start + size), needle) <= maxDistance) return true;
    }
  }
  return false;
}

// Chan duoi hau het cac trang BCTC co dong chu thich phap ly nhac lai cum
// "thuyet minh" ("Cac thuyet minh la mot bo phan khong tach roi cua Bao cao
// tai chinh nay") - XUAT HIEN O MOI TRANG, khac hoan toan voi tieu de chuong
// "THUYET MINH BAO CAO TAI CHINH" chi xuat hien 1 lan dung ngay dau chuong.
// Da gap that: dong chan trang nay bi hieu nham la diem bat dau chuong,
// khien cat mat gan het noi dung 3 bang chi con 2 trang. Dau hieu phan biet:
// dong chan trang luon co them cum "khong tach roi".
function isDisclaimerFooterLine(normalizedLine: string): boolean {
  return fuzzyMatch(normalizedLine, 'KHONG TACH ROI');
}

function isNotesMarkerFuzzy(normalizedText: string): boolean {
  if (isDisclaimerFooterLine(normalizedText)) return false;
  return fuzzyMatch(normalizedText, 'THUYET MINH BAO CAO TAI CHINH') || fuzzyMatch(normalizedText, 'THUYET MINH BCTC');
}

// Trang bia BCTC hau nhu luon co dong muc luc liet ke "Thuyet minh bao cao
// tai chinh : Mau so B09-DN" cung voi ten 3 bang kia - day la false positive
// da tung gap voi truncateBeforeNotes o lib/export/financial-statements.ts
// (fix bang cach doi vi tri khop > 2000 ky tu). O day kiem tra theo TUNG
// TRANG nen ap dung chot chan tuong duong: chi chap nhan diem cat "thuyet
// minh" SAU KHI da thay it nhat 1 trong 3 tieu de bang that su (chung to da
// qua khoi trang bia, dang o giua noi dung bang, khong phai dang doc muc luc).
function isStatementSectionMarker(normalizedText: string): boolean {
  return (
    fuzzyMatch(normalizedText, 'CAN DOI KE TOAN') ||
    fuzzyMatch(normalizedText, 'TINH HINH TAI CHINH') || // mau B01a-CTCK (cong ty chung khoan)
    fuzzyMatch(normalizedText, 'KET QUA HOAT DONG KINH DOANH') ||
    fuzzyMatch(normalizedText, 'KET QUA KINH DOANH') ||
    fuzzyMatch(normalizedText, 'KET QUA HOAT DONG') || // mau B02a-CTCK (cong ty chung khoan)
    fuzzyMatch(normalizedText, 'LUU CHUYEN TIEN TE')
  );
}

interface CutoffProbeEntry {
  num: number;
  text: string;
}

// Tim trang dau tien la diem cat hop le: phai o TRANG KHAC (sau) trang da
// thay tieu de bang that su - KHONG chi "da tung thay truoc do trong text",
// vi trang bia/muc luc thuong liet ke CA 4 dong "Bang can doi ke toan...",
// "...Luu chuyen tien te...", "Thuyet minh bao cao tai chinh..." NGAY TREN
// CUNG 1 TRANG (da gap that: bao HSG, ca 4 dong nam chung trong muc luc trang
// bia) - neu chi kiem tra "da thay flag=true" thi trang bia se tu khop ca 2
// dieu kien cung luc, cat nham ngay tu trang 1.
// Kiem tra theo TUNG DONG rieng le trong trang (khong phai ca khoi text cua
// trang gop lai) - vi trang dau chuong thuyet minh THAT SU van co dong chan
// trang o cuoi (footer xuat hien tren moi trang) - neu ghep ca trang thanh 1
// chuoi roi loai tru theo "khong tach roi" thi se loai nham ca trang tieu de
// that (no cung co dong chan trang do o cuoi trang).
function findNotesCutoffEntry(entries: CutoffProbeEntry[], pageNumbersInOrder: number[]): CutoffProbeEntry | undefined {
  const entryByNum = new Map(entries.map((entry) => [entry.num, entry]));
  let statementSectionPageNum: number | null = null;
  for (const num of pageNumbersInOrder) {
    const entry = entryByNum.get(num);
    if (!entry) continue;

    for (const line of entry.text.split(/\r?\n/)) {
      const normalizedLine = normalizeForMatch(line);
      if (statementSectionPageNum === null && isStatementSectionMarker(normalizedLine)) {
        statementSectionPageNum = num;
        continue;
      }
      if (statementSectionPageNum !== null && num > statementSectionPageNum && isNotesMarkerFuzzy(normalizedLine)) {
        return entry;
      }
    }
  }
  return undefined;
}

// So trang (khong co text layer) toi da truoc khi coi la "bao cao scan dai" -
// tu day tro len KHONG con tu quyet dinh pham vi o day nua (xem needsOcrProbe
// duoi), de lib/export/financial-statements.ts tu OCR THEO LO bang chinh
// Mistral (vua tim diem cat vua lay luon noi dung, khong ton them lan goi
// nao). Theo du lieu thuc te (BCTC HSG), phan thuyet minh bat dau khoang
// trang 8-10/32 - de du du phong cho bao cao dai hon 1 chut.
const NOTES_EARLY_STOP_BATCH_SIZE = 12;

export interface PageScopeResult {
  // So trang (theo dung so trang trong tai lieu goc) thuoc pham vi 3 bang
  // chinh, TRUOC diem cat "Thuyet minh" - dung de biet trang nao can gui cho
  // Mistral OCR (xem lib/export/financial-statements.ts). null neu KHONG xac
  // dinh duoc tu text layer (that bai, xem `error`) HOAC can OCR theo lo
  // (xem `needsOcrProbe`).
  pageNumbers: number[] | null;
  // Tong so trang ca tai lieu - dung khi can chep toan van CA tai lieu (ke ca
  // Thuyet minh) cho bao cao da duoc chon, xem lib/export/transcribe.ts.
  totalPages: number | null;
  // true neu bao cao la scan dai (> NOTES_EARLY_STOP_BATCH_SIZE trang khong
  // co text layer) - KHONG the xac dinh diem cat tu text layer (khong co text
  // that de doc), caller (lib/export/financial-statements.ts) phai tu OCR
  // theo lo qua Mistral thay vi dung `pageNumbers` (luc nay la null).
  needsOcrProbe?: boolean;
  // true neu text layer THAT (khong OCR gi ca, hoan toan mien phi) cho thay
  // day KHONG PHAI ban tieng Viet - Vietstock thuong kem san ban dich tieng
  // Anh trong CUNG 1 zip (xem lib/report-source.ts isEnglishVariantEntry),
  // loc theo TEN FILE that bai voi file KHONG co dau hieu ngon ngu trong ten
  // (da gap that HCM Q1/2026, 2026-07-12: "HCM_Baocaotaichinh_Q1_2026.pdf" vs
  // "..._1.pdf" - khong the biet ban nao la Anh chi tu ten). Chi tinh cho
  // truong hop CO text that (khong OCR them de kiem tra) - bao cao scan dai
  // (needsOcrProbe=true) duoc kiem tra RIENG sau lo OCR dau tien, xem
  // lib/export/financial-statements.ts.
  isLikelyNonVietnamese?: boolean;
  error?: string;
}

async function determineOne(
  filePath: string
): Promise<{ pageNumbers: number[] | null; totalPages: number; needsOcrProbe: boolean; isLikelyNonVietnamese: boolean }> {
  // CHI doc text layer (pdf-parse getText()) - KHONG render anh/canvas gi ca
  // (khac han cach cu dung Tesseract phai render tung trang thanh anh truoc,
  // tung gay crash "Create skia surface failed" tren bao cao scan dai, xem
  // lich su trao doi luc quyet dinh bo Tesseract 2026-07-07) - CanvasFactory
  // van truyen vao day chi de an toan/dung API dung cach, KHONG thuc su duoc
  // dung toi (getScreenshot khong con goi o file nay).
  const buffer = await readFile(filePath);
  const parser = new PDFParse({ data: buffer, CanvasFactory });

  try {
    const { pages: rawPages } = await parser.getText();
    const totalPages = rawPages.length;
    const allPageNumbers = rawPages.map((page) => page.num);

    const allScannedPageNumbers = rawPages
      .filter((page) => page.text.trim().length < MIN_PAGE_TEXT_LENGTH)
      .map((page) => page.num);

    const combinedText = rawPages.map((page) => page.text).join('\n');
    const isLikelyNonVietnamese = !looksLikeVietnameseText(combinedText);

    // Toan bo la text layer that (PDF born-digital, khong can OCR) - tim diem
    // cat truc tiep tren text that co san.
    if (allScannedPageNumbers.length === 0) {
      const entries: CutoffProbeEntry[] = rawPages.map((page) => ({ num: page.num, text: page.text.trim() }));
      const cutoffEntry = findNotesCutoffEntry(entries, allPageNumbers);
      const pageNumbers = cutoffEntry ? allPageNumbers.filter((num) => num <= cutoffEntry.num) : allPageNumbers;
      return { pageNumbers, totalPages, needsOcrProbe: false, isLikelyNonVietnamese };
    }

    // It trang can OCR (bao cao ngan) - khong dang de tham do rieng, giu
    // nguyen hanh vi cu: coi toan bo la trong pham vi, Mistral OCR o buoc sau
    // se tu doc va bo qua phan khong lien quan neu co.
    if (allScannedPageNumbers.length <= NOTES_EARLY_STOP_BATCH_SIZE) {
      return { pageNumbers: allPageNumbers, totalPages, needsOcrProbe: false, isLikelyNonVietnamese };
    }

    // Bao cao scan dai - khong co text that de tu do diem cat, phai OCR. Bao
    // hieu cho caller tu OCR THEO LO qua Mistral (xem needsOcrProbe tren).
    // isLikelyNonVietnamese luon false o day (khong co text that de xet) -
    // caller tu kiem tra rieng sau lo OCR dau tien.
    return { pageNumbers: null, totalPages, needsOcrProbe: true, isLikelyNonVietnamese: false };
  } finally {
    await parser.destroy();
  }
}

// Xac dinh pham vi trang thuoc 3 bao cao tai chinh chinh (truoc "Thuyet
// minh") cho tung file PDF da tai ve, CHI dua tren text layer THAT (khong OCR
// gi o day) - neu tai lieu la scan dai (khong co text layer), tra ve
// needsOcrProbe=true de caller tu OCR theo lo qua Mistral (xem
// lib/export/financial-statements.ts). TRUOC DAY (den 2026-07-06) dung
// Tesseract.js render+doc tung trang de tu do diem cat ngay tai day - da bo
// (2026-07-07) vi 2 ly do: (1) render anh scale cao hang loat trang de crash
// native "Create skia surface failed" tren bao cao scan dai (@napi-rs/canvas
// het tai nguyen), (2) ton them 1 vong OCR local rieng trong khi Mistral OCR
// (buoc sau) co the vua tim diem cat vua lay luon noi dung trong CUNG 1 lan
// goi, re hon ma khong can Tesseract/canvas gi ca.
export async function determineStatementPageScope(filePaths: string[]): Promise<Map<string, PageScopeResult>> {
  const resultMap = new Map<string, PageScopeResult>();
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < filePaths.length) {
      const index = nextIndex++;
      const filePath = filePaths[index];
      try {
        const { pageNumbers, totalPages, needsOcrProbe, isLikelyNonVietnamese } = await determineOne(filePath);
        resultMap.set(filePath, { pageNumbers, totalPages, needsOcrProbe, isLikelyNonVietnamese });
      } catch (error) {
        console.error('determine page scope error', filePath, error);
        resultMap.set(filePath, {
          pageNumbers: null,
          totalPages: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(DETECT_CONCURRENCY, filePaths.length) }, worker));

  return resultMap;
}
