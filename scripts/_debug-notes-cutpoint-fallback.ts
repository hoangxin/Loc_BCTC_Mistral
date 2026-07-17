// Regression thuong truc cho LOP DU PHONG THU 3 cua diem cat Thuyet minh
// (findNotesSectionStartIndex, markdown-tables.ts) - xac nhan qua BSL that
// (2026-07-17): 1 tai lieu co trang LCTT bi OCR hong (khong con dong "Tien
// dau ky"/"Tien cuoi ky" nao o dang bang markdown that de lop 1+2 bam vao) van
// phai cat DUNG truoc Thuyet minh, khong de thuyet minh chi tiet lot vao va
// gay leak sang balanceSheet/incomeStatement/offBalanceSheet.
import { parseStatementsFromMarkdown, containsNotesSectionMarker } from '../lib/export/markdown-tables';

let pass = 0;
let fail = 0;
function check(name: string, actual: number | boolean, expected: number | boolean) {
  const ok = actual === expected;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(60)} got=${actual} want=${expected}`);
  ok ? pass++ : fail++;
}

// Mo phong LCTT "hong" giong BSL that: co tieu de muc + 1 vai dong that, nhung
// KHONG co dong "Tien dau ky"/"Tien cuoi ky" nao o DANG BANG (lop 1+2 se that
// bai) - roi den tieu de Thuyet minh + 1 bang chi tiet co the LEAK ("Co phieu
// dang luu hanh" khop marker offBalanceSheet). Tieu de "#" rieng truoc MOI
// bang (giong cau truc tai lieu that) de bang con duoc tach dung, tranh 1 quirk
// gop bang khong lien quan khi 2 bang lien tiep khong co dong tieu de ngan
// cach (da xac nhan qua debug: thieu tieu de "#" giua cac bang lam parser gop
// nham thanh 1 bang lien tuc).
const md = `
# BẢNG CÂN ĐỐI KẾ TOÁN

| TÀI SẢN | Mã số | Kỳ này |
| --- | --- | --- |
| Tài sản ngắn hạn | 100 | 1000 |
| Tổng cộng tài sản | 270 | 1000 |

# BÁO CÁO KẾT QUẢ KINH DOANH

| Chỉ tiêu | Mã số | Kỳ này |
| --- | --- | --- |
| Doanh thu thuần | 10 | 5000 |
| Giá vốn hàng bán | 11 | 3000 |
| Lợi nhuận gộp | 20 | 2000 |

# BÁO CÁO LƯU CHUYỂN TIỀN TỆ

| Chỉ tiêu | Mã số | Kỳ này |
| --- | --- | --- |
| Lưu chuyển tiền thuần từ hoạt động kinh doanh | 20 | 500 |
| Lưu chuyển tiền thuần từ hoạt động đầu tư | 30 | 200 |

**Thuyết minh báo cáo tài chính quý 2 kết thúc ngày 30 tháng 6 năm 2026**

## 1. Đơn vị báo cáo

Công ty hoạt động trong lĩnh vực sản xuất.

## 24. Vốn cổ phần

| Chỉ tiêu | Số cổ phiếu | VND |
| --- | --- | --- |
| Số cổ phiếu đang lưu hành | 45000000 | 450000000000 |
`;

check('containsNotesSectionMarker phat hien dung (lop 3 kich hoat)', containsNotesSectionMarker(md), true);
const s = parseStatementsFromMarkdown(md);
check('offBalanceSheet KHONG bi leak (thuyet minh "Von co phan" phai bi cat)', s.offBalanceSheet.rows.length, 0);
check('balanceSheet van giu dung 2 dong that (khong bi anh huong)', s.balanceSheet.rows.length, 2);
check('incomeStatement van giu dung 3 dong that (khong bi anh huong)', s.incomeStatement.rows.length, 3);
check('cashFlow van giu dung 2 dong that (khong bi anh huong)', s.cashFlow.rows.length, 2);

// REGRESSION rieng cho lo ngai nguoi dung 2026-07-17: dong "Thuyet minh bao
// cao tai chinh" xuat hien SOM (dang bang muc luc trang bia, "| Thuyết minh
// báo cáo tài chính | 15 - 42 |") KHONG duoc kich hoat lop 3 qua som (se cat
// mat het noi dung BCDKT/KQKD/LCTT that phia sau) - day CHINH LA collision da
// tung gap va phai bo di 1 lan (2026-07-14, xem comment lich su o
// findNotesSectionStartIndex). An toan vi day la HANG BANG that (bat dau "|"),
// bi looksLikeHeadingLine loai truoc khi kip kiem tra tu khoa.
const mdWithCoverPageToc = `
| STT | Nội dung | Trang |
| --- | --- | --- |
| 1 | Báo cáo tài chính | 1 - 10 |
| 2 | Thuyết minh báo cáo tài chính | 11 - 40 |

# BẢNG CÂN ĐỐI KẾ TOÁN

| TÀI SẢN | Mã số | Kỳ này |
| --- | --- | --- |
| Tài sản ngắn hạn | 100 | 1000 |
| Tổng cộng tài sản | 270 | 1000 |
`;
const s2 = parseStatementsFromMarkdown(mdWithCoverPageToc);
check('trang bia co dong muc luc "Thuyet minh..." dang BANG KHONG cat nham BCDKT that', s2.balanceSheet.rows.length, 2);

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
