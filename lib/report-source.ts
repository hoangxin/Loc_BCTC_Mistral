import { mkdir, readFile, rm } from 'fs/promises';
import { extname, join, basename } from 'path';
import AdmZip from 'adm-zip';
import { PDFDocument } from 'pdf-lib';
import type { DownloadResult } from './download';
import type { ReportFile } from './vietstock-reports';

// Vietstock (va nguon rieng cua cong ty, xem lib/custom-source.ts) khong chi
// tra ve PDF - da gap that .zip nam im khong xu ly gi (VD CAP/KTS/SLS o
// Q2/2026). Module nay chuan hoa MOI dinh dang tai ve thanh 1 hoac nhieu file
// PDF/DOCX/DOC co the doc duoc (giai nen truoc neu can), truoc khi vao buoc
// trich 3 bang (lib/pipeline.ts re nhanh theo `format`).

export type ReportFileFormat = 'pdf' | 'docx' | 'doc';

export interface ResolvedReportFile {
  filePath: string;
  format: ReportFileFormat;
  report: ReportFile;
  // Neu file nay la 1 entry duoc giai nen tu zip/rar - ten entry GOC ben trong
  // (khac ten file zip/rar ngoai) - dung lam 1 nguon metadata bo sung cho
  // lib/statement-scope.ts (VD zip ngoai ten chung chung nhung entry ben
  // trong lai ghi ro "...Hopnhat.pdf"/"...Congtyme.pdf").
  entryName?: string;
}

export interface ResolveSourceResult {
  resolved: ResolvedReportFile[];
  errors: string[];
  // SUA 2026-07-23 (bug that QHD Q2/2026, theo yeu cau nguoi dung: "khong sua
  // gop file, chi canh bao"): mot so cong ty nop BCTC TACH RIENG tung bang
  // thanh nhieu file PDF ngan (VD QHD: KQKD/LCTT/BCDKT moi bang 1 file 2-6
  // trang) thay vi gop chung 1 file dai nhu da so - dropShortAncillaryPdfs
  // (thiet ke cho truong hop THUONG GAP: van ban phu ngan di kem 1 BCTC day
  // du) se LOAI NHAM toan bo cac file nay (vi tat ca deu <=SHORT_DOCUMENT_MAX_PAGES
  // trang). Khong tu dong gop lai (rui ro cao, anh huong CA pipeline, xem thao
  // luan voi nguoi dung) - chi phat hien VA canh bao khi cac file BI LOAI
  // trung ten voi >=2 LOAI BANG KHAC NHAU (xem detectSplitFilingDropWarnings),
  // de nguoi dung tu phat hien qua canh bao thay vi phai tu bao loi rieng.
  filingStructureWarnings: string[];
}

const SUPPORTED_EXTRACT_EXTENSIONS = new Set(['.pdf', '.docx', '.doc']);

// Vietstock KHONG chi zip rieng file BCTC - da gap that (2026-07-07, kiem tra
// lai zip that cua MBS/KTS/SLS/CAP): MOI zip deu kem theo ban dich tieng Anh
// CUA CHINH BCTC do, va nhieu cong ty (VD SLS: 4/6 file, CAP: 2/4 file) con kem
// them "cong van giai trinh bien dong loi nhuan"/"cong van cong bo thong tin"
// (KHONG phai BCTC, chi la van ban giai trinh ngan 1-2 trang).
//
// XOA HOAN TOAN loc theo TU KHOA TEN FILE cho van ban phu (2026-07-15, theo
// phan hoi nguoi dung sau bug CTS Q1/2026): danh sach tu khoa (giai trinh/
// explanation/disclosure/nghi quyet/bien ban/cv_NNN/... va truoc do la "cbtt")
// da nhieu lan khop NHAM chinh file BCTC that (cbtt la vi du moi nhat - "cbtt"
// chi la tien to Vietstock/cong ty dung de dat ten CHO CHINH file BCTC duoc
// cong bo, khong phai dau hieu day la van ban phu) - day la 1 LOP LOI CO CAU
// TRUC se con tai dien voi tu khoa khac trong tuong lai (moi cong ty dat ten
// file 1 kieu, khong co danh sach tu khoa nao du de bao quat het VA khong bao
// gio khop NHAM), dung tinh than "uu tien tin hieu CAU TRUC hon la doan qua tu
// ngu" da chot truoc do cho cac truong hop tuong tu. Da co SAN 1 lop loc CAU
// TRUC DOC LAP, DANG TIN CAY hon nhieu: dropShortAncillaryPdfs o duoi (van ban
// phu luon <=3 trang, BCTC that luon dai hon han vi luon co it nhat 3 bang +
// thuyet minh) - khong con can lop tu khoa nay nua, de dropShortAncillaryPdfs
// lam TOAN BO viec loc van ban phu.
//
// Neu con ca ban tieng Viet lan tieng Anh cua CUNG 1 tai lieu, chi giu ban
// tieng Viet (toan bo logic doc hieu phia sau - SECTION_MARKERS, tu khoa
// fuzzy-match... - deu dua tren thuat ngu TIENG VIET).

