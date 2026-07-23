import type { ReportFile } from './vietstock-reports';
import { classifyStatementScope } from './statement-scope';
import { normalizeLabelText } from './export/statement-shared';

// Cho AI dung sau nay neu tieu chi loc can doc/phan loai noi dung (vd Qwen
// dang duoc dung cho lib/digest.ts o 2 project loc_tin) - hien chua wire vao
// dau vi tieu chi loc thuc te chua duoc chot.
// import { callQwen } from './ai/qwen';
// import { callClaude } from './ai/claude'; // du phong - doi sang Claude khi can

// San (exchange, = raw CatID tu Vietstock, xem lib/vietstock-reports.ts) can
// bo qua - yeu cau nguoi dung 2026-07-12: "OTC" va "Khac" (vd cong ty quan ly
// quy nhu ACBC) khong thuoc pham vi phan tich, khong ton OCR cho cac bao cao
// nay. So sanh khong phan biet hoa/thuong vi khong chac chan Vietstock luon
// tra ve dung 1 kieu viet hoa/thuong.
const EXCLUDED_EXCHANGES = new Set(['otc', 'khac']);

// Bo qua bao cao "Me (Rieng le)" - yeu cau nguoi dung 2026-07-18: cong ty co
// cong ty con thuong nop CA "Hop nhat" (buc tranh toan nhom) LAN "Rieng le"
// (chi rieng cong ty me, KHONG gop cong ty con) cho CUNG 1 ky - "Rieng le"
// trung lap thong tin voi "Hop nhat" (da bao gom rieng cong ty me trong do)
// nen bo qua tu VONG LOC nay, TRUOC KHI tai/OCR - tiet kiem ca chi phi OCR lan
// khong lam ket qua roi rac 2 dong/ma. Dung LAI classifyStatementScope (khong
// tu doan rieng o day) tren title/fullName - 2 truong DUY NHAT co san O DAY
// (truoc khi tai/giai nen file, nen chua co entryName) - neu metadata KHONG
// ro rang (vd cong ty khong co cong ty con, chi 1 ban bao cao duy nhat), ket
// qua se la 'Chung' (khong phai 'Rieng le'), GIU LAI dung nguyen tac "khong
// doan bua khi khong chac" cua classifyStatementScope.
function isParentOnlyReport(r: ReportFile): boolean {
  return classifyStatementScope({ metadataText: `${r.title} ${r.fullName}` }) === 'Riêng lẻ';
}

// Bo qua ma CK dai hon 3 ky tu (vd FUEVN100, E1VFVN30...) - yeu cau nguoi
// dung 2026-07-18 sau su co FUEVN100 Q2/2026: ma co phieu thuong tren HOSE/
// HNX/UPCOM LUON dung 3 ky tu, ma dai hon la CHUNG CHI QUY/ETF (mau BCTC
// khac han doanh nghiep thuong - vd Thuyet minh danh muc dai hang chuc trang
// nam TRUOC ca 3 bang chinh, xem project_fetch_hang_fuevn100_2026-07-18 -
// khong thuoc pham vi phan tich cua he thong nay), loai TU VONG LOC nay
// (truoc khi tai/OCR) de tiet kiem ca chi phi tai file lan OCR, khong chi
// dua vao co che "dung som neu 12 trang dau khong co bang"
// (extractFinancialStatementsWithOcrProbe, lib/export/financial-statements.ts).
function isNonStandardTickerLength(r: ReportFile): boolean {
  return r.stockCode.trim().length > 3;
}

// Bo qua ban "Thuyet minh BCTC" nop RIENG (tach khoi file BCTC chinh) - bug
// that ART/MIG Q2/2026 (2026-07-23): Vietstock doi khi liet ke file "Thuyet
// minh BCTC" (ten Vietstock dat, KHONG phai OCR/doan tu file) nhu 1 bao cao
// RIENG BIET voi title "Thuyết minh BCTC quý...", cung ky/scope voi file BCTC
// chinh - day KHONG PHAI 1 BCTC day du (chi la phan thuyet minh, khong co
// BCDKT/KQKD/LCTT) nen luon ra 0 dong ca 3 bang + canh bao "khong doc duoc
// dong nao" gay hieu nham la loi. TE HON: vi dung CHUNG identity key (ma+ky+
// scope) voi ban BCTC chinh khi luu markdown (lib/ocr-markdown-store.ts),
// script reparse-tu-markdown co the GHI DE nham markdown cua ban chinh bang
// markdown cua ban Thuyet-minh-rieng nay (da xac nhan that ART: ban chinh tu
// 70/39/37 dong bi doi thanh 0/0/0 sau 1 lan reparse). Loc tu VONG LOC nay
// (dua tren TITLE do Vietstock cung cap, KHONG phai doan tu ten file - khac
// han lop loc tu-khoa-ten-file da bi bo vi khop nham qua nhieu, xem lich su o
// duoi) - BCTC that LUON bat dau bang "BCTC..." (chua bao gio gap "Thuyet
// minh..." o dau title cho 1 BCTC day du that su).
function isStandaloneNotesFiling(r: ReportFile): boolean {
  return normalizeLabelText(r.title).startsWith('THUYET MINH');
}

// Ly do 1 report bi VONG LOC nay loai, hay null neu KHONG bi loai - dung
// chung boi filterReports (chi can boolean) VA lib/pipeline.ts (can ly do CU
// THE de ghi vao excludedReports, xem comment tai do) - tranh lap lai 3 dieu
// kien o 2 noi (them 2026-07-21, theo yeu cau nguoi dung sau bug 50 bao cao
// chon tay chi ra 49 ma KHONG biet duoc ma nao/vi sao, "khong co canh bao,
// khong log, bien mat hoan toan khoi ket qua ma khong ai biet").
export function filterExclusionReason(r: ReportFile): string | null {
  if (EXCLUDED_EXCHANGES.has(r.exchange.trim().toLowerCase())) {
    return `Sàn giao dịch "${r.exchange}" ngoài phạm vi phân tích (OTC/Khác)`;
  }
  if (isParentOnlyReport(r)) {
    return 'Báo cáo "Riêng lẻ" (công ty mẹ) - trùng lặp thông tin với báo cáo Hợp nhất cùng kỳ, đã có trong Hợp nhất';
  }
  if (isNonStandardTickerLength(r)) {
    return `Mã "${r.stockCode}" dài hơn 3 ký tự - là chứng chỉ quỹ/ETF, ngoài phạm vi phân tích`;
  }
  if (isStandaloneNotesFiling(r)) {
    return 'Bản "Thuyết minh BCTC" nộp riêng (không phải BCTC đầy đủ) - đã có báo cáo BCTC chính cùng kỳ';
  }
  return null;
}

export function filterReports(reports: ReportFile[]): ReportFile[] {
  return reports.filter((r) => filterExclusionReason(r) === null);
}
