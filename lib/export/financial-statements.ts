// Doi sang Batch API (2026-07-12, sau khi bat billing tren Mistral console -
// xem memory/reference_mistral_batch_api.md). Giu dong import dong bo cu O
// DAY (comment lai, khong xoa) de doi lai nhanh neu callMistralOcrBatch gap
// van de (dinh dang dong ket qua batch chua duoc xac nhan qua test that, xem
// canh bao trong lib/ai/mistral-ocr-batch.ts):
// import { callMistralOcr } from '../ai/mistral-ocr';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { callMistralOcrBatch } from '../ai/mistral-ocr-batch';
import type { MistralOcrPage } from '../ai/mistral-ocr';
import { validateFinancialStatements, findAllGroupSumMismatches, type TaggedGroupSumMismatch } from './validate-statements';
import { containsNotesSectionMarker, parseStatementsFromMarkdown } from './markdown-tables';
import { classifyBusinessType, type BusinessType } from '../business-type';
import { unreliableCellKeysFromMismatches, normalizeLabelText, type FinancialStatements, type UnreliableCells } from './statement-shared';
import { looksLikeVietnameseText } from '../pdf-text';

// Bao cao scan dai (extractFinancialStatementsWithOcrProbe duoi) khong co
// text layer that de kiem tra ngon ngu MIEN PHI truoc khi OCR (khac voi
// nhanh co text layer, xem lib/pdf-text.ts isLikelyNonVietnamese) - phai doi
// den SAU LO OCR DAU TIEN moi co noi dung de xet. Nem loi rieng (khong phai
// loi mang/tam thoi) de lib/report-extract.ts bat duoc va DUNG NGAY, khong
// tiep tuc OCR them lo nao/khong retry (retry se khong bien tieng Anh thanh
// tieng Viet) - xem NonVietnameseContentError o duoi.
export class NonVietnameseContentError extends Error {}

// Mot so cong ty nop 1 "cong van dinh chinh" (sua lai vai chi tieu da cong bo
// sai) len Vietstock CUNG KY voi BCTC that, mang tieu de gan giong BCTC that
// (vd "BCTC Công ty mẹ quý 1 năm 2026 (điều chỉnh)") - nhung ban than file do
// KHONG PHAI 1 BCTC day du, chi la 1 cong van 1-2 trang liet ke vai chi tieu
// bi sua ("Thông tin đã công bố" / "Thông tin đính chính"), KHONG co KQKD/LCTT
// va BCDKT chi con vai dong. Da xac nhan qua doi chieu that CIG Q1/2026 (file
// "..._DieuChinh.pdf"): OCR doc DUNG NOI DUNG (khong phai loi OCR), nhung ket
// qua nhin GIONG 1 bao cao bi hong/thieu du lieu vi ban than nguon chi co
// vay. Nhan dien qua cum tu BAT BUOC theo mau cong van (Thong tu ke toan quy
// dinh dung tu ngu nay cho loai cong van nay, khong doi giua cac cong ty) -
// "V/v Đính chính thông tin trên Báo cáo tài chính" (Trích yếu cua cong van).
const CORRECTION_NOTICE_MARKER = 'DINH CHINH THONG TIN TREN BAO CAO TAI CHINH';

function isCorrectionNoticeMarkdown(markdown: string): boolean {
  return normalizeLabelText(markdown).includes(CORRECTION_NOTICE_MARKER);
}

// Re-export de cac file khac (excel.ts, pdf.ts, validate-statements.ts, lib/export/index.ts...)
// tiep tuc import type tu day nhu truoc, khong can sua lai import o noi khac.
export type { StatementTable, FinancialStatements } from './statement-shared';
export { findLabelColumnIndex, normalizeLabelText } from './statement-shared';