// BAT BUOC "en" phai la 1 TOKEN rieng (bao quanh boi "_"/"-"/dau cham/dau
// dau-cuoi chuoi), khong phai chi la 2 ky tu con trong 1 tu dai hon (vd
// "center"/"encoding"). Da gap that (2026-07-12, doi chieu that KSQ Q1/2026):
// pattern cu chi cho phep "_"/"-" NGAY SAU "en", khong tinh den dau cham
// truoc phan mo rong file (ten thuc te la "..._en.pdf" - dau cham dung ngay
// sau "en") - KHONG khop, khien ban tieng Anh LOT qua bo loc, van bi OCR va
// dua vao phan tich % nhu 1 bao cao rieng (trung lap voi ban tieng Viet,
// LUON that bai moi kiem tra vi tu khoa doi chieu deu la tieng Viet).
//
// THEM 2026-07-15 (theo yeu cau nguoi dung, sau bug CTS Q1/2026): mot so ban
// dich tieng Anh KHONG dung quy uoc dat ten "_en" nao ca - ten file THUC TE la
// cong cu tu dong sinh ra hoan toan bang TU TIENG ANH (vd CTS: "m88_..._cts_
// __financial_statements_in_quarter_1_of_2026...pdf", khong co token "en"
// rieng biet nao). Muc tieu nguoi dung: BO LOC PHAI tu quyet dinh duoc 1 file
// DUY NHAT truoc khi OCR (khong dua vao thu-tuan-tu-roi-loai-sau) - vi so
// trang KHONG the phan biet duoc 2 ban dich (LUON dai bang nhau) nen day PHAI
// la lop quyet dinh. Nhan dien qua CUM TU tieng Anh DAC TRUNG rieng cua BCTC
// (khong bao gio xuat hien trong ten file tieng Viet, du co dau hay khong dau)
// - "financial_statement(s)" la thuat ngu CO DINH cong cu dich dung cho "bao
// cao tai chinh", cung cac thuat ngu tuong duong cho tung bang/loai bao cao.
const ENGLISH_FINANCIAL_TERM_PATTERNS: RegExp[] = [
  /financial[_-]?statements?/i,
  /annual[_-]?report/i,
  /balance[_-]?sheet/i,
  /income[_-]?statement/i,
  /cash[_-]?flow[_-]?statement/i,
  /audited[_-]?report/i,
  /reviewed[_-]?report/i,
];

