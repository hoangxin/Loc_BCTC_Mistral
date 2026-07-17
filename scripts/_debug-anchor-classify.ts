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

// 5) LINH HOAT (token-AND): wording lech tung chu van nhan dung. Bank ghi
//    "Tong loi nhuan truoc thue" (KHONG co "ke toan") - cum cung cu
//    "TONG LOI NHUAN KE TOAN TRUOC THUE" se TRUOT, token-AND van bat.
check('token-AND hut bien the "Tong loi nhuan truoc thue"', `
| Chỉ tiêu | Mã số | Kỳ này |
| --- | --- | --- |
| Chi phí quản lý | 5 | 200 |
| Tổng lợi nhuận trước thuế | 50 | 800 |
`, 'incomeStatement');

// 6) Bien the BO chu "Tong" (nguoi dung luu y 2026-07-16: nhieu KQKD ghi "Loi
//    nhuan ke toan truoc thue" khong co "Tong") - phai co neo ['LOI NHUAN KE
//    TOAN','TRUOC THUE'] rieng vi ['TONG LOI NHUAN','TRUOC THUE'] se truot.
//    Van KHONG duoc nham voi LCTT (mo dau "Loi nhuan truoc thue" TRAN).
check('token-AND hut bien the "Loi nhuan ke toan truoc thue" (bo Tong)', `
| Chỉ tiêu | Mã số | Kỳ này |
| --- | --- | --- |
| Chi phí bán hàng | 25 | 300 |
| Lợi nhuận kế toán trước thuế | 50 | 800 |
`, 'incomeStatement');

// 7) REGRESSION Ngan hang (TT49 LCTT gian tiep, nguoi dung luu y 2026-07-16):
//    muc "I. Luu chuyen tien tu hoat dong kinh doanh" cua LCTT NH CHINH THUC
//    chua ca "Loi nhuan thuan tu hoat dong kinh doanh [truoc nhung thay doi ve
//    tai san va cong no hoat dong]" LAN dieu chinh phi tien mat "Chi phi du
//    phong rui ro tin dung" - 2 cum truoc day dung lam neo incomeStatement (da
//    BO). Bang LCTT that chua CA HAI cum nay PHAI van ra cashFlow.
check('LCTT Ngan hang (loi nhuan thuan + du phong RRTD) KHONG lat sang KQKD', `
| Chỉ tiêu | Mã số | Kỳ này |
| --- | --- | --- |
| I. Lưu chuyển tiền từ hoạt động kinh doanh |  |  |
| 1. Thu lãi và các khoản thu nhập tương tự |  | 500 |
| 2. Trả lãi và các chi phí tương tự |  | -200 |
| 3. Chi phí dự phòng rủi ro tín dụng |  | 50 |
| Lợi nhuận thuần từ hoạt động kinh doanh trước những thay đổi về tài sản và công nợ hoạt động |  | 350 |
| Lưu chuyển tiền thuần trong kỳ |  | 300 |
`, 'cashFlow');

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
