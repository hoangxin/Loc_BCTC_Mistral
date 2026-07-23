// SUA 2026-07-21 (yeu cau nguoi dung, sau dot Mistral batch nghen keo dai
// nhieu gio - xem memory project_mistral_congestion_2026-07-20): thay vi
// hard-code 1 nhanh duy nhat (batch, tu 2026-07-12 - xem memory
// reference_mistral_batch_api.md), nguoi dung TU CHON sync/batch tren UI moi
// lan "Tai BCTC"/"Them nguon rieng" (xem lib/ocr-mode.ts, truyen xuyen suot
// tu app/FetchControls.tsx qua GitHub Actions toi day). extractFinancialStatementsWithOcrProbe
// duoi nhan them tham so ocrMode, re nhanh callMistralOcr (sync)/
// callMistralOcrBatch (batch) NGAY TRONG vong lap probe (dung chung 1 logic
// probe/merge/parse, chi khac ham OCR tung lo duoc goi).
import { callMistralOcr } from '../ai/mistral-ocr';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { callMistralOcrBatch } from '../ai/mistral-ocr-batch';
import type { MistralOcrPage } from '../ai/mistral-ocr';
import type { OcrMode } from '../ocr-mode';
import { validateFinancialStatements, findAllGroupSumMismatches, type TaggedGroupSumMismatch } from './validate-statements';
import { containsNotesSectionMarker, detectCashFlowBeforeOtherStatementsOrderViolation, parseStatementsFromMarkdown } from './markdown-tables';
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
  // SUA 2026-07-15 (theo phan hoi nguoi dung, sau su co CTG - goi OCR that
  // xong nhung KHONG luu duoc markdown tho vi ham nay truoc day CHI ghi
  // markdown tho ra dia trong 1 TRUONG HOP LOI DUY NHAT (isEmptyParse,
  // dumpMarkdownForEmptyParse) - MOI truong hop khac (ke ca khi parse "gan
  // dung" nhung thieu 1 vai dong nhu CTG) khong co cach nao lay lai markdown
  // da OCR ma khong goi OCR THAT lan nua, vi pham dung nguyen tac CLAUDE.md
  // "luu output tho ngay sau moi lan goi OCR thanh cong". LUON tra ve
  // markdown o day (khong ton them lan OCR nao - da co san trong tay tu vong
  // lap ben tren) de MOI noi goi ham nay (script re-fetch rieng 1 bao cao,
  // lib/pipeline.ts...) co the tu luu lai ngay, khong phu thuoc isEmptyParse.
  markdown: string;
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

// SUA 2026-07-23 (bug that NGHIEM TRONG QTP Q2/2026, phat hien qua yeu cau
// nguoi dung): che do "onlyMissing" (lib/pipeline.ts, chi tai bao cao CHUA CO
// trong cache) truoc day coi 1 bao cao la "DA CO" chi dua vao reportIdentityKey
// TON TAI trong `reports[]`, KHONG can biet du lieu do co THAT SU doc duoc gi
// khong - QTP bi loc nham file tieng Anh (bug da sua rieng, xem
// hasVietnameseFilenameIndicator o lib/report-source.ts), chi con lai 2 file
// van ban phu (giai trinh/cong bo thong tin, ca 3 bang deu RONG) duoc luu vao
// cache - CA HAI LAN CHAY SAU DO (kem ca lan da sua xong bug loc file) deu
// coi QTP la "da xong", KHONG BAO GIO fetch lai, nen bug van "tuong nhu da
// sua" trong code nhung DU LIEU THAT van sai mai mai. Ham nay xac dinh 1 bao
// cao co NEN duoc phep tai lai lan nua (dua vao chinh statements/warnings da
// luu, KHONG can OCR) - CHI loai tru 2 truong hop biet CHAC CHAN se rong VINH
// VIEN du tai lai bao nhieu lan (cong van dinh chinh THAT/thu tu bang sai
// THAT - thuoc tinh cua chinh tai lieu goc, khong phai loi tam thoi), con lai
// (bs/is/cf con thieu BAT KY bang nao - khong doi hoi CA 3 nhu isEmptyParse,
// vi 1-2 bang thieu cung da la dau hieu fetch chua day du) deu duoc phep thu
// lai o lan chay sau, PHONG truong hop 1 fix code moi (nhu cac fix Q2/2026 da
// gap: JSON-caption chay tran, ngoac (Lo), loc file tieng Anh...) se sua
// duoc neu duoc chay lai.
const KNOWN_PERMANENTLY_INCOMPLETE_WARNING_MARKERS = ['CONG VAN DINH CHINH', 'THU TU BANG KHONG CHUAN'];