// Ten file GOP CA MO TA TIENG VIET LAN TIENG ANH cho CUNG 1 tai lieu tieng
// Viet (khac han file CHI co mo ta tieng Anh, moi thuc su la "ban tieng
// Anh") - 2 bug that lien tiep Q2/2026 (2026-07-21), CUNG 1 nguyen nhan goc,
// khac co che be mat:
// - QTP: "1_qtp_..._vi_en_baocaotaichinhquy2_2026_signed.pdf" (53 trang, BAN
//   CHINH THAT) bi loai vi "en" dung ngay sau "_" khop dung token "chi tieng
//   Anh" o duoi.
// - ND2: "1_nd2_..._baocaotaichinh_q2_2026_financialstatements_q2_2026_signed.pdf"
//   (79 trang, BAN CHINH THAT) bi loai vi "financialstatements" khop dung
//   ENGLISH_FINANCIAL_TERM_PATTERNS o tren.
// Ca 2 lan deu MAT HOAN TOAN ban BCTC that, chi con van ban phu ngan (giai
// trinh/cong bo thong tin) parse rong (xem project_q2_2026_night_batch_bugfix_2026-07-21).
// Sua GOC thay vi va tung pattern rieng le: neu ten file CON co dau hieu
// tieng Viet ro rang (tu "baocaotaichinh"/"bao cao tai chinh" khong dau, hoac
// token "vi" rieng biet) thi KHONG BAO GIO coi la "chi tieng Anh" du co khop
// pattern tieng Anh nao - day la file MO TA SONG NGU cho 1 tai lieu tieng
// Viet, khac han file chi mo ta bang tieng Anh (PMP "..._en.pdf", CTS
// "m88_..._financial_statements_in_quarter..." - khong co dau hieu tieng
// Viet nao trong ten, van dung dung nhu cu, khong regress).
// SUA 2026-07-23 (bug that QHD Q2/2026): cong cu dat ten file cua Vietstock
// GHEP truc tiep tu tieng Anh cuoi cung voi token "vi" KHONG chen dau "_"/"-"
// ngan cach (vd "...profit_or_lossvi_bao_cao_ket_qua...", "...q2_2026vi_thuyet_minh...")
// - le trai cua "vi" la 1 chu cai/chu so thuong (tu "loss", so "2026"), khong
// phai "_"/"-"/dau dau chuoi nhu pattern cu doi hoi, nen KHONG khop, file BCTC
// that (tieng Viet) bi hieu nham la "chi tieng Anh" va bi loai boi
// isEnglishVariantEntry - MAT CA 4 file that (KQKD/LCTT/BCDKT/Thuyet minh),
// chi con sot lai van ban phu ngan. Nguyen nhan GOC giong het bug QTP/ND2
// 2026-07-21 (thieu dau ngan cach o 1 phia cua token "vi") nhung o 1 VI TRI
// khac - khong va tung truong hop rieng, noi long DIEU KIEN LE TRAI cho ca
// chu cai/chu so (khong chi "_"/"-"/dau chuoi) - LE PHAI van giu nguyen
// ("_"/"."/"-"/cuoi chuoi, bao ve khoi tu tieng Anh THAT co "vi" giua tu vd
// "reviewed" - sau "vi" la "ewed", khong khop le phai nen an toan).
//
// 1 file khac trong CUNG zip QHD (BCDKT - "...cash_flowsbao_cao_tinh_hinh_tai_chinh...")
// lai THIEU HAN token "vi" (loi cua chinh cong cu dat ten Vietstock, khong chi
// thieu dau ngan cach), chi con "tai_chinh" (tai chinh) - cum tu XUAT HIEN
// TRONG MOI thuat ngu BCTC tieng Viet (bao cao TAI CHINH, tinh hinh TAI
// CHINH, thuyet minh bao cao TAI CHINH...) va KHONG BAO GIO xuat hien trong
// ban dich tieng Anh (luon dich la "financial", khong giu nguyen "tai chinh")
// - an toan de dung LAM ANCHOR RONG HON, cung 1 tinh than voi "baocaotaichinh"
// da co san (chi la bien the CO dau "_" ngan cach giua tu, thay vi dinh lien).
const VIETNAMESE_FILENAME_INDICATOR_PATTERNS: RegExp[] = [
  /baocaotaichinh/i,
  /tai_chinh/i,
  /(^|[a-z0-9_-])vi([_.\-]|$)/i,
];

// Export: tai dung o lib/pdf-text.ts/report-extract.ts lam dieu kien PHU
// (bilingual filename guard) cho buoc kiem tra ngon ngu theo NOI DUNG - xem
// comment o extractReportContent (report-extract.ts) ve bug QTP 2026-07-22.
export function hasVietnameseFilenameIndicator(entryName: string): boolean {
  return VIETNAMESE_FILENAME_INDICATOR_PATTERNS.some((p) => p.test(entryName));
}

function isEnglishVariantEntry(entryName: string): boolean {
  if (hasVietnameseFilenameIndicator(entryName)) return false;
  return /(^|[_-])en([_.\-]|$)/i.test(entryName) || ENGLISH_FINANCIAL_TERM_PATTERNS.some((p) => p.test(entryName));
}