export interface ExtractFinancialStatementsResult {
  statements: FinancialStatements;
  // Khac rong nghia la sau khi parse xong, so lieu van khong khop nguyen tac
  // ke toan bat buoc - can kiem tra tay lai (xem validate-statements.ts).
  warnings: string[];
  // Ngan hang/Chung khoan/Bao hiem/Khac - suy tu MA MAU BIEU in tren chinh
  // markdown OCR duoc (xem lib/business-type.ts) - tinh LUON o day (khong ton
  // OCR/doc them lan nao) vi markdown da co san trong tay.
  businessType: BusinessType;
  // Cac o (rowIndex:columnIndex, xem unreliableCellKeysFromMismatches) cua
  // BANG KQKD van con sai kiem tra cheo tong nhom SAU KHI DA RETRY het so lan
  // cho phep (xem extractWithGroupCheckRetry) - lib/analysis.ts dung de bao
  // "khong dang tin cay" thay vi so % tinh tu du lieu co the da bi OCR
  // gop/bia dong (yeu cau nguoi dung 2026-07-11). Rong neu khong co van de gi.
  unreliableCells: UnreliableCells;
}

// GIAM tu 3 xuong 1 (2026-07-13, theo yeu cau nguoi dung sau khi doi chieu
// that CIG Q1/2026: goi lai Mistral OCR 3 lan doc lap cho CUNG 1 file ra
// MARKDOWN GIONG HET nhau ca 3 lan - "co ve khong co tac dung gi"). Nguyen
// nhan that: retry chi giup voi loi OCR TAM THOI/khong nhat quan giua cac lan
// goi (xem comment extractWithGroupCheckRetry) - VOI 1 TAI LIEU CO NOI DUNG
// ON DINH (du la BCTC binh thuong hay 1 cong van dinh chinh chi co vai dong),
// Mistral OCR se doc RA CUNG 1 KET QUA moi lan, retry chi ton them 2 lan goi
// API vo ich. Van giu nguyen co che "giu lai lan do te thap nhat" (chi con 1
// lan nen luon la lan duy nhat) de khong phai sua lai cau truc extractWithGroupCheckRetry.
const MAX_OCR_ATTEMPTS = 1;

interface OcrAttemptResult {
  markdown: string;
  statements: FinancialStatements;
  mismatches: TaggedGroupSumMismatch[];
}

// Thu muc ghi markdown tho MOI khi ca 3 bang chinh deu parse ra 0 dong - yeu
// cau nguoi dung 2026-07-12 sau khi gap SHS Q1/2026 xuat Excel trong tron
// (BCDKT/KQKD/LCTT deu 0 dong). Chi ghi trong TRUONG HOP LOI NAY (khong ghi
// moi lan chay) de co bang chung THAT ma khong can OCR lai tra tien - kiem
// tra thu muc nay truoc khi doan mo hinh nguyen nhan tu dau.
const EMPTY_PARSE_DEBUG_DIR = join(process.cwd(), 'data', 'debug-empty-parse');

// Export (khong con la ham noi bo) - dung o lib/pipeline.ts (2026-07-15, theo
// yeu cau nguoi dung) de TU DONG loai van ban phu khoi ket qua khi 1 zip cho
// ra NHIEU file va CO IT NHAT 1 file khac trong cung nhom da cho ra du lieu
// THAT - day la tin hieu NOI DUNG (khong phai gioi han so trang, vo tinh sai
// voi van ban phu dai bat thuong) nen khong con can "xem tay" cho truong hop
// nay nua, xem comment day du o lib/pipeline.ts.
export function isEmptyParse(statements: FinancialStatements): boolean {
  return (
    statements.balanceSheet.rows.length === 0 &&
    statements.incomeStatement.rows.length === 0 &&
    statements.cashFlow.rows.length === 0
  );
}

async function dumpMarkdownForEmptyParse(filePath: string, attempt: number, markdown: string): Promise<void> {
  try {
    await mkdir(EMPTY_PARSE_DEBUG_DIR, { recursive: true });
    const safeName = filePath.replace(/[\\/:]/g, '_').replace(/\.pdf$/i, '');
    const dumpPath = join(EMPTY_PARSE_DEBUG_DIR, `${Date.now()}-attempt${attempt}-${safeName}.md`);
    await writeFile(dumpPath, markdown, 'utf-8');
    console.warn(`[debug] Ca 3 bang chinh deu 0 dong sau khi parse - da ghi markdown tho ra ${dumpPath}`);
  } catch (error) {
    console.error('Khong ghi duoc markdown debug (empty parse)', error);
  }
}

