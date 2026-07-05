import type { AnalysisRow } from './analysis';
import type { StatementScope } from './statement-scope';

export interface FailedReport {
  stockCode: string;
  title: string;
  error?: string;
}

export interface DownloadedReport {
  // 'vietstock' = tai hang loat qua danh sach ky bao cao Vietstock; 'custom' =
  // them tay qua nut "Them nguon rieng" (paste link web cong ty, xem
  // lib/custom-source.ts).
  source: 'vietstock' | 'custom';
  stockCode: string;
  exchange: string;
  companyName: string;
  title: string;
  // Hop nhat / Rieng le / Chung - xem lib/statement-scope.ts (khong doan bua
  // khi khong co dau hieu ro rang).
  statementScope: StatementScope;
  // Ket qua ap tieu chi doc BCTC (lib/analysis.ts, hien TODO cho tieu chi that
  // - tra rong) - dung de dung cot % dong tren bang tong hop UI.
  analysis: AnalysisRow[] | null;
  financeUrl: string;
  fileUrl: string;
  filePath: string;
  // Text chep nguyen van CA tai lieu (ke ca Thuyet minh, vision model doc
  // anh, khong qua Tesseract - xem lib/pdf-text.ts) - CHI co voi bao cao
  // "shortlisted" (xem duoi), vi day la buoc chep toan van, ton kem hon nen
  // chi lam khi bao cao lot qua bo loc. null = bao cao khong duoc chon, hoac
  // xuat that bai (xem console log).
  textPath: string | null;
  // true = bao cao nay qua duoc bo loc noi dung (lib/content-filter.ts, hien
  // pass-through vi tieu chi that chua duoc chot) va da xuat day du .clean.pdf/.xlsx.
  // false = khong qua loc, khong xuat file (cleanPdfPath/excelPath deu null).
  shortlisted: boolean;
  // PDF text sach (khong phai anh scan goc, xem lib/export/pdf.ts) - gom 3
  // bang + toan van (ke ca Thuyet minh). null = xuat that bai (xem console
  // log) hoac bao cao khong duoc chon.
  cleanPdfPath: string | null;
  // null = xuat that bai, hoac trich 3 bang (vision model) that bai, hoac bao
  // cao khong duoc chon.
  excelPath: string | null;
  // Khac null nghia la sau khi cau truc hoa xong, so lieu Excel van khong
  // khop nguyen tac ke toan bat buoc (vd Tong tai san != Tong nguon von) -
  // nen mo file nay kiem tra tay lai truoc khi dung.
  excelWarnings: string[] | null;
}

export interface FetchStatus {
  running: boolean;
  generatedAt: string;
  quarter: number | null;
  year: number | null;
  totalFound: number;
  totalMatched: number;
  downloaded: number;
  failed: FailedReport[];
  reports: DownloadedReport[];
  error?: string;
}