// Loc danh sach entry TRONG 1 zip/rar: neu co ca ban tieng Viet lan tieng Anh
// thi chi giu ban tieng Viet - LUON fallback ve danh sach truoc do neu loc
// xong rong (vd zip chi co ban tieng Anh) de tranh mat trang hoan toan con hon
// giu du lieu sai ngon ngu. Van ban phu (cong van/giai trinh...) KHONG con loc
// o day (xem comment o tren) - de dropShortAncillaryPdfs (loc theo SO TRANG,
// sau khi giai nen) lam viec do. Nhan them `getName` vi AdmZip (entry.entryName)
// va node-unrar-js (header.name) dung 2 ten thuoc tinh khac nhau cho cung 1 khai niem.
function pickPrimaryReportEntries<T>(entries: T[], getName: (entry: T) => string): T[] {
  const vietnameseOnly = entries.filter((e) => !isEnglishVariantEntry(getName(e)));
  return vietnameseOnly.length > 0 ? vietnameseOnly : entries;
}

// So trang toi da de coi 1 PDF la "van ban ngan" (cong van/giai trinh, KHONG
// phai BCTC that - BCTC luon co it nhat 3 bang + thuyet minh, khong bao gio
// gon duoi nguong nay - mau THAT nho nhat da xac nhan van >=20 trang). DUY
// NHAT lop loc van ban phu con lai (2026-07-15, xem comment o dau file - da bo
// han loc theo TU KHOA TEN FILE, tung khop nham ca file BCTC that nhieu lan) -
// loc theo SO TRANG khong phu thuoc cach dat ten, ben hon nhieu.
//
// NANG tu 3 len 10 (2026-07-15, theo yeu cau nguoi dung: "3 trang qua ngan,
// se de lot") - van ban phu THAT (giai trinh/cong van...) da xac nhan qua
// nhieu bao cao chi 1-2 trang, nen 10 van con RAT NHIEU khoang cach an toan
// voi ca 2 phia (khong nham loai BCTC that - luon >=20 trang; khong de lot van
// ban phu dai hon 1 chut so voi cac mau da gap).
const SHORT_DOCUMENT_MAX_PAGES = 10;

