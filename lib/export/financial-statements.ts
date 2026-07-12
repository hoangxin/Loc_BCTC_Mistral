// Doi sang Batch API (2026-07-12, sau khi bat billing tren Mistral console -
// xem memory/reference_mistral_batch_api.md). Giu dong import dong bo cu O
// DAY (comment lai, khong xoa) de doi lai nhanh neu callMistralOcrBatch gap
// van de (dinh dang dong ket qua batch chua duoc xac nhan qua test that, xem
// canh bao trong lib/ai/mistral-ocr-batch.ts):
// import { callMistralOcr } from '../ai/mistral-ocr';
import { callMistralOcrBatch } from '../ai/mistral-ocr-batch';
import type { MistralOcrPage } from '../ai/mistral-ocr';
import { validateFinancialStatements, findAllGroupSumMismatches, type TaggedGroupSumMismatch } from './validate-statements';
import { containsNotesSectionMarker, parseStatementsFromMarkdown } from './markdown-tables';
import { classifyBusinessType, type BusinessType } from '../business-type';
import { unreliableCellKeysFromMismatches, type FinancialStatements, type UnreliableCells } from './statement-shared';
import { looksLikeVietnameseText } from '../pdf-text';

// Bao cao scan dai (extractFinancialStatementsWithOcrProbe duoi) khong co
// text layer that de kiem tra ngon ngu MIEN PHI truoc khi OCR (khac voi
// nhanh co text layer, xem lib/pdf-text.ts isLikelyNonVietnamese) - phai doi
// den SAU LO OCR DAU TIEN moi co noi dung de xet. Nem loi rieng (khong phai
// loi mang/tam thoi) de lib/report-extract.ts bat duoc va DUNG NGAY, khong
// tiep tuc OCR them lo nao/khong retry (retry se khong bien tieng Anh thanh
// tieng Viet) - xem NonVietnameseContentError o duoi.
export class NonVietnameseContentError extends Error {}

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

// 1 lan dau + 2 lan retry (yeu cau nguoi dung 2026-07-11: "cho phep retry 2
// lan"). CHI retry khi kiem tra cheo tong nhom (findAllGroupSumMismatches -
// nhom phang KQKD, ma so thap phan BCDKT+KQKD, cap1->cap2 BCDKT) phat hien sai
// - KHONG retry cho cac loai canh bao khac cua validateFinancialStatements (vd
// thieu dong "Tong cong tai san") vi retry OCR kho long sua duoc loi CAU TRUC
// bang (vd bao cao dung mau khac thuong), chi co ich cho loi NOI DUNG cuc bo
// (OCR gop/bia dong 1 vai o) ma kiem tra tong nhom phat hien duoc.
const MAX_OCR_ATTEMPTS = 3;

interface OcrAttemptResult {
  markdown: string;
  statements: FinancialStatements;
  mismatches: TaggedGroupSumMismatch[];
}

// Goi lai TOAN BO 1 lan OCR (runOcrPass) toi da MAX_OCR_ATTEMPTS lan, dung
// ngay khi kiem tra cheo tong nhom het loi. Neu van con loi sau tat ca cac
// lan thu, giu lai lan co IT LOI NHAT (uu tien lan som hon neu bang nhau). Da
// xac nhan qua doi chieu that (MBS Q2/2026, 2026-07-11): Mistral OCR co the
// tra ve KET QUA GIONG HET nhau qua nhieu lan goi cho 1 trang loi cu the - nen
// retry o day la CO CHE PHONG NGUA CHUNG (bao cao khac, trang khac co the ra
// ket qua khac nhau giua cac lan goi that), khong dam bao sua duoc MOI truong hop.
async function extractWithGroupCheckRetry(runOcrPass: () => Promise<string>): Promise<OcrAttemptResult> {
  let best: OcrAttemptResult | null = null;
  for (let attempt = 0; attempt < MAX_OCR_ATTEMPTS; attempt++) {
    const markdown = await runOcrPass();
    const statements = parseStatementsFromMarkdown(markdown);
    const mismatches = findAllGroupSumMismatches(statements);
    if (mismatches.length === 0) return { markdown, statements, mismatches };
    if (!best || mismatches.length < best.mismatches.length) best = { markdown, statements, mismatches };
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
  const { markdown, statements, mismatches } = await extractWithGroupCheckRetry(async () => {
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
      if (!checkedLanguage) {
        checkedLanguage = true;
        if (!looksLikeVietnameseText(markdownSoFar)) {
          throw new NonVietnameseContentError('Noi dung khong phai tieng Viet (phat hien sau lo OCR dau tien)');
        }
      }
      if (containsNotesSectionMarker(markdownSoFar)) break;
    }

    console.log(`[mistral-ocr] ${filePath}: OCR ${collected.length} trang (tong cong, qua ${collected.length === totalPages ? 'het file' : 'probe tang dan'})`);
    return collected.map((p) => p.markdown).join('\n\n');
  });
  const issues = validateFinancialStatements(statements);

  return {
    statements,
    warnings: issues.map((issue) => issue.message),
    businessType: classifyBusinessType(markdown),
    unreliableCells: toUnreliableCells(mismatches),
  };
}
