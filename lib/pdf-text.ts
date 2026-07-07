import { readFile } from 'fs/promises';
// Phai import truoc 'pdf-parse' - pdfjs-dist can CanvasFactory nay de polyfill
// DOMMatrix/ImageData luc render trang (getScreenshot), neu khong se crash
// "ReferenceError: DOMMatrix is not defined" tren moi trang goi module nay
// (gap that tren Vercel/serverless, @napi-rs/canvas khong tu polyfill kip).
import { CanvasFactory } from 'pdf-parse/worker';
import { PDFParse } from 'pdf-parse';
import { ocrPageImages } from './ocr';

// Nguong toi thieu (tren TUNG TRANG) de coi la "trang co text layer that su".
// Quan trong: kiem tra theo tung trang chu KHONG phai cong don ca tai lieu -
// nhieu BCTC scan co trang bia la PDF that (co chu that) nhung tat ca cac
// trang so lieu con lai la anh scan; neu kiem tra tren tong do dai ca file thi
// text cua rieng trang bia cung du vuot nguong va bo sot OCR cho toan bo
// phan con lai (da gap that voi file FIR_...).
const MIN_PAGE_TEXT_LENGTH = 30;
// OCR ton CPU nang (render anh + nhan dien tung trang) nen chay it luong song
// song hon buoc tai file (DOWNLOAD_CONCURRENCY trong lib/download.ts).
const DETECT_CONCURRENCY = 2;
// Do phan giai render trang PDF -> anh de Tesseract do diem cat "Thuyet minh"
// - CHI can du de nhan ra tu khoa (co fuzzy-match chiu loi), KHONG can chinh
// xac tuyet doi vi khong con dung lam noi dung cuoi cung (xem comment o cuoi
// file - Tesseract 2026-07-05 CHI con dung de xac dinh pham vi trang, moi
// noi dung hien thi that su deu do vision model doc lai, xem lib/export/).
const OCR_SCALE = 3.5;

// Dung chung o day (tim diem cat) va lib/export/transcribe.ts (chia lo trang
// de goi vision model) - tranh 2 noi tu dinh nghia logic fuzzy-match rieng.
const COMBINING_DIACRITICS = new RegExp('[̀-ͯ]', 'g');

function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toUpperCase();
}

// Levenshtein + fuzzy match - dung rieng de nhan dien diem bat dau "Thuyet
// minh bao cao tai chinh" (xem NOTES_EARLY_STOP_BATCH_SIZE ben duoi), vi nhan
// nay cung de bi OCR doc nham vai ky tu nhu cac nhan khac trong file.
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
    fuzzyMatch(normalizedText, 'KET QUA HOAT DONG KINH DOANH') ||
    fuzzyMatch(normalizedText, 'KET QUA KINH DOANH') ||
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

// OCR (Tesseract) CHI dung de DO VI TRI diem cat "Thuyet minh" - ket qua nay
// KHONG duoc giu lai lam noi dung hien thi o dau ca (xem comment cuoi file).
async function ocrProbePages(parser: PDFParse, pageNumbers: number[]): Promise<CutoffProbeEntry[]> {
  const screenshots = await parser.getScreenshot({ scale: OCR_SCALE, imageBuffer: true, partial: pageNumbers });
  const ocrResults = await ocrPageImages(screenshots.pages.map((page) => page.data));
  return screenshots.pages.map((page, i) => ({ num: page.pageNumber, text: (ocrResults[i]?.text ?? '').trim() }));
}

// So trang OCR toi da trong lo "tham do" dau tien, truoc khi quyet dinh co
// cat bot phan "Thuyet minh" hay khong. Theo du lieu thuc te (BCTC HSG), phan
// thuyet minh bat dau khoang trang 8-10/32 - de du du phong cho bao cao dai
// hon 1 chut.
const NOTES_EARLY_STOP_BATCH_SIZE = 12;

export interface PageScopeResult {
  // So trang (theo dung so trang trong tai lieu goc) thuoc pham vi 3 bang
  // chinh, TRUOC diem cat "Thuyet minh" - dung de biet trang nao can render
  // anh gui cho vision model (xem lib/export/financial-statements.ts). null
  // neu xac dinh that bai.
  pageNumbers: number[] | null;
  // Tong so trang ca tai lieu - dung khi can chep toan van CA tai lieu (ke ca
  // Thuyet minh) cho bao cao da duoc chon, xem lib/export/transcribe.ts.
  totalPages: number | null;
  error?: string;
}

