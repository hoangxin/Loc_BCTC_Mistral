export interface QuarterPeriod {
  quarter: number;
  year: number;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// "Quý vừa qua" = quý dương lịch gần nhất đã kết thúc, tính theo giờ Việt Nam
// (server có thể chạy ở UTC, nên không dùng thẳng now.getMonth()/getFullYear()
// - gần ranh giới quý/năm sẽ lệch quý). Vd hôm nay 3/7 (đang ở Q3) -> quý vừa
// qua là Q2 cùng năm; hôm nay ở Q1 -> quý vừa qua là Q4 năm trước.
export function getPreviousQuarter(now = new Date()): QuarterPeriod {
  const nowVN = new Date(now.getTime() + VN_OFFSET_MS);
  const year = nowVN.getUTCFullYear();
  const currentQuarter = Math.floor(nowVN.getUTCMonth() / 3) + 1;

  if (currentQuarter === 1) {
    return { quarter: 4, year: year - 1 };
  }
  return { quarter: currentQuarter - 1, year };
}

// KHONG con noi nao goi (xac nhan qua grep toan repo) - so sanh ky "tu lan tai
// cuoi" tren UI gio lam qua ReportTerm.termId (xem termLastFetch/sinceLastHoursForTerm,
// app/page.tsx), khong con dung QuarterPeriod nua vi Vietstock co ca ky "6T"/"9T"/
// "Nam" ngoai Quy 1-4 (xem fetchReportTerms). Giu lai comment (khong xoa ham)
// phong khi can so sanh lai theo Quy/Nam don thuan:
// export function isSameQuarter(a: QuarterPeriod, b: QuarterPeriod): boolean {
//   return a.quarter === b.quarter && a.year === b.year;
// }

// Truoc day co listRecentQuarters() sinh san 8 quy gan nhat bang tinh toan
// lich thuan tuy - da BO (2026-07-05): Vietstock khong chi co Quy 1-4 (con co
// "6T"/"9T"/"Nam", xem lib/period-label.ts) nen danh sach chon tren dropdown
// gio lay TRUC TIEP tu Vietstock qua fetchReportTerms() (lib/vietstock-reports.ts,
// goi qua app/api/report-terms) - tu "tinh tien" dung theo Vietstock thuc te
// tai moi thoi diem, khong can tu sinh/doan lai logic ky han cua ho.
