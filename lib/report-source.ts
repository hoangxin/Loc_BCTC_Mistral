import { mkdir, readFile } from 'fs/promises';
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
    const entries = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory && SUPPORTED_EXTRACT_EXTENSIONS.has(extname(entry.entryName).toLowerCase()));

    if (entries.length === 0) {
      return { resolved: [], errors: [`${report.stockCode}: file zip không chứa PDF/Word nào`] };
    }

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

    const fileHeaders = [...extractor.getFileList().fileHeaders].filter(
      (header) => !header.flags.directory && SUPPORTED_EXTRACT_EXTENSIONS.has(extname(header.name).toLowerCase())
    );
    if (fileHeaders.length === 0) {
      return { resolved: [], errors: [`${report.stockCode}: file rar không chứa PDF/Word nào`] };
    }

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
