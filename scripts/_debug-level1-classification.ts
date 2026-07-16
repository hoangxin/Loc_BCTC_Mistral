import { isLikelySubtotalRow } from '../lib/export/statement-shared';
const T = (label: string) => ({ columns: ['Chi tieu','So cuoi ky'], rows: [[label, 1]] });
const check = (label: string, want: boolean) => {
  const t = T(label);
  const got = isLikelySubtotalRow(t, t.rows[0], 0);
  console.log(`${got === want ? 'OK ' : 'FAIL'}  want=${want} got=${got}  "${label}"`);
};
console.log('--- Bien the "khac biet doi chut" GIO PHAI nhan duoc (cap-1) ---');
check('Tiền và tương đương tiền', true);              // bo "cac khoan"
check('I. Các khoản đầu tư tài chính ngắn hạn', true); // co "cac khoan"
check('Đầu tư tài chính ngắn hạn', true);              // khong "cac khoan"
check('Các khoản phải thu ngắn hạn', true);
check('Phải thu ngắn hạn', true);                      // bo "cac khoan" - bien the moi
console.log('--- Guard chong substring VAN nguyen (dong CON, KHONG duoc nhan la cap-1) ---');
check('Tài sản cố định hữu hình', false);              // con cua "Tai san co dinh"
check('1. Tài sản cố định vô hình', false);
check('Chi phí quản lý doanh nghiệp', false);          // khong phai cap-1 BCDKT
