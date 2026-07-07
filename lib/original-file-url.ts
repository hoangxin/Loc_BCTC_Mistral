// Duong link truc tiep toi file GOC tren Vietstock (KHONG qua server minh) -
// dung cho nut "Xuat PDF" (yeu cau user 2026-07-07): thay vi tai lai + OCR
// toan van roi tao PDF moi (ton token, cham), gio CHI mo thang file that
// Vietstock dang luu san, trinh duyet tu xu ly (PDF/DOCX/DOC).
//
// Neu bao cao toi tu 1 file zip/rar (co entryName, xem lib/report-source.ts),
// Vietstock host san noi dung da giai nen ngay tai duong dan "{url file zip/rar
// bo duoi .zip/.rar}/{ten entry ben trong}" - da xac nhan qua vi du that user
// cho (MBS): file goc la
// ".../QUY 2/MBS_Baocaotaichinh_Q2_2026.zip", entry can la
// "m88_20260706_vi_bctcq21783341183961hrasqjnq.pdf" (ban tieng Viet, da duoc
// lib/report-source.ts pickPrimaryReportEntries loc san) -> link dung la
// ".../QUY 2/MBS_Baocaotaichinh_Q2_2026/m88_20260706_vi_bctcq21783341183961hrasqjnq.pdf".
// Neu KHONG phai tu zip/rar (entryName null - bao cao la 1 file PDF/DOCX/DOC
// rieng le), fileUrl da la duong dan file that, dung thang khong can doi.
export function buildOriginalFileUrl(report: { fileUrl: string; entryName: string | null }): string {
  if (!report.entryName) return report.fileUrl;
  const base = report.fileUrl.replace(/\.(zip|rar)$/i, '');
  return `${base}/${report.entryName}`;
}