async function getPdfPageCount(filePath: string): Promise<number | null> {
  try {
    const buffer = await readFile(filePath);
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch (error) {
    console.warn('getPdfPageCount: khong doc duoc so trang, bo qua loc theo trang cho file nay', filePath, error);
    return null;
  }
}

// Loc bo cac PDF QUA NGAN (<=SHORT_DOCUMENT_MAX_PAGES trang) trong 1 nhom
// nhieu file CUNG 1 bao cao (zip/rar co >1 file) - CHI khi co it nhat 1 file
// khac dai hon han (dam bao la BCTC that), tranh loai nham truong hop hiem
// (vd bao cao that su chi co 1 file rat ngan - khong co gi de so sanh thi giu
// nguyen, an toan hon la doan bua). DOCX/DOC khong loc (chi PDF moi dem trang
// duoc de bang pdf-lib o day).
//
// Tra ve CA `dropped` (2026-07-23, phuc vu detectSplitFilingDropWarnings o
// duoi - can biet CHINH XAC file nao bi loai de cham diem tin hieu "BCTC tach
// file rieng" ma khong doi hanh vi loc).
async function dropShortAncillaryPdfs(
  resolved: ResolvedReportFile[]
): Promise<{ kept: ResolvedReportFile[]; dropped: ResolvedReportFile[] }> {
  if (resolved.length <= 1) return { kept: resolved, dropped: [] };
  const withPages = await Promise.all(
    resolved.map(async (r) => ({ r, pages: r.format === 'pdf' ? await getPdfPageCount(r.filePath) : null }))
  );
  const hasLongDoc = withPages.some((x) => x.pages !== null && x.pages > SHORT_DOCUMENT_MAX_PAGES);
  if (!hasLongDoc) return { kept: resolved, dropped: [] };
  const filtered = withPages.filter((x) => x.pages === null || x.pages > SHORT_DOCUMENT_MAX_PAGES).map((x) => x.r);
  if (filtered.length === 0) return { kept: resolved, dropped: [] };
  const droppedSet = new Set(withPages.filter((x) => x.pages !== null && x.pages <= SHORT_DOCUMENT_MAX_PAGES).map((x) => x.r));
  return { kept: filtered, dropped: [...droppedSet] };
}

// SUA 2026-07-23 (bug that QHD Q2/2026, theo yeu cau nguoi dung - xem
// ResolveSourceResult.filingStructureWarnings): 4 ten CHINH THUC, BAT BUOC
// theo VAS (Thong tu 200/2014 va cac ban tuong duong) cho 4 loai bao cao/bang
// - ON DINH theo luat, khong doan theo cach 1 cong ty viet tat rieng, nen an
// toan hon nhieu so voi 1 danh sach tu khoa tu do (khac han loai tu khoa da
// bi bo o tren cho van ban phu). Gop CA ban tieng Anh (da co san trong
// ENGLISH_FINANCIAL_TERM_PATTERNS) lan tieng Viet khong dau/co gach duoi.
type StatementFileType = 'balanceSheet' | 'incomeStatement' | 'cashFlow';
const FILENAME_STATEMENT_TYPE_PATTERNS: { type: StatementFileType; pattern: RegExp }[] = [
  { type: 'balanceSheet', pattern: /balance[_-]?sheet|tinh[_-]?hinh[_-]?tai[_-]?chinh|can[_-]?doi[_-]?ke[_-]?toan/i },
  { type: 'incomeStatement', pattern: /income[_-]?statement|profit[_-]?(and|or)[_-]?loss|ket[_-]?qua[_-]?hoat[_-]?dong[_-]?kinh[_-]?doanh/i },
  { type: 'cashFlow', pattern: /cash[_-]?flow[_-]?statement|luu[_-]?chuyen[_-]?tien[_-]?te/i },
];

function classifyFilenameStatementType(name: string): StatementFileType | null {
  return FILENAME_STATEMENT_TYPE_PATTERNS.find((p) => p.pattern.test(name))?.type ?? null;
}

// CHI canh bao (khong tu gop/sua - qua rui ro cho ca pipeline, xem thao luan
// voi nguoi dung 2026-07-23) khi cac file BI LOAI boi dropShortAncillaryPdfs
// khop >=2 LOAI BANG KHAC NHAU - 1 file phu that (giai trinh/cong van, xem
// comment dropShortAncillaryPdfs) khong bao gio mang ten khop dung 2 loai
// bang khac nhau CUNG LUC, chi 1 BCTC nop tach rieng tung bang moi tao ra
// tinh huong nay.
function detectSplitFilingDropWarnings(dropped: ResolvedReportFile[]): string[] {
  if (dropped.length < 2) return [];
  const typesFound = new Set(
    dropped.map((r) => classifyFilenameStatementType(r.entryName ?? r.filePath)).filter((t): t is StatementFileType => t !== null)
  );
  if (typesFound.size < 2) return [];
  const droppedNames = dropped.map((r) => r.entryName ?? basename(r.filePath)).join(', ');
  return [
    `CANH BAO: phat hien ${dropped.length} file ngan (<=${SHORT_DOCUMENT_MAX_PAGES} trang) trong nhom nay co ten khop NHIEU LOAI BANG BCTC khac nhau (${[...typesFound].join(', ')}) nhung da bi bo qua boi bo loc "van ban phu ngan" - co the day la 1 BCTC NOP TACH RIENG tung bang thanh nhieu file (khong gop chung 1 file nhu thuong le) chu khong phai van ban phu that. Can mo file zip/rar goc kiem tra tay neu ket qua ben duoi thieu/rong du lieu. Cac file bi bo qua: ${droppedNames}`,
  ];
}

// SUA 2026-07-23 (bug that TCI Q2/2026): 1 nhom nhieu file (zip co ca BCTC
// that LAN 1 file "Thuyet minh BCTC" nop rieng, xem lib/filter.ts
// isStandaloneNotesFiling ve boi canh Vietstock dat file nay - o day la ten
// FILE trong zip, khac muc do "ten BAO CAO" o filter.ts) - neu file Thuyet
// minh (thuong la .docx, KHONG bi loc boi dropShortAncillaryPdfs vi ham do
// CHI dem trang duoc cho PDF) TINH CO dung TRUOC file BCTC that trong thu tu
// zip.getEntries(), vong lap "dung ngay khi gap file co du lieu" o
// lib/pipeline.ts se dung LAI o day (Thuyet minh van co the co 1 bang phu voi
// du lieu that, vd bang thuyet minh chi tiet - khong RONG hoan toan) va
// KHONG BAO GIO thu file BCTC that phia sau. Day sang CUOI danh sach (khong
// LOAI HAN - van con la luoi an toan neu day THAT SU la file DUY NHAT trong
// nhom) de file nghi la BCTC that luon duoc thu TRUOC.
const STANDALONE_NOTES_FILENAME_MARKER = /thuyet[_-]?minh/i;

function deprioritizeStandaloneNotesFiles<T>(resolved: T[], getName: (entry: T) => string): T[] {
  if (resolved.length <= 1) return resolved;
  const primary = resolved.filter((r) => !STANDALONE_NOTES_FILENAME_MARKER.test(getName(r)));
  const deprioritized = resolved.filter((r) => STANDALONE_NOTES_FILENAME_MARKER.test(getName(r)));
  return primary.length > 0 ? [...primary, ...deprioritized] : resolved;
}

function extToFormat(ext: string): ReportFileFormat | null {
  const normalized = ext.toLowerCase();
  if (normalized === '.pdf') return 'pdf';
  if (normalized === '.docx') return 'docx';
  if (normalized === '.doc') return 'doc';
  return null;
}

function extractZip(zipPath: string, report: ReportFile): ResolveSourceResult {
  const destDir = `${zipPath}__extracted`;
  try {
    const zip = new AdmZip(zipPath);
    const allEntries = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory && SUPPORTED_EXTRACT_EXTENSIONS.has(extname(entry.entryName).toLowerCase()));

    if (allEntries.length === 0) {
      return { resolved: [], errors: [`${report.stockCode}: file zip không chứa PDF/Word nào`], filingStructureWarnings: [] };
    }

    const entries = pickPrimaryReportEntries(allEntries, (e) => e.entryName);
    const resolved: ResolvedReportFile[] = [];
    for (const entry of entries) {
      const format = extToFormat(extname(entry.entryName));
      if (!format) continue;
      // maintainEntryPath=false: gom het ra 1 thu muc phang, khong dung lai
      // cau truc thu muc ben trong zip (khong can, chi can dung file bao cao).
      zip.extractEntryTo(entry, destDir, false, true);
      resolved.push({ filePath: join(destDir, basename(entry.entryName)), format, report, entryName: entry.entryName });
    }
    return { resolved, errors: [], filingStructureWarnings: [] };
  } catch (error) {
    return {
      resolved: [],
      errors: [`${report.stockCode}: giải nén zip thất bại - ${error instanceof Error ? error.message : String(error)}`],
      filingStructureWarnings: [],
    };
  }
}

