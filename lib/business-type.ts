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
// BAT BUOC \b (ranh gioi tu) quanh moi ma mau (2026-07-23, bug that SSM
// Q2/2026 - CTCP Che tao ket cau Thep Vneco.SSM, mot cong ty thep BINH
// THUONG, bi phan loai NHAM thanh 'bank' vi van ban co cau "Quyet dinh so
// 973/QD/SSM-TCTDHC" - "TCTD" chi la 4 ky tu NAM TINH CO ben trong ma phong
// ban "TCTDHC" (Kkong lien quan "to chuc tin dung"), khong phai ma mau phap
// ly that. Pattern truoc day khop THO bat ky vi tri xuat hien substring nao,
// khong phan biet duoc voi ma mau THAT (luon dung DOC LAP, vd "B02A/TCTD",
// xem doi chieu that TIN - cong ty tai chinh that, "TCTD" luon dung ngay sau
// dau "/" va ket thuc truoc dau cach/dau ngoac, khong bao gio dinh lien vao
// chu khac). \b dua tren \w (chu/so/gach duoi) nen "/" truoc va " "/"("  sau
// van tinh la ranh gioi day du - khong anh huong ma mau that nao.
const FORM_CODE_RULES: { type: BusinessType; pattern: RegExp }[] = [
  { type: 'securities', pattern: /\bCTCK\b/ },
  { type: 'bank', pattern: /\bTCTD\b/ },
  { type: 'insurance', pattern: /\b(DNBH|DNPNT|DNTBH)\b/ }, // DNBH=nhan tho, DNPNT=phi nhan tho, DNTBH=tai bao hiem
];

// SUA 2026-07-14 (xac nhan qua PTI - Tong CTCP Bao hiem Buu dien - that): ma
// mau (DNPNT...) BAT BUOC theo phap luat nhung KHONG PHAI luon duoc OCR doc
// duoc - da kiem chung truc tiep bang Mistral OCR tren PDF goc cua PTI (trang
// bia, muc luc, toan bo BCDKT, trang dau KQKD): KHONG co dong "Mau so..."
// xuat hien o dau ca, dan den FORM_CODE_RULES khong khop duoc gi va bao cao
// roi ve 'other' du la cong ty bao hiem that. Fallback theo NOI DUNG cac chi
// tieu DAC THU nganh bao hiem (khong bao gio xuat hien o DN thuong/ngan
// hang/CTCK) - CHI dung thuat ngu du CU THE (khong dung tu "bao hiem" chung
// chung, vi hau het DN thuong deu co dong "Chi phi bao hiem" tai san/nhan vien
// hoac "Bao hiem xa hoi/y te" - se khop nham rat rong): "tai bao hiem" (tai
// san/nghiep vu nhuong tai bao hiem, khai niem chi ton tai o cong ty bao hiem
// tu nhuong bot rui ro) va "du phong nghiep vu" (du phong ky thuat bao hiem,
// Thong tu 232/2012/TT-BTC). Da doi chieu qua 7 bao cao that dang cache
// (data/latest-fetch.json, du 4 loai hinh) - 0 khop nham.
const CONTENT_FALLBACK_RULES: { type: BusinessType; pattern: RegExp }[] = [{ type: 'insurance', pattern: /TAI BAO HIEM|DU PHONG NGHIEP VU/ }];

// Dung tren markdown/text da OCR (hoac doc truc tiep tu docx/doc, khong OCR)
// cua 1 bao cao - CHI can 1 lan xuat hien ma mau la du (in lap lai tren MOI
// trang BCTC that). Mac dinh 'other' neu khong tim thay ma mau LAN khong khop
// fallback theo noi dung nao (bao cao doanh nghiep thuong).
export function classifyBusinessType(text: string): BusinessType {
  const normalized = normalizeLabelText(text);
  for (const rule of FORM_CODE_RULES) {
    if (rule.pattern.test(normalized)) return rule.type;
  }
  for (const rule of CONTENT_FALLBACK_RULES) {
    if (rule.pattern.test(normalized)) return rule.type;
  }
  return 'other';
}