// Diem "do te" cua 1 lan thu - CANG THAP CANG TOT, dung de so sanh cac lan
// thu voi nhau (ca khi quyet dinh dung som lan khi giu lai lan "best"). Ca 3
// bang deu 0 dong (isEmptyParse) la loi NANG HON han bat ky so luong mismatch
// tong nhom nao (thuong chi vai o sai lech) - cong 1 trieu de LUON xep sau,
// dam bao khong bao gio "return som" chi vi mismatches.length===0 TRUNG HOP
// (khong co gi de kiem tra khi bang rong, xem yeu cau nguoi dung 2026-07-12
// duoi day).
function attemptSeverity(statements: FinancialStatements, mismatches: TaggedGroupSumMismatch[]): number {
  return (isEmptyParse(statements) ? 1_000_000 : 0) + mismatches.length;
}

// Goi lai TOAN BO 1 lan OCR (runOcrPass) toi da MAX_OCR_ATTEMPTS lan, dung
// ngay khi kiem tra cheo tong nhom het loi VA ca 3 bang khong rong. Neu van
// con loi sau tat ca cac lan thu, giu lai lan "do te" thap nhat (xem
// attemptSeverity, uu tien lan som hon neu bang nhau). Da xac nhan qua doi
// chieu that (MBS Q2/2026, 2026-07-11): Mistral OCR co the tra ve KET QUA
// GIONG HET nhau qua nhieu lan goi cho 1 trang loi cu the - nen retry o day
// la CO CHE PHONG NGUA CHUNG (bao cao khac, trang khac co the ra ket qua khac
// nhau giua cac lan goi that), khong dam bao sua duoc MOI truong hop.
//
// MO RONG dieu kien retry 2026-07-12 (yeu cau nguoi dung, sau bug SHS Q1/2026
// ca 3 bang 0 dong): TRUOC DAY chi retry khi co mismatch tong nhom - 1 lan
// parse ra HOAN TOAN RONG (0 dong ca 3 bang) lai co findAllGroupSumMismatches
// tra ve [] (khong co gi de kiem tra), nen return NGAY tu lan dau, khong bao
// gio duoc retry - dung chinh xac loi da gap voi SHS (da sua rieng nguyen
// nhan goc o markdown-tables.ts, nhung day la LOP PHONG NGUA CHUNG cho cac
// nguyen nhan KHAC co the con chua biet, tuong tu tinh than cua mismatch
// retry). Luu y: retry o day KHONG chac chan sua duoc loi CAU TRUC (vd 1 mau
// bieu hoan toan la, template moi chua duoc ho tro) - chi giup voi loi OCR
// TAM THOI/khong nhat quan giua cac lan goi doc lap.
async function extractWithGroupCheckRetry(filePath: string, runOcrPass: () => Promise<string>): Promise<OcrAttemptResult> {
  let best: OcrAttemptResult | null = null;
  for (let attempt = 0; attempt < MAX_OCR_ATTEMPTS; attempt++) {
    const markdown = await runOcrPass();
    const statements = parseStatementsFromMarkdown(markdown);
    const empty = isEmptyParse(statements);
    if (empty) await dumpMarkdownForEmptyParse(filePath, attempt, markdown);
    const mismatches = findAllGroupSumMismatches(statements);
    if (!empty && mismatches.length === 0) return { markdown, statements, mismatches };
    if (!best || attemptSeverity(statements, mismatches) < attemptSeverity(best.statements, best.mismatches)) {
      best = { markdown, statements, mismatches };
    }
  }
  return best!;
}

function toUnreliableCells(mismatches: TaggedGroupSumMismatch[]): UnreliableCells {
  return {
    balanceSheet: unreliableCellKeysFromMismatches(mismatches.filter((m) => m.table === 'balanceSheet')),
    incomeStatement: unreliableCellKeysFromMismatches(mismatches.filter((m) => m.table === 'incomeStatement')),
  };
}

