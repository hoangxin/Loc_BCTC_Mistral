// Regression thuong truc cho collapseNestedMemberRows + tang "thu tap con
// mo ho" trong findBalanceSheetLevel2Mismatches (statement-shared.ts). Khong
// can OCR - dung bang tong hop.
import { findBalanceSheetLevel2Mismatches, type StatementTable } from '../lib/export/statement-shared';

let pass = 0;
let fail = 0;
function check(name: string, table: StatementTable, expectMismatchCount: number) {
  const mm = findBalanceSheetLevel2Mismatches(table, 0, table.rows.length - 1);
  const ok = mm.length === expectMismatchCount;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(60)} mismatches=${mm.length} (expect ${expectMismatchCount})`);
  if (!ok) for (const m of mm) console.log(`      ${m.groupLabel} sum=${m.sum} reported=${m.reported}`);
  ok ? pass++ : fail++;
}

// 1) Nested THAT (1 con DUY NHAT lap lai dung gia tri cha, vd LLM/MBS that) -
//    van phai TU DONG gop dung, KHONG bao mismatch.
check(
  '1 con DUY NHAT lap lai gia tri cha (nested THAT) - khong bao mismatch',
  {
    columns: ['Mã số', 'TÀI SẢN', 'Kỳ này'],
    rows: [
      ['400', 'D. VỐN CHỦ SỞ HỮU', 2000],
      ['410', 'I. Vốn chủ sở hữu', 2000],
      ['411', '1. Vốn góp của chủ sở hữu', 2000],
      ['411a', 'Cổ phiếu phổ thông có quyền biểu quyết', 2000],
      ['440', 'TỔNG CỘNG NGUỒN VỐN', 2000],
    ],
  },
  0
);

// 2) REGRESSION ABW: 2 khoan MUC DOC LAP (khong phai cha-con) tinh co CUNG
//    gia tri - PHAI cong CA HAI vao tong (khong duoc gop nham thanh 1),
//    KHONG bao mismatch (tong that = 2000+1500+1500=5000, khop D).
check(
  '2 khoan doc lap tinh co trung gia tri (ABW that) - cong ca 2, khong mismatch',
  {
    columns: ['Mã số', 'TÀI SẢN', 'Kỳ này'],
    rows: [
      ['400', 'D. VỐN CHỦ SỞ HỮU', 5000],
      ['410', 'I. Vốn chủ sở hữu', 5000],
      ['411', '1. Vốn góp của chủ sở hữu', 2000],
      ['414', '2. Quỹ dự trữ bổ sung vốn điều lệ', 1500],
      ['415', '3. Quỹ dự phòng tài chính và rủi ro nghiệp vụ', 1500],
      ['440', 'TỔNG CỘNG NGUỒN VỐN', 5000],
    ],
  },
  0
);

// 3) Loi THAT (khong phai trung hop ngau nhien) van phai bi bao - dam bao
//    khong "an" moi mismatch vo dieu kien (fail-loud phai con hoat dong khi
//    tong THAT SU sai, khong lien quan gi den collapse).
check(
  'tong THAT SU sai (khong lien quan collapse) - van phai bao mismatch',
  {
    columns: ['Mã số', 'TÀI SẢN', 'Kỳ này'],
    rows: [
      ['400', 'D. VỐN CHỦ SỞ HỮU', 9999],
      ['410', 'I. Vốn chủ sở hữu', 9999],
      ['411', '1. Vốn góp của chủ sở hữu', 2000],
      ['414', '2. Quỹ dự trữ bổ sung vốn điều lệ', 1500],
      ['415', '3. Quỹ dự phòng tài chính và rủi ro nghiệp vụ', 1500],
      ['440', 'TỔNG CỘNG NGUỒN VỐN', 9999],
    ],
  },
  1
);

console.log(`\n${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);