// node-unrar-js chay WASM (khong can cai unrar tren may/server - than thien
// serverless hon shell-out) nhung khi chay duoi webpack (dung trong Next.js
// API routes) can tu doc file .wasm va truyen vao qua option `wasmBinary`
// (xem README node-unrar-js, muc "Use in Webpack-bundled NodeJS Project").
// Dung duong dan qua process.cwd() thay vi require.resolve() de tranh bi
// webpack/@vercel-nft co gang tu bundle file .wasm nay - CHI chay dung tren
// npm run dev hien tai (node_modules luon co san tren dia), CHUA chac chan
// hoat dong dung tren Vercel serverless that (van la cau hoi mo trong
// README) - can kiem tra lai neu/khi trien khai that.
async function loadUnrarWasmBinary(): Promise<ArrayBuffer> {
  const buffer = await readFile(join(process.cwd(), 'node_modules', 'node-unrar-js', 'esm', 'js', 'unrar.wasm'));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

async function extractRar(rarPath: string, report: ReportFile): Promise<ResolveSourceResult> {
  const destDir = `${rarPath}__extracted`;
  try {
    await mkdir(destDir, { recursive: true });
    const { createExtractorFromFile } = await import('node-unrar-js/esm');
    const wasmBinary = await loadUnrarWasmBinary();
    const extractor = await createExtractorFromFile({ filepath: rarPath, targetPath: destDir, wasmBinary });

    const allFileHeaders = [...extractor.getFileList().fileHeaders].filter(
      (header) => !header.flags.directory && SUPPORTED_EXTRACT_EXTENSIONS.has(extname(header.name).toLowerCase())
    );
    if (allFileHeaders.length === 0) {
      return { resolved: [], errors: [`${report.stockCode}: file rar không chứa PDF/Word nào`], filingStructureWarnings: [] };
    }
    const fileHeaders = pickPrimaryReportEntries(allFileHeaders, (h) => h.name);

    // Generator cua node-unrar-js chi THAT SU giai nen khi duyet qua - phai
    // spread/duyet het thi cac file moi duoc ghi ra dia (xem README).
    const extracted = [...extractor.extract({ files: fileHeaders.map((header) => header.name) }).files];

    const resolved: ResolvedReportFile[] = [];
    for (const file of extracted) {
      const format = extToFormat(extname(file.fileHeader.name));
      if (!format) continue;
      resolved.push({ filePath: join(destDir, file.fileHeader.name), format, report, entryName: file.fileHeader.name });
    }
    return { resolved, errors: [], filingStructureWarnings: [] };
  } catch (error) {
    return {
      resolved: [],
      errors: [`${report.stockCode}: giải nén rar thất bại - ${error instanceof Error ? error.message : String(error)}`],
      filingStructureWarnings: [],
    };
  }
}

// Chuan hoa 1 ket qua tai ve thanh 0-nhieu ResolvedReportFile (0 neu la dinh
// dang khong ho tro, hoac zip/rar rong/loi - xem `errors`). >1 xay ra khi
// zip/rar chua nhieu file bao cao (vd vua co ban Hop nhat vua co ban Rieng le).
// Xoa file goc da tai ve (VD data/reports/<ky>/...) + thu muc giai nen zip/rar
// (neu co, xem extractZip/extractRar o tren) SAU KHI da trich xong 3 bang -
// file goc chi can thiet cho buoc OCR, "Xuat Excel" dung lai `report.statements`
// da luu, "Xuat PDF" tu tai lai tu `fileUrl` (xem app/api/report-file) nen
// khong can giu file goc lau dai. Best-effort (force:true nuot loi ENOENT/khoa
// file) - khong critical, chi de don dep dia, that bai thi log canh bao roi bo qua.
export async function cleanupDownloadedFile(filePath: string): Promise<void> {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.zip' || ext === '.rar') {
    await rm(`${filePath}__extracted`, { recursive: true, force: true }).catch((error) => {
      console.warn('cleanupDownloadedFile: khong xoa duoc thu muc giai nen', filePath, error);
    });
  }
  await rm(filePath, { force: true }).catch((error) => {
    console.warn('cleanupDownloadedFile: khong xoa duoc file goc', filePath, error);
  });
}