// Lo DAU TIEN cua vong OCR tang dan (goi 1 lan/bao cao, xem CAP NHAT
// 2026-07-12 trong lib/pdf-text.ts - khong con nhanh rieng doan pham vi tu
// text layer nua, MOI bao cao PDF deu qua ham nay). Ban dau thu
// 6 trang + mo rong 1 trang/lan (2026-07-07) de toi thieu so trang OCR du,
// nhung do that cho thay moi lan goi Mistral OCR co phi CO DINH ~4s (round-trip
// mang, khong giam theo so trang) - mo rong tung trang cong don qua nhieu lan
// goi rieng le lam CHAM HAN so voi gop chung 1 lo (vd 6 trang trong 1 lan goi
// chi ~11s, ~1.8s/trang, so voi 1 trang/lan ~4s/trang) - doi lai quyet dinh
// (2026-07-07, sau khi do so lieu that): quay ve lo 12 trang nhu Tesseract
// truoc day (it lan goi hon, nhanh hon ro ret), mo rong 2 trang/lan (thay vi 1)
// neu chua du - can bang giua toc do (it lan goi hon 1 trang/lan) va tranh OCR
// du qua nhieu (khong quay lai lo lon 12 trang/lan luc mo rong).
const INITIAL_PROBE_BATCH_SIZE = 12;
// Sau lo dau, moi lan OCR THEM 2 trang moi (khong OCR lai cac trang cu - merge
// vao ket qua da co) roi kiem tra lai ngay.
const EXPAND_STEP = 2;

