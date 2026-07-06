import type { AnalysisRow } from './analysis';
import type { StatementScope } from './statement-scope';
import type { ReportFileFormat } from './report-source';

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
  // "San giao dich" giong giao dien Vietstock (VD "HoSE"/"HNX"/"UPCOM"/"OTC").
  exchange: string;
  companyName: string;
  // "Ten tai lieu" giong giao dien Vietstock (VD "BCTC Hợp nhất quý 2 năm
  // 2026") - KHAC "companyName".
  title: string;
  // "Ngay cap nhat" giong giao dien Vietstock (ISO string) - lay tu
  // ReportFile.lastUpdate (Vietstock) hoac thoi diem tai ve (nguon rieng, xem
  // lib/custom-source.ts).
  lastUpdate: string;
  // Hop nhat / Rieng le / Chung - xem lib/statement-scope.ts (khong doan bua
  // khi khong co dau hieu ro rang).
  statementScope: StatementScope;
  // Ket qua ap tieu chi doc BCTC (lib/analysis.ts, hien TODO cho tieu chi that
  // - tra rong) - dung de dung cot % dong tren bang tong hop UI.
  analysis: AnalysisRow[] | null;
  financeUrl: string;
  fileUrl: string;
  filePath: string;
  // Dinh dang file GOC (khong phai file da giai nen/xuat) - dung khi "Xuat
  // Excel/PDF" (app/api/report-file) tai lai fileUrl, biet cach xu ly tiep
  // (OCR PDF hay doc truc tiep docx/doc) - xem lib/report-source.ts.
  format: ReportFileFormat;
  // Neu file goc la 1 entry ben trong zip/rar - ten entry GOC (xem
  // lib/report-source.ts ResolvedReportFile.entryName) - can de giai nen lai
  // DUNG file nay khi tai lai fileUrl (zip/rar co the chua nhieu file).
  entryName: string | null;
  // Nam + hau to ky (Q1-4/6T/9T/Nam, xem lib/period-label.ts) cua LAN TAI NAY -
  // dung de dat ten file xuat (lib/export/output-filename.ts), luu rieng o
  // TUNG bao cao (khong chi o FetchStatus) vi bao cao "nguon rieng" (custom)
  // khong gan voi 1 lan chay hang loat theo ky nao ca.
  periodYear: number;
  periodSlug: string;
  // Canh bao tu validateFinancialStatements cho lan OCR 3 bang luc "Tai BCTC"
  // (KHONG lien quan gi toi file xuat luc "Xuat Excel/PDF" - luc do OCR lai
  // toan bo tu dau, xem lib/export/full-document.ts) - chi de hien thi canh
  // bao tren UI, khong tu "sua".
  warnings: string[];
}

export interface FetchStatus {
  running: boolean;
  generatedAt: string;
  // Nhan hien thi ky bao cao (vd "Quý 2/2026", "6 tháng đầu năm 2026", "Cả
  // năm 2025") - xem lib/period-label.ts. Thay the truong "quarter" cu (chi
  // ho tro Quy 1-4) vi Vietstock con co ky "6T"/"9T"/"Nam".
  periodLabel: string | null;
  year: number | null;
  totalFound: number;
  totalMatched: number;
  downloaded: number;
  failed: FailedReport[];
  reports: DownloadedReport[];
  // Ket qua lan "Them nguon rieng" GAN NHAT (dispatch GitHub Actions, xem
  // app/api/custom-source, lib/custom-source.ts) - LUON duoc ghi (ke ca
  // found:false) vi day la cach DUY NHAT de app/CustomSourceForm.tsx (polling)
  // phan biet "chua chay xong" voi "chay xong nhung khong thay". `requestId`
  // do client tu sinh luc gui, dung de doi chieu dung lan yeu cau (tranh nham
  // voi ket qua cua lan thu truoc).
  lastCustomSourceCheck: { requestId: string; url: string; found: boolean; message: string } | null;
  error?: string;
}
