import { findRevenueRow } from './validate-statements';
import { isLikelySubtotalRow, normalizeLabelText, type StatementTable } from './statement-shared';

export type RowStyleTier = 'heading' | 'subheading' | 'plain';

// 4 dong "tong hang muc" quan trong nhat cua Bang CDKT (yeu cau user
// 2026-07-08, doi chieu mau IDV that): dam + IN HOA, khac voi cac dong tong
// nhom con lai (A/B/I/II/III...) chi in dam thuong. Doi chieu PDF goc cho
// thay CA "A. TAI SAN NGAN HAN" lan "C - NO PHAI TRA" deu duoc VIET HOA SAN
// trong van ban nguon - nen KHONG the dua vao "chu hoa co san" de phan biet,
// phai liet ke dich danh 4 nhan nay.
const BALANCE_SHEET_HEADING_MARKERS = ['TONG CONG TAI SAN', 'NO PHAI TRA', 'VON CHU SO HUU', 'TONG CONG NGUON VON'];

// Dong chi tiet CON (vd "- Nguyen gia"/"- Gia tri hao mon luy ke (*)" duoi
// TSCD, "a)"/"b)" duoi 1 muc sinh hoc...) KHONG bao gio la dong tong nhom -
// isLikelySubtotalRow (thiet ke cho tien to CHU/SO La Ma/so A-rap) khong biet
// 2 mau tien to nay nen se nham la "tong" (dau "-"/"a)" khong phai so A-rap)
// - loai rieng truoc khi xet tiep, tranh in dam nham hang loat dong con nay
// (yeu cau user 2026-07-08, doi chieu mau IDV that).
const NON_HEADING_DETAIL_PREFIX = /^(-|[a-z]\))\s/;

export function classifyRowTier(
  statementKey: 'balanceSheet' | 'incomeStatement' | 'cashFlow',
  table: StatementTable,
  row: (string | number | null)[],
  labelIndex: number
): RowStyleTier {
  const label = String(row[labelIndex] ?? '').trim();
  if (!label) return 'plain';
  const normalized = normalizeLabelText(label);

  if (statementKey === 'balanceSheet') {
    if (NON_HEADING_DETAIL_PREFIX.test(label)) return 'plain';
    // Chi xet la "heading" (tong lon) trong so CAC DONG DA LA tong nhom -
    // tranh khop nham chuoi con (vd "9. Quy khac thuoc VON CHU SO HUU" - chi
    // la 1 dong chi tiet co chua cum tu nay, khong phai dong tong D).
    if (!isLikelySubtotalRow(table, row, labelIndex)) return 'plain';
    if (BALANCE_SHEET_HEADING_MARKERS.some((marker) => normalized.includes(marker))) return 'heading';
    return 'subheading';
  }

  if (statementKey === 'incomeStatement') {
    // DT thuan / LN gop / LN truoc thue / LN sau thue (yeu cau user
    // 2026-07-08, doi chieu mau IDV: ca 4 dong nay deu in dam trong PDF goc,
    // rieng "LN sau thue cua Cong ty me"/"...co dong khong kiem soat" (bao
    // cao Hop nhat) KHONG in dam - loai bang tu khoa "CO DONG" giong
    // lib/analysis.ts).
    if (row === findRevenueRow(table)) return 'subheading';
    if (normalized.includes('LOI NHUAN GOP')) return 'subheading';
    if (normalized.includes('TONG LOI NHUAN KE TOAN TRUOC THUE')) return 'subheading';
    if (normalized.includes('LOI NHUAN SAU THUE') && !normalized.includes('CO DONG')) return 'subheading';
    return 'plain';
  }

  return 'plain';
}
