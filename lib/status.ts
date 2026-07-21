import type { AnalysisRow } from './analysis';
import type { StatementScope } from './statement-scope';
import type { ReportFileFormat } from './report-source';
import type { FinancialStatements } from './export/statement-shared';
import type { BusinessType } from './business-type';

export interface FailedReport {
  stockCode: string;
  title: string;
  error?: string;
}

// Bao cao NAM TRONG danh sach da loc (matched) nhung CHUA xu ly xong o LAN
// CHAY GAN NHAT - khong o "reports" (chua trich xong) cung khong o "failed"
// (khong co loi nao duoc nem ra) vi tien trinh bi GitHub Actions giet giua
// chung khi cham timeout-minutes (xem lib/pipeline.ts processedIndices).
// KHAC voi FailedReport: day khong phai loi, chi la "chua ro ket qua, can tai
// lai" - tach rieng khoi `failed` de khong lam sai lech y nghia "X loi" da co.
export interface InterruptedReport {
  stockCode: string;
  title: string;
}

// Bao cao bi LOAI CO CHU DICH (khong phai loi) o 1 trong 2 diem: (1) truoc
// khi tai, boi filterExclusionReason (lib/filter.ts - sàn OTC/Khác, Riêng
// lẻ, ma dai >3 ky tu); (2) sau khi tai/OCR, khi TOAN BO file trong 1 nhom
// deu bi coi la khong phai tieng Viet (lib/report-extract.ts tra ve null cho
// TAT CA). Them 2026-07-21 (yeu cau nguoi dung, sau bug that: 50 bao cao
// chon tay chi ra 49/48 ket qua ma KHONG CO CACH NAO biet duoc bao cao nao/
// vi sao - "khong co canh bao, khong log, bien mat hoan toan") - truoc day 2
// truong hop nay hoan toan IM LANG (khong o dau trong FetchStatus ca). KHAC
// FailedReport (loi that su, can xem lai) va InterruptedReport (chua ro ket
// qua vi bi giet giua chung) - day la loai bo CO CHU DICH theo dung thiet ke,
// chi hien de nguoi dung BIET, khong can hanh dong gi.
export interface ExcludedReport {
  stockCode: string;
  title: string;
  reason: string;
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
  // Ngan hang / Chung khoan / Bao hiem / Khac - xem lib/business-type.ts, dung
  // de tach tab UI (app/ReportsSummaryTable.tsx) vi moi nhom BCTC theo mau
  // bieu phap ly khac nhau.
  businessType: BusinessType;
  // Ket qua ap tieu chi doc BCTC (lib/analysis.ts, hien TODO cho tieu chi that
  // - tra rong) - dung de dung cot % dong tren bang tong hop UI.
  analysis: AnalysisRow[] | null;
  // 3 bang DA OCR luc "Tai BCTC" (lib/report-extract.ts, pham vi truoc "Thuyet
  // minh") - luu lai de "Xuat Excel" (app/api/report-file) DUNG THANG, KHONG
  // can tai lai file goc/OCR lai (Excel khong co toan van nen khong co rui ro
  // "ghep 2 lan OCR" nhu PDF - quyet dinh user 2026-07-06: chi "Xuat PDF" moi
  // can OCR lai toan van tu dau, vi PDF can CA bang lan toan van phai ra tu
  // CUNG 1 lan OCR, "Xuat Excel" thi khong).
  statements: FinancialStatements;
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
  // Xem InterruptedReport - rong khi lan chay gan nhat hoan tat binh thuong
  // (khong bi kill giua chung).
  interruptedReports: InterruptedReport[];
  // Xem ExcludedReport - loai CO CHU DICH (khong phai loi), CONG DON qua cac
  // lan chay giong het `failed` (khong tu xoa).
  excludedReports: ExcludedReport[];
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