// Bao cao scan dai: KHONG con Tesseract do diem cat truoc (xem lich su bo
// Tesseract 2026-07-07 - crash native "Create skia surface failed" tren tai
// lieu nhieu trang, cong them ton them 1 vong OCR local rieng). Thay bang OCR
// THANG qua Mistral theo tung lo (lo dau INITIAL_PROBE_BATCH_SIZE trang, sau
// do tung trang EXPAND_STEP), dung LUON markdown da OCR duoc de tim tieu de
// "Thuyet minh" (containsNotesSectionMarker) - thay vi 2 buoc rieng (do diem
// cat roi OCR lai lan nua), gio CHI 1 vong OCR tang dan, dung ngay khi thay
// "Thuyet minh" (hoac het trang). Cac lan goi sau CHI OCR trang MOI (chua OCR
// lan nao), roi merge vao ket qua da co - khong bao gio OCR lai tu dau. Markdown
// OCR duoc dung LUON lam dau vao parseStatementsFromMarkdown (ham do da tu
// chan dung truoc "Thuyet minh" - xem NOTES_SECTION_MARKERS) - khong OCR lai lan 2.
export async function extractFinancialStatementsWithOcrProbe(filePath: string, totalPages: number): Promise<ExtractFinancialStatementsResult> {
  const { markdown, statements, mismatches } = await extractWithGroupCheckRetry(filePath, async () => {
    const collected: MistralOcrPage[] = [];
    let cursor = 0;
    let checkedLanguage = false;

    while (cursor < totalPages) {
      const step = collected.length === 0 ? INITIAL_PROBE_BATCH_SIZE : EXPAND_STEP;
      const batchEnd = Math.min(cursor + step, totalPages);
      const pagesZeroBased = Array.from({ length: batchEnd - cursor }, (_, i) => cursor + i);
      // const { pages } = await callMistralOcr(filePath, { pages: pagesZeroBased }); // fallback dong bo, xem comment o dau file
      const { pages } = await callMistralOcrBatch(filePath, { pages: pagesZeroBased });
      collected.push(...pages);
      cursor = batchEnd;

      const markdownSoFar = collected.map((p) => p.markdown).join('\n\n');
      // Chi kiem tra 1 lan, ngay sau lo DAU TIEN - du du lieu de ket luan
      // (xem VIETNAMESE_DIACRITIC_RATIO_THRESHOLD) VA dung som truoc khi ton
      // them cac lo mo rong tiep theo cho 1 tai lieu khong phai tieng Viet.
      //
      // Kiem tra TUNG TRANG rieng (khong gop chung thanh 1 khoi roi tinh 1 ty
      // le duy nhat) - da gap that CTS Q1/2026 (2026-07-15): ban dich tieng
      // Anh cua ca 1 BCTC 56 trang van lot qua kiem tra gop vi trang bia co 1
      // bang tom tat song ngu Viet-Anh (vd "Tong doanh thu.../Total
      // Revenue..."), du tieng Viet o CAC TRANG SAU (bang BCDKT/KQKD chi tiet)
      // hoan toan la tieng Anh - ty le gop ca tai lieu van vuot nguong nho vao
      // trang bia. Doi sang bo phieu da so THEO TRANG: tai lieu chi duoc coi
      // la tieng Viet neu QUA NUA so trang trong lo da OCR that su la tieng
      // Viet - 1-2 trang bia song ngu khong con du de "keo" ca tai lieu qua nguong.
      if (!checkedLanguage) {
        checkedLanguage = true;
        const nonVietnamesePageCount = collected.filter((p) => !looksLikeVietnameseText(p.markdown)).length;
        if (nonVietnamesePageCount > collected.length / 2) {
          throw new NonVietnameseContentError('Noi dung khong phai tieng Viet (phat hien sau lo OCR dau tien)');
        }
      }
      if (containsNotesSectionMarker(markdownSoFar)) break;
    }

    console.log(`[mistral-ocr] ${filePath}: OCR ${collected.length} trang (tong cong, qua ${collected.length === totalPages ? 'het file' : 'probe tang dan'})`);
    return collected.map((p) => p.markdown).join('\n\n');
  });
  // Tinh businessType TRUOC (can truyen vao validateFinancialStatements de bo
  // qua dung kiem tra khong ap dung duoc cho tung loai hinh - xem comment tai
  // dinh nghia ham do).
  const businessType = classifyBusinessType(markdown);
  const issues = validateFinancialStatements(statements, businessType);
  // Canh bao rieng, DE HIEU NGAY (khac voi 9+ dong ky thuat le te cua
  // validateFinancialStatements) khi van con rong sau ca MAX_OCR_ATTEMPTS lan
  // thu - yeu cau nguoi dung 2026-07-12: can noi bat ro rang truong hop nay
  // trong UI (ReportsSummaryTable.tsx), khac han 1 vai canh bao nho le thuong
  // gap (vd thieu 1 dong phu).
  //
  // 2026-07-13 (yeu cau nguoi dung, sau khi doi chieu CIG Q1/2026 - xem
  // isCorrectionNoticeMarkdown): kiem tra TRUOC CA isEmptyParse, vi day la
  // NGUYEN NHAN GOC neu co (khong phai loi OCR/parse) - "cong van dinh chinh"
  // khong phai 1 BCTC day du nen KQKD/LCTT rong VA BCDKT chi vai dong LA HANH
  // VI DUNG cua chinh nguon, khong phai loi can retry/sua. Canh bao noi bat
  // rieng, KHAC han ca 2 loai canh bao "khong doc duoc"/"khong khop" khac -
  // yeu cau nguoi dung tu tim ban BCTC goc (KHONG phai ban "(điều chỉnh)")
  // thay vi dung so lieu tu file nay lam bao cao chinh.
  const correctionNotice = isCorrectionNoticeMarkdown(markdown);
  const warnings = correctionNotice
    ? [
        'CANH BAO: day co ve la CONG VAN DINH CHINH (chi sua lai vai chi tieu da cong bo truoc do), KHONG PHAI mot BCTC day du - can tu tim va doi chieu voi ban BAO CAO GOC (khong phai ban "(điều chỉnh)"), khong nen dung so lieu tu file nay lam bao cao chinh thuc.',
        ...issues.map((issue) => issue.message),
      ]
    : isEmptyParse(statements)
      ? ['CANH BAO: ca 3 bang chinh (BCDKT/KQKD/LCTT) deu khong doc duoc dong nao - can kiem tra tay.', ...issues.map((issue) => issue.message)]
      : issues.map((issue) => issue.message);

  return {
    statements,
    warnings,
    businessType,
    unreliableCells: toUnreliableCells(mismatches),
  };
}
