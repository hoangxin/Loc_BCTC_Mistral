// Cach HIEN THI 1 o "% thay doi" - dung chung cho CA 4 dau ra (bang UI tab
// Ket qua, Excel tong hop, PDF tong hop, cot "% thay doi" trong Excel tung
// bao cao) de 4 cho khong bao gio dien giai cung 1 du lieu theo 2 kieu khac
// nhau.
//
// LY DO RA DOI (phan hoi nguoi dung 2026-11-09, xac nhan qua FCN Q3/2026):
// chi tieu "BDS Dau tu" cua FCN tang tu 0 len 864,4 ty nhung o bang chi hien
// "—" - dung ve mat toan hoc (computePercentChange tra null khi ky truoc = 0
// vi % tang truong tu 0 la vo cuc/khong xac dinh, xem lib/analysis.ts) nhung
// SAI ve mat truyen dat: "—" trong bang nay von la ky hieu "khong co du lieu/
// khong doc duoc", nen nguoi doc de hieu thanh "chi tieu nay bang 0" va BO
// SOT dung nhung lan 1 khoan muc MOI XUAT HIEN - thuong la bien dong dang
// chu y nhat cua ky do (vd FCN ghi nhan 864 ty BDS dau tu tu con so khong).
//
// CACH XU LY: khong bia ra 1 con so % (vo cuc), cung khong de trong - hien
// NHAN RIENG "Mới" kem GIA TRI TUYET DOI dang gon (vd "Mới +864,4 tỷ"), kem
// mau nen rieng (xem .pct-new o app/globals.css) de phan biet ngay voi ca "—"
// (khong co du lieu) va o vang highlight (% tang truong that). Tooltip/ghi
// chu giu nguyen so tho day du.
//
// LUU Y ve truong hop CA 2 KY DEU = 0: VAN giu "—" nhu truoc, KHONG doi
// thanh "0". Theo quy uoc cua du an, o trong/"-"/dong khong in deu duoc coi
// la 0 (xem numericValue + sumFindersAtColumn trong lib/analysis.ts), nen
// "ca 2 ky = 0" KHONG phan biet duoc voi "khong tim thay dong nao trong bang
// da parse" - hien "0" se la 1 khang dinh manh hon du lieu that su co, dung
// dung loai nham lan ma thay doi nay muon xoa bo.
import type { AnalysisRow } from './analysis';

export type PercentCellKind =
  // Co % that su - hien con so.
  | 'percent'
  // Ky truoc = 0, ky nay != 0: khoan muc MOI XUAT HIEN (hoac bien mat hoan
  // toan neu so am) - khong tinh duoc %, hien nhan "Mới" + gia tri.
  | 'newFromZero'
  // Ca 2 ky deu 0 - hien "—" (xem LUU Y o dau file).
  | 'bothZero'
  // Kiem tra cheo tong nhom KQKD van sai sau khi retry OCR (xem
  // AnalysisRow.unreliable) - hien canh bao "Cần xem tay".
  | 'unreliable'
  // Khong doc duoc dong/bang (gia tri null) - hien "—".
  | 'missing';

export function percentCellKind(item: AnalysisRow | null | undefined): PercentCellKind {
  if (!item) return 'missing';
  if (item.unreliable) return 'unreliable';
  if (item.percentChange !== null) return 'percent';
  // Tu day tro xuong: percentChange === null. Chi co 2 nguyen nhan (xem
  // computePercentChange): thieu so lieu, hoac ky truoc = 0.
  if (item.currentValue === null || item.priorValue === null) return 'missing';
  if (item.priorValue !== 0) return 'missing'; // khong xay ra voi code hien tai - phong ve
  return item.currentValue === 0 ? 'bothZero' : 'newFromZero';
}

// "864413146589" -> "864,4 tỷ"; "77050000" -> "77,1 tr"; nho hon 1 trieu thi
// in nguyen so (dinh dang Viet, dau . ngan cach hang nghin). Luon kem dau +/-
// de doc duoc ngay chieu bien dong ma khong can nhin so goc.
export function formatCompactSignedAmount(value: number): string {
  const sign = value < 0 ? '-' : '+';
  const abs = Math.abs(value);
  const vi = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  if (abs >= 1_000_000_000) return `${sign}${vi(abs / 1_000_000_000)} tỷ`;
  if (abs >= 1_000_000) return `${sign}${vi(abs / 1_000_000)} tr`;
  return `${sign}${vi(abs)}`;
}

export function formatPercentValue(value: number | null | undefined): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

// Chu hien trong o. 'compact' (mac dinh) cho bang UI/PDF - 2 dong ngan; dung
// cung 1 chu cho moi dau ra de nguoi dung thay y het nhau o moi noi.
export function formatPercentCell(item: AnalysisRow | null | undefined): string {
  const kind = percentCellKind(item);
  if (kind === 'unreliable') return 'Cần xem tay';
  if (kind === 'newFromZero') return `${NEW_FROM_ZERO_LABEL} ${formatCompactSignedAmount(item!.currentValue!)}`;
  if (kind === 'percent') return formatPercentValue(item!.percentChange);
  return '—';
}

// Tooltip/ghi chu Excel: luon dua so THO cua ca 2 ky (khong lam tron) de doi
// chieu nhanh voi PDF goc. Rieng o "Mới" giai thich luon vi sao khong co %.
export function percentCellTooltip(item: AnalysisRow | null | undefined): string | undefined {
  const kind = percentCellKind(item);
  if (kind === 'unreliable') {
    return 'OCR có thể đã gộp/bịa dòng dữ liệu, đã thử đọc lại nhưng vẫn sai - cần xem tay trên PDF gốc';
  }
  if (item == null || item.currentValue == null || item.priorValue == null) return undefined;
  const pair = `${item.currentValue.toLocaleString('vi-VN')} / ${item.priorValue.toLocaleString('vi-VN')}`;
  if (kind === 'newFromZero') {
    return `Kỳ này/kỳ trước: ${pair} - kỳ trước bằng 0 nên không tính được % tăng trưởng (không phải thiếu dữ liệu)`;
  }
  if (kind === 'bothZero') return `Kỳ này/kỳ trước: ${pair} - cả 2 kỳ đều bằng 0 nên không có % thay đổi`;
  return pair;
}

// Khoa sap xep cot % (xem sortReports trong app/ReportsSummaryTable.tsx):
// o "Mới" la tang truong VO CUC nen phai dung dau bang khi sap giam dan (truoc
// day bi dong nhat voi "khong co du lieu" va luon bi day xuong cuoi, dung
// nhung o dang can nhin nhat). Tra null = khong co gia tri (luon xuong cuoi).
export function percentSortValue(item: AnalysisRow | null | undefined): number | null {
  const kind = percentCellKind(item);
  if (kind === 'percent') return item!.percentChange;
  if (kind === 'newFromZero') return item!.currentValue! > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  return null;
}

// So sanh 2 khoa sap xep - KHONG dung phep tru (Infinity - Infinity = NaN se
// lam comparator khong nhat quan, Array.sort co the tra ve thu tu lung tung).
export function comparePercentSortValues(a: number, b: number): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// Nhan "Mới" dung chung - cot "% thay doi" trong Excel tung bao cao
// (lib/export/excel.ts) cung dung nhan nay, nhung tinh TRUC TIEP tu 2 o so
// lieu cua 1 dong bang (khong qua AnalysisRow) nen khong goi
// formatPercentCell duoc; de o day de 2 cho khong lech chu.
export const NEW_FROM_ZERO_LABEL = 'Mới';
