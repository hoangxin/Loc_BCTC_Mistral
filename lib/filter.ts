import type { ReportFile } from './vietstock-reports';

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

export function filterReports(reports: ReportFile[]): ReportFile[] {
  return reports.filter((r) => !EXCLUDED_EXCHANGES.has(r.exchange.trim().toLowerCase()));
}