async function determineOne(filePath: string): Promise<{ pageNumbers: number[]; totalPages: number }> {
  const buffer = await readFile(filePath);
  const parser = new PDFParse({ data: buffer, CanvasFactory });

  try {
    const { pages: rawPages } = await parser.getText();
    const totalPages = rawPages.length;
    const allPageNumbers = rawPages.map((page) => page.num);

    const allScannedPageNumbers = rawPages
      .filter((page) => page.text.trim().length < MIN_PAGE_TEXT_LENGTH)
      .map((page) => page.num);

    // Toan bo la text layer that (PDF born-digital, khong can OCR) - tim diem
    // cat truc tiep tren text that co san, khong can Tesseract.
    if (allScannedPageNumbers.length === 0) {
      const entries: CutoffProbeEntry[] = rawPages.map((page) => ({ num: page.num, text: page.text.trim() }));
      const cutoffEntry = findNotesCutoffEntry(entries, allPageNumbers);
      const pageNumbers = cutoffEntry ? allPageNumbers.filter((num) => num <= cutoffEntry.num) : allPageNumbers;
      return { pageNumbers, totalPages };
    }

    // It trang can OCR (bao cao ngan) - khong dang de tham do rieng, giu
    // nguyen hanh vi cu: coi toan bo la trong pham vi, vision model o buoc
    // sau se tu doc va bo qua phan khong lien quan neu co.
    if (allScannedPageNumbers.length <= NOTES_EARLY_STOP_BATCH_SIZE) {
      return { pageNumbers: allPageNumbers, totalPages };
    }

    const probeBatch = allScannedPageNumbers.slice(0, NOTES_EARLY_STOP_BATCH_SIZE);
    const probeEntries = await ocrProbePages(parser, probeBatch);
    const cutoffEntry = findNotesCutoffEntry(probeEntries, probeBatch);

    if (cutoffEntry) {
      return { pageNumbers: allPageNumbers.filter((num) => num <= cutoffEntry.num), totalPages };
    }

    // Khong thay diem cat trong lo tham do (bao cao dai bat thuong, cac bang
    // chinh keo dai qua NOTES_EARLY_STOP_BATCH_SIZE trang) - tham do tiep cac
    // trang scan con lai de tiep tuc tim diem cat.
    const probeBatchSet = new Set(probeBatch);
    const remainingPageNumbers = allScannedPageNumbers.filter((num) => !probeBatchSet.has(num));
    if (remainingPageNumbers.length === 0) return { pageNumbers: allPageNumbers, totalPages };

    const remainingEntries = await ocrProbePages(parser, remainingPageNumbers);
    const remainingCutoff = findNotesCutoffEntry(remainingEntries, remainingPageNumbers);
    const pageNumbers = remainingCutoff ? allPageNumbers.filter((num) => num <= remainingCutoff.num) : allPageNumbers;
    return { pageNumbers, totalPages };
  } finally {
    await parser.destroy();
  }
}

// Xac dinh pham vi trang thuoc 3 bao cao tai chinh chinh (truoc "Thuyet
// minh") cho tung file PDF da tai ve - CHI dung Tesseract de DO VI TRI diem
// cat (fuzzy-match tu khoa, chiu duoc loi OCR vi khong con dung lam noi dung
// hien thi). Thay the extractTextForFiles cu (2026-07-04): truoc day ham nay
// CUNG ghi ra noi dung .txt bang chinh text Tesseract doc duoc, dung lam
// "Toan van bao cao" trong file xuat - user phan hoi dung (2026-07-05) rang
// Tesseract doc sai qua nhieu (vd trang xoay ngang trong Thuyet minh ra chu
// rac hoan toan) nen KHONG duoc dung lam noi dung cuoi cung o bat ky dau -
// moi noi dung hien thi that su (ca toan van lan 3 bang) gio deu do vision
// model doc lai truc tiep tu anh goc, xem lib/export/financial-statements.ts
// (3 bang + text pham vi nay) va lib/export/transcribe.ts (toan van ca tai
// lieu, chi cho bao cao da duoc chon).
export async function determineStatementPageScope(filePaths: string[]): Promise<Map<string, PageScopeResult>> {
  const resultMap = new Map<string, PageScopeResult>();
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < filePaths.length) {
      const index = nextIndex++;
      const filePath = filePaths[index];
      try {
        const { pageNumbers, totalPages } = await determineOne(filePath);
        resultMap.set(filePath, { pageNumbers, totalPages });
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
