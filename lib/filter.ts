import type { ReportFile } from './vietstock-reports';
import { classifyStatementScope } from './statement-scope';

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

export function filterReports(reports: ReportFile[]): ReportFile[] {
  return reports.filter(
    (r) => !EXCLUDED_EXCHANGES.has(r.exchange.trim().toLowerCase()) && !isParentOnlyReport(r) && !isNonStandardTickerLength(r)
  );
}
