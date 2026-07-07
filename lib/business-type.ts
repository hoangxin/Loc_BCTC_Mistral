import { normalizeLabelText } from './export/statement-shared';

// Phan loai 4 nhom doanh nghiep (yeu cau user 2026-07-07, chuan bi cho tab UI
// rieng + sau nay se co tieu chi % rieng cho tung nhom - moi nhom BCTC theo
// mau bieu PHAP LY khac nhau nen KHONG the dung chung 1 bo tieu chi):
// - Ngan hang (TCTD - to chuc tin dung): Thong tu 49/2014/TT-NHNN.
// - Chung khoan (CTCK): mau rieng (da xac nhan qua OCR that MBS 2026-07-07).
// - Bao hiem: Thong tu 232/2012/TT-BTC (phi nhan tho) va tuong tu cho nhan tho.
// - Con lai: doanh nghiep thuong, Thong tu 200/2014/TT-BTC (Mau B01-DN).
export type BusinessType = 'bank' | 'securities' | 'insurance' | 'other';

export const BUSINESS_TYPE_ORDER: BusinessType[] = ['bank', 'securities', 'insurance', 'other'];

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  bank: 'Ngân hàng',
  securities: 'Chứng khoán',
  insurance: 'Bảo hiểm',
  other: 'Doanh nghiệp khác',
};

// QUAN TRONG: KHONG the phan biet qua TIEU DE bang (vd "Bang can doi ke
// toan"/"Bao cao ket qua hoat dong kinh doanh") - da tra cuu that (2026-07-07):
// ca ngan hang (Mau B02/TCTD) lan bao hiem (Mau B01-DNPNT) DEU dung dung
// NGUYEN tieu de nay, giong het doanh nghiep thuong (Mau B01-DN) - CHI khac o
// hau to MA MAU in kem tren moi trang BCTC ("Mau ... - CTCK"/"... /TCTD"/
// "...-DNPNT"/"...-DNBH"). Day la tin hieu phap ly BAT BUOC phai co tren moi
// BCTC (khong doan qua ten cong ty/nganh - khong co san trong du lieu
// Vietstock, xem lib/vietstock-reports.ts) nen dung lam can cu chinh.
const FORM_CODE_RULES: { type: BusinessType; pattern: RegExp }[] = [
  { type: 'securities', pattern: /CTCK/ },
  { type: 'bank', pattern: /TCTD/ },
  { type: 'insurance', pattern: /DNBH|DNPNT|DNTBH/ }, // DNBH=nhan tho, DNPNT=phi nhan tho, DNTBH=tai bao hiem
];

// Dung tren markdown/text da OCR (hoac doc truc tiep tu docx/doc, khong OCR)
// cua 1 bao cao - CHI can 1 lan xuat hien ma mau la du (in lap lai tren MOI
// trang BCTC that). Mac dinh 'other' neu khong tim thay ma mau nao (bao cao
// doanh nghiep thuong, hoac truong hop hiem OCR khong doc duoc dong ma mau).
export function classifyBusinessType(text: string): BusinessType {
  const normalized = normalizeLabelText(text);
  for (const rule of FORM_CODE_RULES) {
    if (rule.pattern.test(normalized)) return rule.type;
  }
  return 'other';
}
