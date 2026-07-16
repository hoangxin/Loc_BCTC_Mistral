// Regression thuong truc cho ky thuat NEO (ANCHOR_MARKERS_BY_KEY) + token-AND
// trong classifyTableByContent (markdown-tables.ts). Khong can OCR.
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';

let pass = 0;
let fail = 0;
function check(name: string, md: string, expect: 'balanceSheet' | 'incomeStatement' | 'cashFlow') {
  const s = parseStatementsFromMarkdown(md);
  const counts = {
    balanceSheet: s.balanceSheet.rows.length,
    incomeStatement: s.incomeStatement.rows.length,
    cashFlow: s.cashFlow.rows.length,
  };
  const ok = counts[expect] > 0 && Object.entries(counts).every(([k, v]) => k === expect || v === 0);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(48)} ${JSON.stringify(counts)}`);
  ok ? pass++ : fail++;
}

// 1) NEO LCTT thang 2 marker MAP MO nghieng BCDKT (ky thuat nguoi dung de nghi):
//    khong co chuoi ket thuc 50->60->70 nen definiteCashFlowTable KHONG kich
//    hoat -> hoan toan dua vao cham diem neo/marker. Khong neo: BCDKT thang 2-0.
check('neo LCTT thang marker map mo BCDKT', `
| Chỉ tiêu | Mã số | Kỳ này |
| --- | --- | --- |
| Lưu chuyển tiền thuần từ hoạt động kinh doanh | 20 | 1000 |
| Tiền và các khoản tương đương tiền | 110 | 2000 |
| Hàng tồn kho | 140 | 3000 |
`, 'cashFlow');

// 2) token-AND: DN ghi GON "Loi nhuan gop" (khong "ve ban hang va cung cap dich
//    vu") van nhan dung KQKD.
check('bien the gon "Loi nhuan gop" -> KQKD', `
| Chỉ tiêu | Mã số | Kỳ này |
| --- | --- | --- |
| Doanh thu thuần về bán hàng và cung cấp dịch vụ | 10 | 5000 |
| Giá vốn hàng bán | 11 | 3000 |
| Lợi nhuận gộp | 20 | 2000 |
`, 'incomeStatement');

// 3) REGRESSION MIG: nua TAI SAN cua BCDKT bao hiem chua "Du phong phi nhuong
//    tai bao hiem" (soi guong cum "phi nhuong tai bao hiem" ben KQKD). Neo BS
//    "TAI SAN TAI BAO HIEM" phai thang -> classify balanceSheet, KHONG bi lat
//    sang incomeStatement nhu bug 2026-07-16.
check('BCDKT bao hiem (phi nhuong) KHONG lat sang KQKD', `
| Tài sản | Mã số | Số cuối kỳ |
| --- | --- | --- |
| VI. Tài sản tái bảo hiểm | 240 | 5000 |
| 1. Dự phòng phí nhượng tái bảo hiểm | 241 | 3000 |
| 2. Dự phòng bồi thường nhượng tái bảo hiểm | 242 | 2000 |
| TỔNG CỘNG TÀI SẢN | 270 | 90000 |
`, 'balanceSheet');

// 4) Neo theo loai hinh: Ngan hang "Thu nhap lai thuan", CTCK "Cong doanh thu
//    hoat dong" -> incomeStatement du co dong map mo.
check('neo KQKD Ngan hang "Thu nhap lai thuan"', `
| Chỉ tiêu | Mã số | Kỳ này |
| --- | --- | --- |
| Thu nhập lãi thuần | 3 | 1000 |
| Lãi thuần từ hoạt động dịch vụ | 6 | 500 |
`, 'incomeStatement');

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
