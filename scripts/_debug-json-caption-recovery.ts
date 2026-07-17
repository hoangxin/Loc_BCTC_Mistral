// Regression thuong truc cho convertJsonCaptionTablesToMarkdown (markdown-tables.ts)
// - xac nhan qua BSL that (2026-07-18): Mistral OCR doi khi tra 1 bang duoi
// dang KHOI JSON mo ta anh (khong phai bang markdown "| ... |" chuan) - xac
// nhan qua OCR LAI RIENG 1 trang, Mistral nhat quan tra dang nay cho bang do
// (khong phai do ngu canh cac trang xung quanh). Chuyen doi khoi JSON THANH
// bang markdown tuong duong truoc khi vao pipeline parse chinh.
import { parseStatementsFromMarkdown } from '../lib/export/markdown-tables';

let pass = 0;
let fail = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(60)} ${ok ? '' : `got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`}`);
  ok ? pass++ : fail++;
}

// 1) Mo phong dung cau truc BSL that: 1 bang LCTT "hoat dong kinh doanh" sach
//    (markdown chuan) roi tiep ngay sau (qua vai dong van xuoi ten cong ty/mau
//    bieu, duoi nguong 12 dong "rac duoc phep xuyen qua") la 1 khoi JSON-caption
//    mo ta bang "hoat dong tai chinh" - CO cot header TRUNG LAP LIEN TIEP
//    (gia lap loi Mistral thuc te) va gia tri KHAC NHAU giua 2 cot trung ten.
const md = `
# BÁO CÁO LƯU CHUYỂN TIỀN TỆ

| Chỉ tiêu | Mã số | Kỳ này | Kỳ trước |
| --- | --- | --- | --- |
| LƯU CHUYỂN TIỀN TỪ HOẠT ĐỘNG KINH DOANH |  |  |  |
| Lưu chuyển tiền thuần từ hoạt động kinh doanh | 20 | 1000 | 900 |

Công ty ABC
Báo cáo lưu chuyển tiền tệ (tiếp theo)
Mẫu B 09 - DN

(Ban hành theo Thông tư số 99/2025/TT-BTC)[{"box_2d": [1,2,3,4], "label": "table", "caption": "<table><thead><tr><th></th><th>Mã số</th><th>Kỳ này VND</th><th>Kỳ trước VND</th><th>Kỳ trước VND</th></tr></thead><tr><td colspan=\\"5\\"><b>LƯU CHUYỂN TIỀN TỪ HOẠT ĐỘNG TÀI CHÍNH</b></td></tr><tr><td>Tiền thu từ đi vay</td><td>33</td><td>500</td><td>-</td><td>200</td></tr><tr><td><b>Lưu chuyển tiền thuần từ hoạt động tài chính</b></td><td><b>40</b></td><td><b>500</b></td><td><b>200</b></td><td><b>200</b></td></tr>"}]
`;

const s = parseStatementsFromMarkdown(md);
const li = s.cashFlow.columns.findIndex((c) => /chỉ tiêu/i.test(c || ''));
const L = li === -1 ? 0 : li;

check('phuc hoi dung so dong (khong lan vao bang truoc, khong dong rac)', s.cashFlow.rows.length, 5);
const financingRow = s.cashFlow.rows.find((r) => String(r[L] ?? '').includes('Tiền thu từ đi vay'));
check('dong chi tiet phuc hoi dung gia tri (cot trung lap da loai, giu cot dung)', financingRow, ['Tiền thu từ đi vay', '33', 500, 200]);
const subtotalRow = s.cashFlow.rows.find((r) => String(r[L] ?? '').includes('Lưu chuyển tiền thuần từ hoạt động tài chính'));
check('dong tong muc phuc hoi dung (khong bi anh huong boi cap cot trung lap)', subtotalRow, ['Lưu chuyển tiền thuần từ hoạt động tài chính', '40', 500, 200]);
const kinhDoanhRow = s.cashFlow.rows.find((r) => String(r[L] ?? '').includes('hoạt động kinh doanh') && !String(r[L] ?? '').includes('TÀI CHÍNH'));
check('bang truoc do (markdown sach) khong bi anh huong', kinhDoanhRow?.[2], 1000);

// 2) JSON bi CAT CUT giua chung (mo phong dung ca that cua BSL: mat "Tien
//    dau ky"/"Tien cuoi ky" o cuoi bang do Mistral cat chuoi giua chung) -
//    cac dong HOAN CHINH truoc do van phai phuc hoi duoc, dong CUOI CUNG
//    chua hoan chinh phai bi loai an toan (khong doan/fabricate).
const truncatedMd = `
# BÁO CÁO LƯU CHUYỂN TIỀN TỆ TRANG 2

[{"box_2d": [1,2,3,4], "label": "table", "caption": "<table><thead><tr><th></th><th>Mã số</th><th>Kỳ này</th></tr></thead><tr><td colspan=\\"3\\"><b>LƯU CHUYỂN TIỀN TỪ HOẠT ĐỘNG TÀI CHÍNH</b></td></tr><tr><td>Tiền thu từ đi vay</td><td>33</td><td>500</td></tr><tr><td><b>Lưu chuyển tiền thuần từ hoạt động tài chính</b></td><td><b>40</b></td><td><b>500</b></td></tr><tr><td>Tiền và tương đương tiền đầu kỳ</td><td>60</td><td>300</td></tr><tr><td>Tiền và tương đương tiền cuối k`;
const s2 = parseStatementsFromMarkdown(truncatedMd);
check('dong bi cat cut GIUA chung khong duoc xuat hien (an toan, khong fabricate)', s2.cashFlow.rows.some((r) => String(r[0] ?? '').includes('cuối k')), false);
check('cac dong HOAN CHINH truoc do van duoc phuc hoi du dong sau bi cat', s2.cashFlow.rows.some((r) => String(r[0] ?? '').includes('đầu kỳ')), true);
check('so dong phuc hoi dung (4 dong hoan chinh, dong cat cut bi loai)', s2.cashFlow.rows.length, 4);

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
