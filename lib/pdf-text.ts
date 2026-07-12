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

const DETECT_CONCURRENCY = 2;

// Nguong DO DAI text tren TUNG TRANG (khong phai tong ca tai lieu) de tin
// trang do la "trang co noi dung that su", dung lam dieu kien tin tuong ket
// qua kiem tra ngon ngu. SUA LAI 2026-07-12 sau khi phat hien bug: ban dau
// dung nguong TONG (200 ky tu ca tai lieu) - nhung PVS/SHS deu co 1-2 trang
// bia la "Cong bo thong tin" THAT (khong phai watermark, du dai ~2000-2400
// ky tu/trang) viet SONG NGU Viet-Anh du chuan cua HNX/UBCKNN, cong lai vua
// du vuot nguong tong nhung ty le dau tieng Viet bi tieng Anh xen ke pha
// loang xuong duoi nguong 0.03 - khien SHS (BCTC tieng Viet that) bi loai
// NHAM thanh "khong phai tieng Viet", bo qua hoan toan KHONG OCR (phat hien
// qua ket qua thuc te, khong phai chi doan). Cac trang con lai (bang bieu
// that) van la ANH SCAN, watermark eoffice 82 ky tu/trang - duoi nguong nay.
// Yeu cau TAT CA cac trang deu vuot nguong (khong chi tong ca tai lieu) moi
// tin ket qua - 1-2 trang bia khong the lam ca tai lieu "qua" duoc, phai la
// tai lieu THAT SU born-digital toan bo (moi trang la ban dich/ban tieng Anh
// day du) moi kich hoat duoc canh bao nay, giong dung y dinh ban dau (truoc
// 2026-07-12 dung dieu kien tuong duong qua allScannedPageNumbers.length===0
// voi nguong 30/trang - gio nang nguong len de watermark khong con qua duoc).
const MIN_PAGE_TEXT_LENGTH_FOR_LANGUAGE_CHECK = 300;

const COMBINING_DIACRITICS = new RegExp('[̀-ͯ]', 'g');

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

export interface PageScopeResult {
  // Tong so trang ca tai lieu - dung lam dau vao cho
  // extractFinancialStatementsWithOcrProbe (lib/export/financial-statements.ts).
  totalPages: number | null;
  // true neu text layer THAT (khong OCR gi ca, hoan toan mien phi) cho thay
  // day KHONG PHAI ban tieng Viet - Vietstock thuong kem san ban dich tieng
  // Anh trong CUNG 1 zip (xem lib/report-source.ts isEnglishVariantEntry).
  // Chi tin ket qua nay khi MOI trang deu co du text that (xem
  // MIN_PAGE_TEXT_LENGTH_FOR_LANGUAGE_CHECK) - neu khong (vd chi 1-2 trang
  // bia that, con lai la anh scan), de ngo (false) va giao cho buoc kiem tra
  // RIENG sau lo OCR dau tien (xem lib/export/financial-statements.ts).
  isLikelyNonVietnamese?: boolean;
  error?: string;
}

// CAP NHAT 2026-07-12 (bug PVS that, 1500-bao-cao Q1/2026): TRUOC DAY file
// nay con tu doc text layer de doan diem cat "Thuyet minh" cho PDF born-
// digital (tranh phai OCR theo lo qua Mistral) - da BO hoan toan sau khi phat
// hien PVS (BCTC that, 119 trang) bi OCR CA tai lieu thay vi ~12-16 trang:
// he thong eoffice cua PTSC tu dong chen 1 dong watermark ("Van ban duoc tai
// len he thong eoffice.ptsc.com.vn. Voi so dinh danh: ...") dai 82 ky tu vao
// MOI TRANG kem file scan - vuot nguong "co text that" tung dung (30 ky
// tu/trang), khien code tuong nham CA tai lieu la born-digital roi di tim
// diem cat tren watermark (khong bao gio thay, vi tieu de bang that nam
// trong ANH scan, khong co trong text) - fallback OCR toan bo 119 trang.
//
// Doi lai theo huong don gian hoa (yeu cau nguoi dung 2026-07-12, sau khi
// kiem tra thuc te: TOAN BO 9 file mau that + PVS deu la scan can OCR-probe,
// khong file nao thuc su huong loi tu nhanh born-digital): LUON dung
// extractFinancialStatementsWithOcrProbe (12 trang dau + mo rong 2 trang/lan
// den khi thay "Thuyet minh", xem financial-statements.ts) cho MOI bao cao,
// khong con co gang doan truoc pham vi tu text layer nua - vua tranh duoc ca
// lop bug fuzzy-match/watermark nay, vua khong ton kem hon dang ke (bao cao
// that huong loi tu nhanh cu deu co diem cat trong 12 trang dau, probe cung
// chi mat 1 lan goi OCR y het). Van GIU LAI buoc doc text layer o day CHI de
// kiem tra ngon ngu MIEN PHI (isLikelyNonVietnamese) va dem tong so trang -
// 2 thu nay van dung duoc tren PDF scan (watermark khong anh huong ket qua vi
// yeu cau MOI TRANG deu co du text, xem MIN_PAGE_TEXT_LENGTH_FOR_LANGUAGE_CHECK).
async function determineOne(filePath: string): Promise<{ totalPages: number; isLikelyNonVietnamese: boolean }> {
  const buffer = await readFile(filePath);
  const parser = new PDFParse({ data: buffer, CanvasFactory });

  try {
    const { pages: rawPages } = await parser.getText();
    const totalPages = rawPages.length;
    const allPagesHaveSubstantialText = rawPages.every((page) => page.text.trim().length >= MIN_PAGE_TEXT_LENGTH_FOR_LANGUAGE_CHECK);
    const combinedText = rawPages.map((page) => page.text).join('\n');
    const isLikelyNonVietnamese = allPagesHaveSubstantialText && !looksLikeVietnameseText(combinedText);
    return { totalPages, isLikelyNonVietnamese };
  } finally {
    await parser.destroy();
  }
}

// Dem tong so trang + kiem tra ngon ngu MIEN PHI (text layer that, khong OCR)
// cho tung file PDF da tai ve - xem CAP NHAT 2026-07-12 o tren ve ly do
// KHONG con co gang doan pham vi trang tu text layer nua (luon giao cho
// extractFinancialStatementsWithOcrProbe, lib/export/financial-statements.ts).
export async function determineStatementPageScope(filePaths: string[]): Promise<Map<string, PageScopeResult>> {
  const resultMap = new Map<string, PageScopeResult>();
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < filePaths.length) {
      const index = nextIndex++;
      const filePath = filePaths[index];
      try {
        const { totalPages, isLikelyNonVietnamese } = await determineOne(filePath);
        resultMap.set(filePath, { totalPages, isLikelyNonVietnamese });
      } catch (error) {
        console.error('determine page scope error', filePath, error);
        resultMap.set(filePath, {
          totalPages: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(DETECT_CONCURRENCY, filePaths.length) }, worker));

  return resultMap;
}
