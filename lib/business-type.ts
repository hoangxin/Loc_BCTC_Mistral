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
//
// SUA 2026-10-23 (bug that DP1 Q2+Q3/2026 - CTCP Duoc pham Trung uong CPC1,
// mot cong ty DUOC PHAM, bi phan loai nham thanh 'bank' nen toan bo du lieu
// hien ra TRONG o tab Ngan hang): \b van CHUA du. Trong thuyet minh cua DP1
// co cau "...theo Quyet dinh so 045/QD-TCTD cua Chu tich Hoi dong quan tri
// Tong Cong ty Duoc Viet Nam" - "TCTD" o day la vi tri viet tat trong SO HIEU
// VAN BAN cua Tong cong ty Duoc, dung DOC LAP (co "-" truoc, " " sau) nen
// \bTCTD\b khop hoan toan, khong phan biet duoc voi ma mau that.
//
// Doi sang tin hieu CAU TRUC thay vi vi tri xuat hien (xem
// feedback_prefer_structural_over_wording_fixes): ma mau phap ly that LUON
// di kem SO HIEU BIEU MAU ngay truoc no - "B" + so (+ hau to chu cai) +
// dau phan cach, vd "B02A/TCTD", "B04A/TCTD-HN", "B01A-CTCK", "B01- CTCK",
// "Mau so B 02A-DNPNT", "Mau so B03(b)a - CTCK" (HCM dung gach ngang dai
// "–" chu khong phai "-"). So hieu bieu mau nay la phan KHONG THE thieu cua
// ma mau (khong co bieu mau nao ten chi la "TCTD"), trong khi so hieu van ban
// hanh chinh kieu DP1 khong bao gio co dang do.
//
// Da doi chieu tren TOAN BO 1.506 file data/ocr-markdown: luat moi giu nguyen
// ket qua cho 67 CTCK + 33 ngan hang + 17 bao hiem + 1.387 DN thuong, CHI doi
// dung 2 file DP1 (bank -> other) - 0 regression (xem
// scripts/_debug-classify-compare-2026-10-23.ts).
const FORM_CODE_MARKERS: Record<string, BusinessType> = {
  CTCK: 'securities',
  TCTD: 'bank',
  DNBH: 'insurance', // nhan tho
  DNPNT: 'insurance', // phi nhan tho
  DNTBH: 'insurance', // tai bao hiem
};
const FORM_CODE_PATTERN = /\bB\s?\d{1,2}\s?(?:\([A-Z]\))?\s?[A-Z]?\s*[-–—/]\s*(CTCK|TCTD|DNBH|DNPNT|DNTBH)\b/g;
const BUSINESS_TYPE_PRIORITY: BusinessType[] = ['securities', 'bank', 'insurance'];

// Luat CU (giu lai theo yeu cau "khong xoa han code da thay the"): khop ma
// mau o BAT KY vi tri nao - chinh la cho sinh ra ca bug SSM 2026-07-23 lan
// bug DP1 2026-10-23.
// const FORM_CODE_RULES: { type: BusinessType; pattern: RegExp }[] = [
//   { type: 'securities', pattern: /\bCTCK\b/ },
//   { type: 'bank', pattern: /\bTCTD\b/ },
//   { type: 'insurance', pattern: /\b(DNBH|DNPNT|DNTBH)\b/ },
// ];

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
//
// MO RONG 2026-10-23 (cung dot sua DP1): them fallback noi dung cho CTCK va
// ngan hang - truoc day khong can vi luat ma mau cu khop rat rong, sau khi
// siet lai (phai co so hieu bieu mau "B0x") thi can luoi an toan cho cac bao
// cao OCR nuot mat ma mau. Do THAT tren 1.506 markdown: fallback nay mot
// minh bat dung 14 CTCK + 7 bao hiem + 2 ngan hang ma tang ma mau khong bat
// duoc, va KHONG khop nham bao cao nao trong 1.389 DN thuong.
//
// Chi dung cac chi tieu CHI co trong bang bieu nganh:
// - CTCK: "theo phuong thuc CTCK quan ly" / "dich vu CTCK cung cap" / "tai
//   san cua CTCK" (deu la ten chi tieu trong Mau B01a-CTCK, khong the xuat
//   hien o DN thuong).
// - Ngan hang: "TCTD" dung lam DOI TUONG cua nghiep vu tien gui/vay/cho vay/
//   cap tin dung ("Tien gui va vay cac TCTD khac", "Cho vay cac TCTD khac",
//   "Tien, vang gui tai cac TCTD khac") - khac han "TCTD" trong so hieu van
//   ban hanh chinh kieu DP1 ("045/QD-TCTD cua Chu tich...").
const CONTENT_FALLBACK_RULES: { type: BusinessType; pattern: RegExp }[] = [
  { type: 'insurance', pattern: /TAI BAO HIEM|DU PHONG NGHIEP VU/ },
  { type: 'securities', pattern: /PHUONG THUC CTCK QUAN LY|DICH VU CTCK CUNG CAP|TAI SAN CUA CTCK/ },
  { type: 'bank', pattern: /(TIEN GUI|TIEN, VANG GUI|VAY|CHO VAY|CAP TIN DUNG)[^|\n]{0,45}\bTCTD\b|\bTCTD\b[^|\n]{0,20}KHAC/ },
];

// Dung tren markdown/text da OCR (hoac doc truc tiep tu docx/doc, khong OCR)
// cua 1 bao cao - CHI can 1 lan xuat hien ma mau la du (in lap lai tren MOI
// trang BCTC that). Mac dinh 'other' neu khong tim thay ma mau LAN khong khop
// fallback theo noi dung nao (bao cao doanh nghiep thuong).
export function classifyBusinessType(text: string): BusinessType {
  const normalized = normalizeLabelText(text);
  // Giu nguyen thu tu uu tien cu (CTCK -> ngan hang -> bao hiem) cho truong
  // hop hiem gap nhieu loai ma mau trong cung 1 van ban.
  const byFormCode = new Set<BusinessType>();
  for (const match of normalized.matchAll(FORM_CODE_PATTERN)) {
    byFormCode.add(FORM_CODE_MARKERS[match[1]]);
  }
  for (const type of BUSINESS_TYPE_PRIORITY) {
    if (byFormCode.has(type)) return type;
  }
  for (const rule of CONTENT_FALLBACK_RULES) {
    if (rule.pattern.test(normalized)) return rule.type;
  }
  return 'other';
}