export function isKnownPermanentlyIncompleteWarning(warnings: string[]): boolean {
  return warnings.some((w) => {
    const normalized = normalizeLabelText(w);
    return KNOWN_PERMANENTLY_INCOMPLETE_WARNING_MARKERS.some((m) => normalized.includes(m));
  });
}

export function hasIncompleteCoreStatements(statements: FinancialStatements): boolean {
  return (
    statements.balanceSheet.rows.length === 0 ||
    statements.incomeStatement.rows.length === 0 ||
    statements.cashFlow.rows.length === 0
  );
}

// Dung boi lib/pipeline.ts (che do onlyMissing) de quyet dinh 1 bao cao DA CO
// trong cache co nen bi loai khoi "da xong" (cho phep tai lai) hay khong.
export function shouldRetryIncompleteReport(statements: FinancialStatements, warnings: string[]): boolean {
  return hasIncompleteCoreStatements(statements) && !isKnownPermanentlyIncompleteWarning(warnings);
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
//
// GIAM tu 12 xuong 10 (2026-07-21, yeu cau nguoi dung, ap dung CHUNG cho ca 2
// nhanh sync/batch vi cung di qua 1 vong lap nay): doi ty le lo dau/so lan mo
// rong tu 12+4*2 sang 10+5*2 (van cung tran 20 trang, xem MAX_PROBE_PAGES).
const INITIAL_PROBE_BATCH_SIZE = 10;
// Sau lo dau, moi lan OCR THEM 2 trang moi (khong OCR lai cac trang cu - merge
// vao ket qua da co) roi kiem tra lai ngay.
const EXPAND_STEP = 2;
// GIOI HAN TOI DA 20 trang/bao cao (yeu cau nguoi dung 2026-07-18: lo dau 10
// trang + toi da 5 lo mo rong 2 trang = 10+5*2=20, cap nhat ty le 2026-07-21) -
// truoc day vong lap chi
// dung o "totalPages" (het file) hoac tim thay "Thuyet minh", KHONG co tran
// tren rieng, nen 1 tai lieu dai bat thuong (ma OCR mai khong ra dung tieu de
// "Thuyet minh", vd do trang bi doc sai/thieu) co the OCR toi tan cuoi file
// (hang chuc trang), ton kem vo ich - BCDKT/KQKD/LCTT chuan (Thong tu 200/2014,
// 99/2025) chua bao gio can toi 20 trang cho toi ca 3 bang chinh.
const MAX_PROBE_PAGES = 20;

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
// Tach rieng (2026-07-17) phan hau-OCR (parse markdown -> statements/warnings/
// businessType/unreliableCells) khoi vong lap OCR - dung LAI DUOC cho script
// re-parse tu markdown DA CO SAN tren dia (khong OCR that lan nao) khi CHI
// code parser/validate doi, con markdown day du van con luu duoc tu lan OCR
// truoc (xem CLAUDE.md - khong tu hand-roll lai logic parse rieng o script khac).
export function buildResultFromMarkdown(markdown: string, statements: FinancialStatements, mismatches: TaggedGroupSumMismatch[]): ExtractFinancialStatementsResult {
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
  // Xem detectCashFlowBeforeOtherStatementsOrderViolation (markdown-tables.ts)
  // - phat hien (KHONG tu sua) truong hop tai lieu co thu tu bang khac chuan
  // (vd LCTT nam TRUOC KQKD, xac nhan that WSS Q2/2026) khien co che cat pham
  // vi lam mat trang 1 bang chinh ma khong de lai dau vet nao khac - can canh
  // bao noi bat rieng thay vi de nguoi dung tuong nham la loi OCR/parse thong
  // thuong (yeu cau nguoi dung 2026-07-22: bao loi ro rang, chua can sua thiet
  // ke cat pham vi).
  const orderViolation = !correctionNotice && detectCashFlowBeforeOtherStatementsOrderViolation(markdown);
  const warnings = correctionNotice
    ? [
        'CANH BAO: day co ve la CONG VAN DINH CHINH (chi sua lai vai chi tieu da cong bo truoc do), KHONG PHAI mot BCTC day du - can tu tim va doi chieu voi ban BAO CAO GOC (khong phai ban "(điều chỉnh)"), khong nen dung so lieu tu file nay lam bao cao chinh thuc.',
        ...issues.map((issue) => issue.message),
      ]
    : orderViolation
      ? [
          'CANH BAO: tai lieu nay co THU TU BANG khong chuan (Luu chuyen tien te xuat hien TRUOC Ket qua kinh doanh thay vi sau) - he thong dang gia dinh LCTT luon la bang CUOI CUNG nen co the da CAT MAT du lieu Ket qua kinh doanh (va cac bang nam sau no). Vui long mo file PDF/Excel goc de doi chieu tay, khong dung so lieu tab nay lam ban chinh thuc.',
          ...issues.map((issue) => issue.message),
        ]
      : isEmptyParse(statements)
        ? ['CANH BAO: ca 3 bang chinh (BCDKT/KQKD/LCTT) deu khong doc duoc dong nao - can kiem tra tay.', ...issues.map((issue) => issue.message)]
        : issues.map((issue) => issue.message);

  return {
    statements,
    warnings,
    markdown,
    businessType,
    unreliableCells: toUnreliableCells(mismatches),
  };
}

export async function extractFinancialStatementsWithOcrProbe(
  filePath: string,
  totalPages: number,
  ocrMode: OcrMode
): Promise<ExtractFinancialStatementsResult> {
  const { markdown, statements, mismatches } = await extractWithGroupCheckRetry(filePath, async () => {
    const collected: MistralOcrPage[] = [];
    let cursor = 0;
    let checkedLanguage = false;

    while (cursor < totalPages && collected.length < MAX_PROBE_PAGES) {
      const step = collected.length === 0 ? INITIAL_PROBE_BATCH_SIZE : EXPAND_STEP;
      const batchEnd = Math.min(cursor + step, totalPages);
      const pagesZeroBased = Array.from({ length: batchEnd - cursor }, (_, i) => cursor + i);
      const { pages } =
        ocrMode === 'sync'
          ? await callMistralOcr(filePath, { pages: pagesZeroBased })
          : await callMistralOcrBatch(filePath, { pages: pagesZeroBased });
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

    // SUA 2026-07-23 (bug that SD6 Q2/2026 - xac nhan qua doi chieu that):
    // TRUOC DAY dung them 1 dieu kien "dung NGAY neu lo 10 trang dau parse ra
    // 0 dong ca 3 bang" (thiet ke rieng cho bao cao QUY DAU TU dai hang chuc
    // trang nhu FUEVN100, gia dinh "da rong thi chac chan van con rong o xa
    // hon"). Dieu kien do gio KHONG CON CAN THIET: bao cao quy dau tu (ma CK
    // dai hon 3 ky tu) da bi loc HOAN TOAN truoc khi toi day tu lib/filter.ts
    // (isNonStandardTickerLength, 2026-07-18) - nen KHONG CON tai lieu nao
    // dang thuc su dai hang chuc trang toi duoc day nua. Voi 1 bao cao BINH
    // THUONG (<=3 ky tu ma CK, thuong 20-60 trang), 10 trang dau rong hoan
    // toan van CO THE chi la do cong van/giai trinh/muc luc dai hon binh
    // thuong (xac nhan that SD6: BCDKT that nam SAU trang 10 mot chut, van
    // trong tam voi MAX_PROBE_PAGES=20) - dung som o day XOA MAT ca 3 bang
    // that thay vi doi den het 20 trang. Bo dieu kien nay, de MAX_PROBE_PAGES
    // (van gioi han cung 20 trang, khong doi) la tran duy nhat - chi phi toi
    // da tang khong dang ke (them toi da 10 trang OCR cho truong hop hiem con
    // lai thuc su rong het ca tai lieu), doi lay loi ich lon hon nhieu (khong
    // con cat oan cac bao cao binh thuong co bang nam hoi tre hon 10 trang).
    const stopReason =
      collected.length >= MAX_PROBE_PAGES
        ? 'cham tran 20 trang'
        : collected.length === totalPages
          ? 'het file'
          : 'thay Thuyet minh';
    console.log(`[mistral-ocr] ${filePath}: OCR ${collected.length} trang (tong cong, dung vi ${stopReason})`);
    return collected.map((p) => p.markdown).join('\n\n');
  });
  return buildResultFromMarkdown(markdown, statements, mismatches);
}
