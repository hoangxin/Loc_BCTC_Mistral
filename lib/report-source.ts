import { mkdir, readFile, rm } from 'fs/promises';
import { extname, join, basename } from 'path';
import AdmZip from 'adm-zip';
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
}

const SUPPORTED_EXTRACT_EXTENSIONS = new Set(['.pdf', '.docx', '.doc']);

// Vietstock KHONG chi zip rieng file BCTC - da gap that (2026-07-07, kiem tra
// lai zip that cua MBS/KTS/SLS/CAP): MOI zip deu kem theo ban dich tieng Anh
// CUA CHINH BCTC do, va nhieu cong ty (VD SLS: 4/6 file, CAP: 2/4 file) con kem
// them "cong van giai trinh bien dong loi nhuan"/"cong van cong bo thong tin"
// (KHONG phai BCTC, chi la van ban giai trinh ngan 1-2 trang) - truoc day
// KHONG loc gi, tao ra 3-6 dong "bao cao" ao cho MOI cong ty (vd MBS ra 6 dong
// thay vi 1, dung nhu Vietstock hien thi that). Loc 2 buoc:
// 1) Bo cac van ban PHU (khong phai BCTC) qua tu khoa ten file.
// 2) Neu con ca ban tieng Viet lan tieng Anh cua CUNG 1 tai lieu, chi giu ban
//    tieng Viet (toan bo logic doc hieu phia sau - SECTION_MARKERS, tu khoa
//    fuzzy-match... - deu dua tren thuat ngu TIENG VIET).
const ANCILLARY_DOCUMENT_PATTERNS: RegExp[] = [
  /giai.{0,3}trinh/i, // "cong van giai trinh..." (bien dong loi nhuan...) - ca ban co loi chinh ta "giaittrinh" cua MBS
  /explanation/i, // ban tieng Anh cua "giai trinh"
  /disclosure/i, // "information disclosure" (tieng Anh cua cong bo thong tin)
  /cbtt/i, // viet tat "cong bo thong tin" (vd MBS: "cvcbtt")
  /nghi.?quyet/i, // nghi quyet HDQT/DHDCD dinh kem, khong phai BCTC
  /bien.?ban/i, // bien ban hop dinh kem
];

function isAncillaryDocumentEntry(entryName: string): boolean {
  return ANCILLARY_DOCUMENT_PATTERNS.some((pattern) => pattern.test(entryName));
}

function isEnglishVariantEntry(entryName: string): boolean {
  return /(^|[_-])en([_-]|$)/i.test(entryName);
}

// Loc danh sach entry TRONG 1 zip/rar: bo van ban phu, roi neu con ca ban Viet
// lan Anh thi chi giu ban Viet - LUON fallback ve danh sach truoc do neu loc
// xong rong (vd zip chi toan van ban phu, hoac chi co ban tieng Anh) de tranh
// mat trang hoan toan con hon giu du lieu sai ngon ngu/thua. Nhan them
// `getName` vi AdmZip (entry.entryName) va node-unrar-js (header.name) dung 2
// ten thuoc tinh khac nhau cho cung 1 khai niem.
function pickPrimaryReportEntries<T>(entries: T[], getName: (entry: T) => string): T[] {
  const nonAncillary = entries.filter((e) => !isAncillaryDocumentEntry(getName(e)));
  const candidates = nonAncillary.length > 0 ? nonAncillary : entries;
  const vietnameseOnly = candidates.filter((e) => !isEnglishVariantEntry(getName(e)));
  return vietnameseOnly.length > 0 ? vietnameseOnly : candidates;
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
      return { resolved: [], errors: [`${report.stockCode}: file zip không chứa PDF/Word nào`] };
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
    return { resolved, errors: [] };
  } catch (error) {
    return {
      resolved: [],
      errors: [`${report.stockCode}: giải nén zip thất bại - ${error instanceof Error ? error.message : String(error)}`],
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
      return { resolved: [], errors: [`${report.stockCode}: file rar không chứa PDF/Word nào`] };
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
    return { resolved, errors: [] };
  } catch (error) {
    return {
      resolved: [],
      errors: [`${report.stockCode}: giải nén rar thất bại - ${error instanceof Error ? error.message : String(error)}`],
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
  if (!filePath) return { resolved: [], errors: [] };

  const ext = extname(filePath).toLowerCase();
  const format = extToFormat(ext);
  if (format) {
    return { resolved: [{ filePath, format, report: result.report }], errors: [] };
  }

  if (ext === '.zip') return extractZip(filePath, result.report);
  if (ext === '.rar') return extractRar(filePath, result.report);

  return {
    resolved: [],
    errors: [`${result.report.stockCode}: định dạng file không hỗ trợ (${ext || '(không rõ)'})`],
  };
}