export async function resolveReportSourceFiles(result: DownloadResult): Promise<ResolveSourceResult> {
  const filePath = result.filePath;
  if (!filePath) return { resolved: [], errors: [], filingStructureWarnings: [] };

  const ext = extname(filePath).toLowerCase();
  const format = extToFormat(ext);
  if (format) {
    return { resolved: [{ filePath, format, report: result.report }], errors: [], filingStructureWarnings: [] };
  }

  // dropShortAncillaryPdfs: lop phong ngua THU 2 (theo so trang, xem comment
  // o tren) - ap dung chung cho ca zip lan rar, sau khi da loc theo ten file.
  if (ext === '.zip') {
    const zipResult = extractZip(filePath, result.report);
    const { kept, dropped } = await dropShortAncillaryPdfs(zipResult.resolved);
    return {
      resolved: deprioritizeStandaloneNotesFiles(kept, (r) => r.entryName ?? r.filePath),
      errors: zipResult.errors,
      filingStructureWarnings: detectSplitFilingDropWarnings(dropped),
    };
  }
  if (ext === '.rar') {
    const rarResult = await extractRar(filePath, result.report);
    const { kept, dropped } = await dropShortAncillaryPdfs(rarResult.resolved);
    return {
      resolved: deprioritizeStandaloneNotesFiles(kept, (r) => r.entryName ?? r.filePath),
      errors: rarResult.errors,
      filingStructureWarnings: detectSplitFilingDropWarnings(dropped),
    };
  }

  return {
    resolved: [],
    errors: [`${result.report.stockCode}: định dạng file không hỗ trợ (${ext || '(không rõ)'})`],
    filingStructureWarnings: [],
  };
}
