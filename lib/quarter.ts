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

export function isSameQuarter(a: QuarterPeriod, b: QuarterPeriod): boolean {
  return a.quarter === b.quarter && a.year === b.year;
}

// Danh sach quy de chon tren dropdown UI - lui dan tu "quy vua qua", moi lan
// lui 1 quy (khong phai lui theo nam) de ra dung thu tu thoi gian giam dan.
export function listRecentQuarters(count = 8, now = new Date()): QuarterPeriod[] {
  const result: QuarterPeriod[] = [];
  let { quarter, year } = getPreviousQuarter(now);
  for (let i = 0; i < count; i++) {
    result.push({ quarter, year });
    if (quarter === 1) {
      quarter = 4;
      year -= 1;
    } else {
      quarter -= 1;
    }
  }
  return result;
}
