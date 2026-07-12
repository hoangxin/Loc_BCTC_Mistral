import type { BusinessType } from './business-type';
import { findRevenueRow } from './export/validate-statements';
import {
  normalizeLabelText,
  valueColumnIndexes,
  findLabelColumnIndex,
  findRowByLabel,
  type FinancialStatements,
  type StatementTable,
  type UnreliableCells,
} from './export/statement-shared';

export interface AnalysisRow {
  label: string;
  percentChange: number | null;
  tier: 'level1' | 'level2' | null;
  // true khi 1 trong cac o nguon (ky nay/ky truoc) cua chi tieu nay van con
  // sai kiem tra cheo tong nhom KQKD SAU KHI DA RETRY het so lan cho phep (xem
  // extractWithGroupCheckRetry, lib/export/financial-statements.ts) - khac voi
  // percentChange === null thong thuong (khong tim thay dong/o trong that su):
  // o day CO doc duoc so nhung khong dang tin (co the do OCR gop/bia dong) -
  // percentChange bi ep ve null de tranh hien so SAI TRONG NHU DUNG, UI/export
  // can hien thi CANH BAO rieng cho truong hop nay thay vi "—" thong thuong.
  unreliable: boolean;
}

interface Thresholds {
  level1: number;
  level2: number;
}

type Row = (string | number | null)[];
type RowFinder = (table: StatementTable) => Row | null;

interface MetricDef {
  label: string;
  statement: 'balanceSheet' | 'incomeStatement' | 'offBalanceSheet';
  // 1 finder (chi tieu don), hoac 2 (gop ngan+dai han) - null neu BAT KY
  // finder nao khong tim thay dong => ca chi tieu tra ve null (khong doan
  // bua tu 1 phan du lieu).
  finders: RowFinder[];
  thresholds: Thresholds | null;
  // CHI dung cho "No Tiem An Ngoai Bang" (ngan hang): dong nao trong 5 dong
  // cong lai KHONG in (tuy tung ngan hang, KHONG bat buoc theo mau - da xac
  // nhan qua doi chieu that 2026-07-12: HDB/VCB/MBB deu KHONG co dong "Cam ket
  // cho vay khong huy ngang", trong khi mau EIB nguoi dung cung cap CO dong
  // nay nhung gia tri "-") duoc coi la 0, KHAC voi quy uoc mac dinh (thieu 1
  // dong la ca chi tieu tra ve null - dung cho moi chi tieu nhieu-finder khac,
  // vd "Tra truoc nguoi ban" NH+DH). Yeu cau rieng cua user cho dung 1 chi tieu
  // nay, KHONG doi hanh vi mac dinh cua sumFindersAtColumn cho cac chi tieu con
  // lai.
  treatMissingRowAsZero?: boolean;
}

const BCDKT_THRESHOLDS: Thresholds = { level1: 20, level2: 40 };

// Tim theo TEN CHI TIEU (khong phai ma so) - xem comment chi tiet o
// findRowByLabel (lib/export/statement-shared.ts) ve ly do KHONG con dung ma
// so lam khoa chinh: da xac nhan (2026-07-08, doi chieu that SJ1/Thong tu 200
// vs IDV/Thong tu 99) ma so BI DICH CHUYEN hang loat giua 2 thong tu (vd ma
// 230 tu "Bat dong san dau tu" (TT200) doi thanh "Tai san sinh hoc dai han"
// (TT99, chen nhom moi) - tra ma so vo dieu kien se ra SO SAI NHUNG TRONG HOP
// LE. Ten chi tieu (theo VAS) KHONG doi giua 2 thong tu, chi co SO THU TU la
// doi - dung lam khoa on dinh hon nhieu.
function byLabel(include: string[], exclude: string[] = [], preferSubtotal = false): RowFinder {
  return (table) =>
    findRowByLabel(
      table,
      (label) => include.every((m) => label.includes(m)) && !exclude.some((m) => label.includes(m)),
      { preferSubtotal }
    );
}

// CHI dung cho 2 chi tieu bao hiem "Tong CP HDKDBH"/"CP QLDN": mau KQKD bao
// hiem (B02a-DNPNT) co CUNG 1 dong (cung ten, cung ma so goc) xuat hien LAP
// LAI o "Phan I - tong hop" (gia tri AM, dang khoan tru trong cong thuc) VA
// "Phan II - chi tiet theo hoat dong" (gia tri DUONG, dang tong chi phi doc
// lap) - da xac nhan qua doi chieu that bao cao Bao hiem NN&PTNT Q1/2026
// 2026-07-10. byLabel thuong (lay dong KHOP DAU TIEN) se an nham dong Phan I
// (sai dau %), vi Phan I LUON dung TRUOC Phan II trong mau nay (thu tu co
// dinh theo Thong tu 232/2012/TT-BTC) - lay dong khop CUOI CUNG de chac chan
// ra dong Phan II (duong). KHONG dung ham nay cho cac chi tieu khac (vd "Phi
// nhuong tai BH") vi o do dong CHA luon dung TRUOC dong con "Trong do:" -
// khop dau tien moi la dong dung, khop cuoi se an nham vao dong con.
function byLabelLast(include: string[], exclude: string[] = []): RowFinder {
  return (table) => {
    const labelIndex = findLabelColumnIndex(table.columns, table.rows);
    let result: Row | null = null;
    for (const row of table.rows) {
      const label = row[labelIndex];
      if (typeof label !== 'string') continue;
      const normalized = normalizeLabelText(label);
      if (include.every((m) => normalized.includes(m)) && !exclude.some((m) => normalized.includes(m))) {
        result = row;
      }
    }
    return result;
  };
}

// Danh cho 1 khai niem duoc DIEN DAT KHAC HAN nhau giua cac cong ty chung
// khoan (khac han insurance/other, noi cung 1 Thong tu nen chi lech vai tu -
// da xac nhan qua doi chieu that SSI/MBS 2026-07-11, vd dong "Lo tu cac tai
// san tai chinh FVTPL" cua SSI ghi dung tat "FVTPL" ngay trong ten, con MBS
// lai bo han tu viet tat nay o dong cha, chi con trong dong con). Thu tung bo
// include theo THU TU, tra ve dong KHOP DAU TIEN cua BO DAU TIEN CO KHOP -
// khong tron cac bo include lai voi nhau (tranh 1 bo qua long leo vo tinh
// khop nham dong khac).
function byLabelAnyOf(variants: string[][]): RowFinder {
  return (table) => {
    for (const include of variants) {
      const row = findRowByLabel(table, (label) => include.every((m) => label.includes(m)));
      if (row) return row;
    }
    return null;
  };
}

// "- Nguyen gia" la dong CON, nhan lap lai GIONG HET nhau duoi MOI nhom TSCD
// (huu hinh/vo hinh/thue tai chinh) va BDS dau tu - khong the tim rieng bang
// ten (nhan qua chung chung). Tim dong cha "Tai san co dinh huu hinh" (nhan
// duy nhat, khong lap) truoc, roi lay DUNG dong ngay sau no (thu tu "Nguyen
// gia" luon nam sat duoi dong cha trong ca 2 thong tu - da verify SJ1 va IDV).
function findNguyenGiaTscdHuuHinh(table: StatementTable): Row | null {
  const labelIndex = findLabelColumnIndex(table.columns, table.rows);
  const parentIndex = table.rows.findIndex((row) => {
    const label = row[labelIndex];
    return typeof label === 'string' && normalizeLabelText(label).includes('TAI SAN CO DINH HUU HINH');
  });
  if (parentIndex === -1) return null;
  const childRow = table.rows[parentIndex + 1];
  if (!childRow) return null;
  const childLabel = childRow[labelIndex];
  if (typeof childLabel !== 'string' || !normalizeLabelText(childLabel).includes('NGUYEN GIA')) return null;
  return childRow;
}

// DT thuan hay bi viet tat "DT thuan", VA can fallback ma so 10 (vi tri KHONG
// doi giua TT200/TT99, da verify) cho truong hop OCR chep khac thuong - dung
// lai chinh xac logic da kiem chung cua validate-statements.ts, khong viet
// lai lan 2 (xem findRevenueRow o do).
const findDoanhThuThuan: RowFinder = (table) => findRevenueRow(table);

// 21 chi tieu tang truong nguoi dung yeu cau (2026-07-08), danh cho
// businessType === 'other' (doanh nghiep thuong, Thong tu 200/2014 hoac
// 99/2025). Cac cot BCDKT gop ca ngan+dai han khi nguoi dung yeu cau gop (vd
// "Trả trước người bán" = NH + DH) - CA 2 finder phai tim thay thi moi cong,
// thieu 1 ben la tra null (xem sumFindersAtColumn duoi).
const OTHER_METRICS: MetricDef[] = [
  {
    label: 'Tiền',
    statement: 'balanceSheet',
    finders: [byLabel(['TIEN VA CAC KHOAN TUONG DUONG TIEN']), byLabel(['DAU TU TAI CHINH NGAN HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Phải thu ngắn hạn khách hàng',
    statement: 'balanceSheet',
    finders: [byLabel(['PHAI THU NGAN HAN CUA KHACH HANG'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Trả trước người bán',
    statement: 'balanceSheet',
    finders: [byLabel(['TRA TRUOC CHO NGUOI BAN NGAN HAN']), byLabel(['TRA TRUOC CHO NGUOI BAN DAI HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Phải thu khác',
    statement: 'balanceSheet',
    finders: [byLabel(['PHAI THU NGAN HAN KHAC']), byLabel(['PHAI THU DAI HAN KHAC'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Tồn kho',
    statement: 'balanceSheet',
    finders: [byLabel(['HANG TON KHO'], [], true)],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Nguyên giá tscđ hữu hình',
    statement: 'balanceSheet',
    finders: [findNguyenGiaTscdHuuHinh],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'BĐS Đầu tư',
    statement: 'balanceSheet',
    finders: [byLabel(['BAT DONG SAN DAU TU'], [], true)],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'TS Dở dang',
    statement: 'balanceSheet',
    finders: [byLabel(['TAI SAN DO DANG DAI HAN'], [], true)],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'TS Thuế TN Hoãn lại',
    statement: 'balanceSheet',
    finders: [byLabel(['TAI SAN THUE THU NHAP HOAN LAI'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Phải trả người bán',
    statement: 'balanceSheet',
    finders: [byLabel(['PHAI TRA NGUOI BAN NGAN HAN']), byLabel(['PHAI TRA NGUOI BAN DAI HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Người mua trả trước',
    statement: 'balanceSheet',
    finders: [byLabel(['NGUOI MUA TRA TIEN TRUOC NGAN HAN']), byLabel(['NGUOI MUA TRA TIEN TRUOC DAI HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Chi phí phải trả',
    statement: 'balanceSheet',
    finders: [byLabel(['CHI PHI PHAI TRA NGAN HAN']), byLabel(['CHI PHI PHAI TRA DAI HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Phải trả khác',
    statement: 'balanceSheet',
    finders: [byLabel(['PHAI TRA NGAN HAN KHAC']), byLabel(['PHAI TRA DAI HAN KHAC'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Dự phòng phải trả',
    statement: 'balanceSheet',
    finders: [byLabel(['DU PHONG PHAI TRA NGAN HAN']), byLabel(['DU PHONG PHAI TRA DAI HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Vay',
    statement: 'balanceSheet',
    finders: [byLabel(['VAY VA NO THUE TAI CHINH NGAN HAN']), byLabel(['VAY VA NO THUE TAI CHINH DAI HAN'])],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'Vốn CSH',
    statement: 'balanceSheet',
    finders: [byLabel(['VON CHU SO HUU'], [], true)],
    thresholds: BCDKT_THRESHOLDS,
  },
  {
    label: 'DT thuần',
    statement: 'incomeStatement',
    finders: [findDoanhThuThuan],
    thresholds: { level1: 20, level2: 30 },
  },
  {
    label: 'Lãi gộp',
    statement: 'incomeStatement',
    finders: [byLabel(['LOI NHUAN GOP'])],
    thresholds: { level1: 30, level2: 40 },
  },
  {
    label: 'CPBH',
    statement: 'incomeStatement',
    finders: [byLabel(['CHI PHI BAN HANG'])],
    thresholds: null,
  },
  {
    label: 'CPQLDN',
    statement: 'incomeStatement',
    finders: [byLabel(['CHI PHI QUAN LY DOANH NGHIEP'])],
    thresholds: null,
  },
  {
    label: 'LNST',
    statement: 'incomeStatement',
    // Loai 2 dong con "...cua co dong khong kiem soat"/"...cua co dong cua
    // cong ty me" (bao cao Hop nhat) - ca 2 deu chua "LOI NHUAN SAU THUE" nhu
    // dong tong that su, phai loai rieng bang tu khoa "CO DONG".
    finders: [byLabel(['LOI NHUAN SAU THUE'], ['CO DONG'])],
    thresholds: { level1: 40, level2: 50 },
  },
];

const INSURANCE_BCDKT_THRESHOLDS: Thresholds = { level1: 20, level2: 35 };
const INSURANCE_KQKD_THRESHOLDS_A: Thresholds = { level1: 20, level2: 30 };
const INSURANCE_KQKD_THRESHOLDS_B: Thresholds = { level1: 30, level2: 40 };
const INSURANCE_KQKD_THRESHOLDS_C: Thresholds = { level1: 40, level2: 50 };

// 17 chi tieu tang truong danh cho businessType === 'insurance' (Mau
// B01-DNPNT/B02a-DNPNT, Thong tu 232/2012/TT-BTC - doanh nghiep bao hiem phi
// nhan tho), yeu cau user 2026-07-10, doi chieu nhan that qua bao cao Cong ty
// CP Bao hiem Ngan hang Nong nghiep Q1/2026 (script tam OCR, khong luu lai).
// KQKD bao hiem co "Phan I - tong hop" (Mau B02-DNPNT) VA "Phan II - chi tiet
// theo hoat dong" (Mau B02a-DNPNT) - nhieu dong LAP LAI CUNG GIA TRI o ca 2
// phan (khac ten sub-table nhung cung 1 ma so goc), rieng "Tong chi phi
// HDKDBH" va "CP QLDN" bi LAP LAI VOI DAU NGUOC NHAU (Phan I ghi am trong
// cong thuc tru, Phan II ghi duong nhu 1 dong tong doc lap) - dung
// byLabelLast() rieng cho 2 dong nay de chac chan lay dong Phan II (duong),
// xem comment tai byLabelLast.
const INSURANCE_METRICS: MetricDef[] = [
  {
    label: 'Tiền',
    statement: 'balanceSheet',
    finders: [byLabel(['TIEN VA CAC KHOAN TUONG DUONG TIEN']), byLabel(['DAU TU TAI CHINH NGAN HAN'])],
    thresholds: INSURANCE_BCDKT_THRESHOLDS,
  },
  {
    label: 'Tổng TS',
    statement: 'balanceSheet',
    finders: [byLabel(['TONG TAI SAN'])],
    thresholds: INSURANCE_BCDKT_THRESHOLDS,
  },
  {
    label: 'Dự phòng nghiệp vụ',
    statement: 'balanceSheet',
    finders: [byLabel(['DU PHONG NGHIEP VU'])],
    thresholds: INSURANCE_BCDKT_THRESHOLDS,
  },
  {
    label: 'Nợ',
    statement: 'balanceSheet',
    finders: [byLabel(['NO PHAI TRA'])],
    thresholds: INSURANCE_BCDKT_THRESHOLDS,
  },
  {
    label: 'Vốn CSH',
    statement: 'balanceSheet',
    finders: [byLabel(['VON CHU SO HUU'], [], true)],
    thresholds: INSURANCE_BCDKT_THRESHOLDS,
  },
  {
    label: 'DT Phí BH',
    statement: 'incomeStatement',
    // Loai tru "Doanh thu phi bao hiem THUAN" (dong rieng = DT Phi BH - Phi
    // nhuong tai BH) - cung chua "DOANH THU PHI BAO HIEM" nhu dong muc tieu.
    finders: [byLabel(['DOANH THU PHI BAO HIEM'], ['THUAN'])],
    thresholds: INSURANCE_KQKD_THRESHOLDS_A,
  },
  {
    label: 'Phí Nhượng Tái BH',
    statement: 'incomeStatement',
    finders: [byLabel(['PHI NHUONG TAI BAO HIEM'])],
    thresholds: null,
  },
  {
    label: 'DT Thuần HĐKDBH',
    statement: 'incomeStatement',
    finders: [byLabel(['DOANH THU THUAN HOAT DONG KINH DOANH BAO HIEM'])],
    thresholds: INSURANCE_KQKD_THRESHOLDS_A,
  },
  {
    label: 'Chi bồi thường',
    statement: 'incomeStatement',
    // Loai tru "TONG chi boi thuong bao hiem" (dong khac, da gop them thu boi
    // thuong nhuong tai + bien dong du phong - user chon dung dong "Chi boi
    // thuong" don, khong phai dong Tong).
    finders: [byLabel(['CHI BOI THUONG'], ['TONG'])],
    thresholds: INSURANCE_KQKD_THRESHOLDS_A,
  },
  {
    label: 'Dự Phòng Bồi Thường BH Gốc & Nhận TBH',
    statement: 'incomeStatement',
    // Nhan chi con "GOC VA NHAN TAI BAO HIEM" (khong ep "Tang"/"Giam" o dau vi
    // tu nay doi theo dau gia tri tung ky - vd bao cao mau doc duoc la "Giam
    // du phong...", ky khac co the la "Tang du phong...").
    finders: [byLabel(['DU PHONG BOI THUONG BAO HIEM GOC VA NHAN TAI BAO HIEM'])],
    thresholds: INSURANCE_KQKD_THRESHOLDS_A,
  },
  {
    label: 'CP Khác HĐKDBH',
    statement: 'incomeStatement',
    finders: [byLabel(['CHI PHI KHAC HOAT DONG KINH DOANH BAO HIEM'])],
    thresholds: null,
  },
  {
    label: 'Tổng CP HĐKDBH',
    statement: 'incomeStatement',
    finders: [byLabelLast(['TONG CHI PHI HOAT DONG KINH DOANH BAO HIEM'])],
    thresholds: INSURANCE_KQKD_THRESHOLDS_A,
  },
  {
    label: 'LN Gộp HĐKDBH',
    statement: 'incomeStatement',
    finders: [byLabel(['LOI NHUAN GOP HOAT DONG KINH DOANH BAO HIEM'])],
    thresholds: INSURANCE_KQKD_THRESHOLDS_B,
  },
  {
    label: 'LN Gộp Tài Chính',
    statement: 'incomeStatement',
    finders: [byLabel(['LOI NHUAN GOP HOAT DONG TAI CHINH'])],
    thresholds: INSURANCE_KQKD_THRESHOLDS_B,
  },
  {
    label: 'CP QLDN',
    statement: 'incomeStatement',
    finders: [byLabelLast(['CHI PHI QUAN LY DOANH NGHIEP'])],
    thresholds: null,
  },
  {
    label: 'LNTT',
    statement: 'incomeStatement',
    finders: [byLabel(['LOI NHUAN KE TOAN TRUOC THUE'])],
    thresholds: INSURANCE_KQKD_THRESHOLDS_C,
  },
  {
    label: 'LNST',
    statement: 'incomeStatement',
    finders: [byLabel(['LOI NHUAN SAU THUE'], ['CO DONG'])],
    thresholds: INSURANCE_KQKD_THRESHOLDS_C,
  },
];

const SECURITIES_THRESHOLDS_A: Thresholds = { level1: 20, level2: 30 };
const SECURITIES_THRESHOLDS_B: Thresholds = { level1: 40, level2: 50 };

// 30 chi tieu tang truong danh cho businessType === 'securities' (Mau
// B01-CTCK/B02-CTCK, Thong tu 210/2014/TT-BTC + sua doi 334/2016/TT-BTC),
// yeu cau user 2026-07-11, doi chieu nhan that qua 2 bao cao doc lap (script
// tam OCR, khong luu lai): SSI (hop nhat, Quy 1/2026) va MBS (kiem toan, nam
// 2025) - CO CHU DICH chon 2 cong ty khac nhau de phat hien cau chu khac
// nhau giua cac CTCK (vd SSI "TỔNG CỘNG TÀI SẢN" vs MBS "TỔNG TÀI SẢN"; SSI
// "của CTCK"/"Trung tâm Lưu ký Chứng khoán" vs MBS "của công ty chứng
// khoán"/"VSDC" - ten moi cua chinh to chuc luu ky) - CHI dua vao 1 bao cao
// se de ra finder qua khop chat, sai voi cong ty khac.
//
// Rieng "TS Ngan Han"/"Vay"/"Trai phieu phat hanh"/"No"/"TSTC Niem Yet Cua
// CTCK" va nhieu dong KQKD KHONG co nguong (theo dung yeu cau user, chi hien
// %, khong to mau tier).
//
// "Vay"/"Trai phieu phat hanh" gop ca ngan+dai han (2 finder, ca 2 phai tim
// thay moi cong - xem sumFindersAtColumn) nhung CA 2 bao cao mau deu chi co 1
// trong 2 ky han cho tung dong (SSI: Vay ngan han, KHONG co Trai phieu; MBS:
// Trai phieu dai han, KHONG co Vay dai han rieng) - dung "—" o ky han con
// thieu la HANH VI DUNG THEO QUY UOC DA CHOT (giong "Tra truoc nguoi ban"
// NH+DH cua nhom 'other'), KHONG phai bug.
const SECURITIES_METRICS: MetricDef[] = [
  {
    label: 'Tiền',
    statement: 'balanceSheet',
    finders: [byLabel(['TIEN VA CAC KHOAN TUONG DUONG TIEN'])],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'FVTPL',
    statement: 'balanceSheet',
    finders: [byLabel(['FVTPL'])],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'HTM',
    statement: 'balanceSheet',
    // Ngan han: dong DAU TIEN gioi thieu ca ten day + viet tat "(HTM)". Dai
    // han: dong lap lai o "Tai san dai han" KHONG con viet tat (quy uoc rut
    // gon khi nhac lai lan 2 - da xac nhan SSI, dong 1.1 duoi "TÀI SẢN DÀI
    // HẠN" khong co "(HTM)") - dung co/khong "HTM" de phan biet ngan/dai.
    finders: [
      byLabel(['CAC KHOAN DAU TU NAM GIU DEN NGAY DAO HAN', 'HTM']),
      byLabel(['CAC KHOAN DAU TU NAM GIU DEN NGAY DAO HAN'], ['HTM']),
    ],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'AFS',
    statement: 'balanceSheet',
    finders: [byLabel(['TAI SAN TAI CHINH SAN SANG DE BAN'])],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'Cho Vay',
    statement: 'balanceSheet',
    finders: [byLabel(['CAC KHOAN CHO VAY'])],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'TS Ngắn Hạn',
    statement: 'balanceSheet',
    finders: [byLabel(['TAI SAN NGAN HAN'])],
    thresholds: null,
  },
  {
    label: 'Tổng TS',
    statement: 'balanceSheet',
    // "TONG" va "TAI SAN" rieng (khong doi hoi lien tiep) de khop CA 2 bien
    // the: "TỔNG CỘNG TÀI SẢN" (SSI) va "TỔNG TÀI SẢN" (MBS).
    finders: [byLabel(['TONG', 'TAI SAN'])],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'Vay',
    statement: 'balanceSheet',
    finders: [byLabel(['VAY VA NO THUE', 'NGAN HAN']), byLabel(['VAY VA NO THUE', 'DAI HAN'])],
    thresholds: null,
  },
  {
    label: 'Trái phiếu phát hành',
    statement: 'balanceSheet',
    finders: [byLabel(['TRAI PHIEU PHAT HANH', 'NGAN HAN']), byLabel(['TRAI PHIEU PHAT HANH', 'DAI HAN'])],
    thresholds: null,
  },
  {
    label: 'Nợ',
    statement: 'balanceSheet',
    finders: [byLabel(['NO PHAI TRA'])],
    thresholds: null,
  },
  {
    label: 'Vốn CSH',
    statement: 'balanceSheet',
    finders: [byLabel(['VON CHU SO HUU'], [], true)],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'TSTC Niêm Yết Của CTCK',
    statement: 'offBalanceSheet',
    // Loai truong hop "...cua Nha dau tu" (dong khac, xem duoi) - dong nay la
    // tai san CUA CHINH CTCK.
    finders: [byLabel(['TAI SAN TAI CHINH', 'NIEM YET'], ['NHA DAU TU'])],
    thresholds: null,
  },
  {
    label: 'TSTC Niêm Yết Của NĐT',
    statement: 'offBalanceSheet',
    finders: [byLabel(['TAI SAN TAI CHINH', 'NIEM YET', 'NHA DAU TU'])],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'Tiền Của KH',
    statement: 'offBalanceSheet',
    finders: [byLabel(['TIEN GUI CUA KHACH HANG'])],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'Phải Trả Của NĐT Về GDCK',
    statement: 'offBalanceSheet',
    // Dong cha luon dung TRUOC 2 dong con "...trong nuoc"/"...nuoc ngoai" (y
    // het cung 1 dong nay) - khop dau tien la dung, khong can preferSubtotal.
    finders: [byLabel(['PHAI TRA', 'NHA DAU TU', 'VE TIEN GUI GIAO DICH CHUNG KHOAN'])],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'Lãi FVTPL',
    statement: 'incomeStatement',
    finders: [byLabel(['LAI TU CAC TAI SAN TAI CHINH', 'FVTPL'])],
    thresholds: null,
  },
  {
    label: 'Lỗ FVTPL',
    statement: 'incomeStatement',
    // SSI ghi "FVTPL" ngay trong ten dong; MBS bo tu viet tat nay o dong cha
    // (chi con trong dong con "a. Lo tu ban...FVTPL") - can nhieu bien the,
    // ke ca giua CHINH MBS qua 2 ky bao cao khac nhau (FY2025 "Lo cac TSTC
    // DUOC ghi nhan theo gia tri hop ly..."; Q2/2026 "Lo cac TSTC ghi nhan
    // thong qua lai/lo" - khong co "duoc"/"theo gia tri hop ly") - dung tu
    // khoa NGAN va TACH RIENG ("GHI NHAN" khong doi hoi "DUOC" di truoc) de
    // chiu duoc ca 2 bien the nay.
    finders: [
      byLabelAnyOf([['LO TU CAC TAI SAN TAI CHINH', 'FVTPL'], ['LO CAC TAI SAN TAI CHINH', 'GHI NHAN']]),
    ],
    thresholds: null,
  },
  {
    label: 'Lãi/Lỗ HTM',
    statement: 'incomeStatement',
    finders: [byLabel(['LAI TU CAC KHOAN DAU TU NAM GIU DEN NGAY DAO HAN'])],
    thresholds: null,
  },
  {
    label: 'Lãi cho vay',
    statement: 'incomeStatement',
    finders: [byLabel(['LAI TU CAC KHOAN CHO VAY VA PHAI THU'])],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'CP Lãi Vay',
    statement: 'incomeStatement',
    finders: [byLabel(['CHI PHI LAI VAY'])],
    thresholds: null,
  },
  {
    label: 'Lãi AFS',
    statement: 'incomeStatement',
    finders: [byLabel(['TAI SAN TAI CHINH SAN SANG DE BAN'])],
    thresholds: null,
  },
  {
    label: 'Lỗ AFS',
    statement: 'incomeStatement',
    // "AFS" co the nam ngay sau "tai chinh" (SSI: "...tai san tai chinh AFS
    // khi phan loai lai") hoac sau khi nhac lai ca cum "san sang de ban"
    // (MBS Q2/2026: "...tai san tai chinh SAN SANG DE BAN (AFS) khi phan
    // loai lai") - dung "KHI PHAN LOAI LAI" don le, du dac trung (khong thay
    // o dong nao khac trong bang) de chiu duoc ca 2 bien the.
    finders: [byLabel(['KHI PHAN LOAI LAI'])],
    thresholds: null,
  },
  {
    label: 'DT Môi Giới',
    statement: 'incomeStatement',
    finders: [byLabel(['DOANH THU NGHIEP VU MOI GIOI CHUNG KHOAN'])],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'CP Môi Giới',
    statement: 'incomeStatement',
    finders: [byLabel(['CHI PHI NGHIEP VU MOI GIOI CHUNG KHOAN'])],
    thresholds: null,
  },
  {
    label: 'DT Hoạt Động',
    statement: 'incomeStatement',
    finders: [byLabel(['CONG DOANH THU HOAT DONG'])],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'CP Hoạt Động',
    statement: 'incomeStatement',
    finders: [byLabel(['CONG CHI PHI HOAT DONG'])],
    thresholds: null,
  },
  {
    label: 'CP Quản lý',
    statement: 'incomeStatement',
    finders: [byLabel(['CHI PHI QUAN LY'])],
    thresholds: SECURITIES_THRESHOLDS_A,
  },
  {
    label: 'LNTT',
    statement: 'incomeStatement',
    finders: [byLabel(['TONG LOI NHUAN KE TOAN TRUOC THUE'])],
    thresholds: SECURITIES_THRESHOLDS_B,
  },
  {
    label: 'LNST',
    statement: 'incomeStatement',
    finders: [byLabel(['LOI NHUAN KE TOAN SAU THUE'])],
    thresholds: SECURITIES_THRESHOLDS_B,
  },
  {
    label: 'LNST Công Ty Mẹ',
    statement: 'incomeStatement',
    // Chi co o bao cao Hop nhat (co cong ty con) - bao cao Rieng le se tra
    // null cho ca chi tieu nay (khong co dong nay), theo dung quy uoc chung.
    finders: [byLabelAnyOf([['LOI NHUAN', 'PHAN BO', 'CHU SO HUU'], ['LOI NHUAN SAU THUE', 'CO DONG', 'CONG TY ME']])],
    thresholds: SECURITIES_THRESHOLDS_B,
  },
];

const BANK_THRESHOLDS_A: Thresholds = { level1: 10, level2: 20 };
const BANK_THRESHOLDS_B: Thresholds = { level1: 20, level2: 30 };
const BANK_THRESHOLDS_C: Thresholds = { level1: 30, level2: 40 };

// 18 chi tieu tang truong danh cho businessType === 'bank' (Mau B02a/B03a/
// TCTD-HN, Thong tu 49/2014/TT-NHNN), yeu cau user 2026-07-12, doi chieu nhan
// that qua 3 bao cao Q1/2026 (HDBank, Vietcombank, MB Bank - script tam OCR,
// khong luu lai) + 1 mau anh chup nguoi dung cung cap (EIB). BCDKT NH bi
// Mistral tach 2 bang RIENG giong VAS thuong (nua "A. Tai san" + nua "B. No
// phai tra va Von chu so huu" trang sau) - xem 2 marker rieng them vao
// BALANCE_SHEET_CONTENT_MARKERS (markdown-tables.ts) de nua B khong bi rot
// nham vao offBalanceSheet do trung chu "Tien gui cua khach hang" voi bang
// ngoai BCTC cua CTCK.
const BANK_METRICS: MetricDef[] = [
  {
    label: 'Tiền Gửi & Cho Vay TCTD Khác',
    statement: 'balanceSheet',
    // "TCTD" (viet tat) hay "to chuc tin dung" (viet day du) tuy ngan hang -
    // da xac nhan HDB/MBB dung "TCTD" nhung VCB viet day du khong viet tat,
    // can 2 bien the (giong cach xu ly "L/C"/"thu tin dung" o duoi).
    finders: [byLabelAnyOf([['TIEN GUI TAI', 'CHO VAY CAC TCTD KHAC'], ['TIEN GUI TAI', 'CHO VAY CAC TO CHUC TIN DUNG KHAC']])],
    thresholds: null,
  },
  {
    label: 'Cho Vay KH',
    statement: 'balanceSheet',
    // "Cho vay khach hang" la ten CA dong tong (VI.) LAN dong con duy nhat
    // (1.) cua no - dong tong luon dung TRUOC dong con trong tai lieu goc
    // (khop dau tien la dung, khong can preferSubtotal - xem GROUP_STT_PATTERN
    // o statement-shared.ts cho truong hop can phan biet ro hon).
    finders: [byLabel(['CHO VAY KHACH HANG'])],
    thresholds: BANK_THRESHOLDS_A,
  },
  {
    label: 'CK Đầu Tư',
    statement: 'balanceSheet',
    finders: [byLabel(['CHUNG KHOAN DAU TU'])],
    thresholds: null,
  },
  {
    label: 'Lãi, Phí Phải Thu',
    statement: 'balanceSheet',
    // Tach rieng 2 cum (khong dung nguyen ca cau co dau phay) - OCR/bao cao
    // khac nhau co the ghi dau phay khac di, 2 cum con la dac trung du de
    // khong nham dong nao khac.
    finders: [byLabel(['CAC KHOAN LAI', 'PHI PHAI THU'])],
    thresholds: null,
  },
  {
    label: 'Tổng TS',
    statement: 'balanceSheet',
    finders: [byLabel(['TONG TAI SAN'])],
    thresholds: BANK_THRESHOLDS_A,
  },
  {
    label: 'Tiền & Vay TCTD Khác',
    statement: 'balanceSheet',
    // Ben No phai tra: "Tien gui VA vay cac TCTD khac" (khac "Tien gui TAI VA
    // CHO vay..." ben Tai san o tren - PHAI phan biet ro, 2 chi tieu khac
    // nhau hoan toan). Can 2 bien the "TCTD"/"to chuc tin dung" giong chi tieu
    // tren.
    finders: [byLabelAnyOf([['TIEN GUI VA VAY CAC TCTD KHAC'], ['TIEN GUI VA VAY CAC TO CHUC TIN DUNG KHAC']])],
    thresholds: null,
  },
  {
    label: 'Tiền Gửi Của KH',
    statement: 'balanceSheet',
    finders: [byLabel(['TIEN GUI CUA KHACH HANG'])],
    thresholds: BANK_THRESHOLDS_A,
  },
  {
    label: 'Giấy Tờ Có Giá',
    statement: 'balanceSheet',
    finders: [byLabel(['PHAT HANH GIAY TO CO GIA'])],
    thresholds: null,
  },
  {
    label: 'Vốn CSH',
    statement: 'balanceSheet',
    // "Von chu so huu" xuat hien LAP LAI trong CA dong tieu de muc lon "B. No
    // phai tra VA von chu so huu" (khong co gia tri, chi la header) LAN dong
    // tong "Tong no phai tra VA von chu so huu" (gia tri SAI - gom ca no phai
    // tra) - CA 2 deu chua "NO PHAI TRA" nen loai truc tiep bang exclude, an
    // toan hon dua vao preferSubtotal (da gap that HDB/VCB 2026-07-12:
    // preferSubtotal tung chon NHAM dong tieu de "B." vi GROUP_STT_PATTERN
    // chap nhan moi chu hoa don, khong phan biet duoc "B" (header) voi "VIII"
    // (dong nhom that su) - dong tieu de LUON dung TRUOC nen bi .find() chon
    // truoc, tra ve toan gia tri null). VCB con dung ten khac han "Von va cac
    // quy" cho dong nhom, chi co dong TONG moi ghi "TONG VON CHU SO HUU" - loai
    // "NO PHAI TRA" van an toan cho ca 2 kieu bao cao.
    finders: [byLabel(['VON CHU SO HUU'], ['NO PHAI TRA'])],
    thresholds: BANK_THRESHOLDS_B,
  },
  {
    label: 'Nợ Tiềm Ẩn Ngoại Bảng',
    statement: 'offBalanceSheet',
    // 5 chi tieu trong muc "Nghia vu no tiem an" (mau B02a/TCTD-HN) - KHONG
    // gom "Cam ket giao dich hoi doai" (khac ban chat, rui ro thi truong chu
    // khong phai rui ro tin dung - yeu cau user 2026-07-12, loai khoi tong).
    // "Cam ket trong nghiep vu L/C" co 2 bien the ten: da xac nhan HDB/MBB
    // dung "L/C" nhung VCB lai dung "thu tin dung" (khong viet tat), can
    // byLabelAnyOf. treatMissingRowAsZero: mot vai dong (vd "Cam ket cho vay
    // khong huy ngang") TUY NGAN HANG co in hay khong (da xac nhan qua doi
    // chieu that: HDB/VCB/MBB deu KHONG co dong nay, mau EIB nguoi dung cung
    // cap CO nhung gia tri "-") - dong thieu duoc coi la 0 theo yeu cau user,
    // KHONG lam ca chi tieu tra ve null nhu quy uoc mac dinh.
    finders: [
      byLabel(['BAO LANH VAY VON']),
      byLabel(['CAM KET CHO VAY KHONG HUY NGANG']),
      byLabelAnyOf([['CAM KET TRONG NGHIEP VU', 'L/C'], ['CAM KET TRONG NGHIEP VU', 'THU TIN DUNG']]),
      byLabel(['BAO LANH KHAC']),
      byLabel(['CAM KET KHAC']),
    ],
    thresholds: BANK_THRESHOLDS_B,
    treatMissingRowAsZero: true,
  },
  {
    label: 'Thu Nhập Lãi Thuần',
    statement: 'incomeStatement',
    finders: [byLabel(['THU NHAP LAI THUAN'])],
    thresholds: BANK_THRESHOLDS_B,
  },
  {
    label: 'Tổng TN Hoạt Động',
    statement: 'incomeStatement',
    // Mau B03/TCTD-HN KHONG in san dong tong nay (da xac nhan qua 2 bao cao
    // that HDB/VCB Q1/2026, 2026-07-12) - phai tinh bang tong 7 dong nhom I-VII
    // (Thu nhap lai thuan + Lai thuan HD dich vu + Lai thuan HDKD ngoai hoi +
    // (Lo)/Lai CK kinh doanh + Lai/(Lo) CK dau tu + Lai thuan HD khac + Thu
    // nhap gop von mua co phan) = dung 7 finder cong lai (sumFindersAtColumn),
    // da verify khop tuyet doi voi so lieu that VCB (IX - VIII = tong 7 dong).
    finders: [
      byLabel(['THU NHAP LAI THUAN']),
      byLabel(['LAI THUAN TU HOAT DONG DICH VU']),
      byLabel(['LAI THUAN TU HOAT DONG KINH DOANH NGOAI HOI']),
      byLabel(['THUAN TU MUA BAN CHUNG KHOAN KINH DOANH']),
      byLabel(['THUAN TU MUA BAN CHUNG KHOAN DAU TU']),
      byLabel(['LAI THUAN TU HOAT DONG KHAC']),
      byLabel(['THU NHAP TU GOP VON', 'MUA CO PHAN']),
    ],
    thresholds: BANK_THRESHOLDS_B,
  },
  {
    label: 'CP Hoạt Động',
    statement: 'incomeStatement',
    // Loai 2 dong con trung tu ngu "Chi phi hoat dong dich vu"/"Chi phi hoat
    // dong khac" (deu chua "CHI PHI HOAT DONG" nhu dong nhom that su).
    finders: [byLabel(['CHI PHI HOAT DONG'], ['DICH VU', 'KHAC'])],
    thresholds: null,
  },
  {
    label: 'LN Thuần Trước Dự Phòng',
    statement: 'incomeStatement',
    finders: [byLabel(['LOI NHUAN THUAN', 'TRUOC CHI PHI DU PHONG RUI RO TIN DUNG'])],
    thresholds: BANK_THRESHOLDS_C,
  },
  {
    label: 'CP Dự Phòng',
    statement: 'incomeStatement',
    finders: [byLabel(['CHI PHI DU PHONG RUI RO TIN DUNG'])],
    thresholds: BANK_THRESHOLDS_C,
  },
  {
    label: 'LNTT',
    statement: 'incomeStatement',
    finders: [byLabel(['TONG LOI NHUAN TRUOC THUE'])],
    thresholds: BANK_THRESHOLDS_C,
  },
  {
    label: 'LNST',
    statement: 'incomeStatement',
    finders: [byLabel(['LOI NHUAN SAU THUE'], ['CO DONG'])],
    thresholds: BANK_THRESHOLDS_C,
  },
  {
    label: 'LNST Cty Mẹ',
    statement: 'incomeStatement',
    // Ten dong nay khac han giua cac ngan hang (da xac nhan HDB "Loi nhuan
    // thuan CUA CHU SO HUU" vs VCB "Loi nhuan thuan...PHAN BO cho CO DONG cua
    // Ngan hang") - can 2 bien the, giong cach lam voi SECURITIES_METRICS
    // "LNST Cong Ty Me" (xem comment byLabelAnyOf o tren).
    finders: [byLabelAnyOf([['LOI NHUAN THUAN', 'CHU SO HUU'], ['LOI NHUAN THUAN', 'PHAN BO', 'CO DONG']])],
    thresholds: BANK_THRESHOLDS_C,
  },
];

// "-" VA o trong (null) deu duoc coi la 0 (quy uoc BCTC VN: khong phat sinh)
// (doi huong 2026-07-08 - truoc do chi "-" moi la 0, o trong bi coi la
// "khong doc duoc"; nhung doi chieu markdown-tables.ts thi o trong markdown
// LUON thanh null ngay tu buoc parse, con OCR "doc sai/nham" thi hau nhu
// khong xay ra voi Mistral - nen null thuc te gan nhu luon la o trong that,
// khong phai loi doc). Cell KHONG phai so va KHONG phai "-" (vd chu rac that
// su hiem gap) van tra ve "khong tinh duoc" - chi undefined (hang bi lech
// cot cau truc) moi giu nguyen an toan tuyet doi.
function numericValue(cell: string | number | null | undefined): number | null {
  if (typeof cell === 'number') return cell;
  if (cell === '-' || cell === null) return 0;
  return null;
}

// Cong gia tri cac finder cua 1 chi tieu tai 1 cot gia tri cu the - null neu
// BAT KY finder nao khong tim thay dong hoac gia tri khong doc duoc (an toan
// hon la cong nhung gi tim duoc - tranh % tinh tu 1 phan du lieu ma trong nhu
// day du). unreliableCells: key "rowIndex:columnIndex" cua BANG KQKD van con
// sai kiem tra cheo tong nhom sau khi da retry (xem AnalysisRow.unreliable) -
// tra ve co unreliable=true rieng, KHONG tron vao "khong tim thay" (value=null
// thong thuong), de phia goi bao canh bao dung loai.
function sumFindersAtColumn(
  table: StatementTable,
  finders: RowFinder[],
  columnIndex: number,
  unreliableCells: Set<string>,
  treatMissingRowAsZero = false
): { value: number | null; unreliable: boolean } {
  let sum = 0;
  let unreliable = false;
  for (const find of finders) {
    const row = find(table);
    if (!row) {
      // chi tieu khong ton tai trong bang nay (vd khac bieu mau) - mac dinh
      // khong tinh duoc (an toan hon la doan bua). treatMissingRowAsZero: rieng
      // "No Tiem An Ngoai Bang" (xem comment MetricDef.treatMissingRowAsZero)
      // - coi dong thieu la 0, tiep tuc cong cac finder con lai thay vi bo cuoc.
      if (treatMissingRowAsZero) continue;
      return { value: null, unreliable };
    }
    if (unreliableCells.size > 0) {
      const rowIndex = table.rows.indexOf(row);
      if (unreliableCells.has(`${rowIndex}:${columnIndex}`)) unreliable = true;
    }
    const value = numericValue(row[columnIndex]);
    if (value === null) return { value: null, unreliable };
    sum += value;
  }
  return { value: sum, unreliable };
}

// BCDKT: cot gia tri dau tien LUON la ky nay (cuoi ky), cot thu hai LUON la
// dau ky/dau nam - da verify qua du lieu OCR that (SJ1 va IDV), khong can do
// text.
function balanceSheetPeriodColumns(table: StatementTable): { currentIndex: number; priorIndex: number } | null {
  const [currentIndex, priorIndex] = valueColumnIndexes(table);
  if (currentIndex === undefined || priorIndex === undefined) return null;
  return { currentIndex, priorIndex };
}

// KQKD: KHONG the dung vi tri co dinh - bao cao Quy co toi 4 cot gia tri
// (Quy nay nam nay/nam truoc + Luy ke nam nay/nam truoc, da verify qua du
// lieu OCR that SJ1 va IDV). Nhan dien qua TEXT tieu de cot: "ky nay" = chua
// "NAM NAY" va KHONG chua "LUY KE" (loai 2 cot luy ke); "cung ky" tuong tu voi
// "NAM TRUOC". Fallback ve vi tri (giong BCDKT) neu khong khop pattern nao ca
// (vd bao cao dung tu ngu khac thuong).
function incomeStatementPeriodColumns(table: StatementTable): { currentIndex: number; priorIndex: number } | null {
  const valueIndexes = valueColumnIndexes(table);
  const currentIndex = valueIndexes.find((i) => {
    const normalized = normalizeLabelText(table.columns[i] ?? '');
    return normalized.includes('NAM NAY') && !normalized.includes('LUY KE');
  });
  const priorIndex = valueIndexes.find((i) => {
    const normalized = normalizeLabelText(table.columns[i] ?? '');
    return normalized.includes('NAM TRUOC') && !normalized.includes('LUY KE');
  });
  if (currentIndex !== undefined && priorIndex !== undefined) return { currentIndex, priorIndex };

  const [fallbackCurrent, fallbackPrior] = valueIndexes;
  if (fallbackCurrent === undefined || fallbackPrior === undefined) return null;
  return { currentIndex: fallbackCurrent, priorIndex: fallbackPrior };
}

function computePercentChange(current: number | null, prior: number | null): number | null {
  if (current === null || prior === null) return null;
  if (prior === 0) return null; // khong tinh % tang truong tu goc 0 (vo cuc/khong xac dinh)
  return ((current - prior) / Math.abs(prior)) * 100;
}

function tierFor(percentChange: number | null, thresholds: Thresholds | null): 'level1' | 'level2' | null {
  if (percentChange === null || thresholds === null) return null;
  if (percentChange >= thresholds.level2) return 'level2';
  if (percentChange >= thresholds.level1) return 'level1';
  return null;
}

const NO_UNRELIABLE_CELLS: Set<string> = new Set();
const NO_UNRELIABLE_CELLS_BY_TABLE: UnreliableCells = { balanceSheet: NO_UNRELIABLE_CELLS, incomeStatement: NO_UNRELIABLE_CELLS };

// offBalanceSheet (rieng CTCK) co CUNG hinh dang cot voi balanceSheet (Ma so/
// Chi tieu/Thuyet minh/2 cot gia tri "cuoi ky"/"dau nam") nen dung lai chinh
// ham balanceSheetPeriodColumns(), khong can viet rieng.
//
// unreliableCells (tu ExtractFinancialStatementsResult) chi co gia tri thuc
// su cho balanceSheet/incomeStatement (2026-07-12, mo rong tu ban dau CHI co
// incomeStatement - xem findAllGroupSumMismatches, lib/export/validate-statements.ts)
// - offBalanceSheet LUON dung Set RONG (chua co kiem tra cheo rieng cho bang
// nay) de tranh rowIndex trung ngau nhien giua cac bang khac nhau bi hieu nham.
function buildAnalysisRows(statements: FinancialStatements, metrics: MetricDef[], unreliableCells: UnreliableCells): AnalysisRow[] {
  const balanceSheetPeriods = balanceSheetPeriodColumns(statements.balanceSheet);
  const incomeStatementPeriods = incomeStatementPeriodColumns(statements.incomeStatement);
  const offBalanceSheetPeriods = balanceSheetPeriodColumns(statements.offBalanceSheet);

  return metrics.map((metric) => {
    const table =
      metric.statement === 'balanceSheet'
        ? statements.balanceSheet
        : metric.statement === 'offBalanceSheet'
          ? statements.offBalanceSheet
          : statements.incomeStatement;
    const periods =
      metric.statement === 'balanceSheet'
        ? balanceSheetPeriods
        : metric.statement === 'offBalanceSheet'
          ? offBalanceSheetPeriods
          : incomeStatementPeriods;

    if (periods === null) {
      return { label: metric.label, percentChange: null, tier: null, unreliable: false };
    }

    const unreliableCellsForTable =
      metric.statement === 'balanceSheet'
        ? unreliableCells.balanceSheet
        : metric.statement === 'incomeStatement'
          ? unreliableCells.incomeStatement
          : NO_UNRELIABLE_CELLS;
    const current = sumFindersAtColumn(table, metric.finders, periods.currentIndex, unreliableCellsForTable, metric.treatMissingRowAsZero);
    const prior = sumFindersAtColumn(table, metric.finders, periods.priorIndex, unreliableCellsForTable, metric.treatMissingRowAsZero);
    const unreliable = current.unreliable || prior.unreliable;
    const percentChange = unreliable ? null : computePercentChange(current.value, prior.value);
    return { label: metric.label, percentChange, tier: tierFor(percentChange, metric.thresholds), unreliable };
  });
}

// Dispatch theo businessType: 'other' dung 21 chi tieu (yeu cau user
// 2026-07-08), 'insurance' dung 17 chi tieu rieng (yeu cau user 2026-07-10,
// mau B01/B02a-DNPNT), 'securities' dung 30 chi tieu rieng (yeu cau user
// 2026-07-11, mau B01-CTCK/B02-CTCK), 'bank' dung 18 chi tieu rieng (yeu cau
// user 2026-07-12, mau B02a/B03a-TCTD-HN).
export function computeAnalysisRows(
  statements: FinancialStatements,
  businessType: BusinessType,
  unreliableCells: UnreliableCells = NO_UNRELIABLE_CELLS_BY_TABLE
): AnalysisRow[] {
  if (businessType === 'insurance') {
    return buildAnalysisRows(statements, INSURANCE_METRICS, unreliableCells);
  }
  if (businessType === 'securities') {
    return buildAnalysisRows(statements, SECURITIES_METRICS, unreliableCells);
  }
  if (businessType === 'bank') {
    return buildAnalysisRows(statements, BANK_METRICS, unreliableCells);
  }
  return buildAnalysisRows(statements, OTHER_METRICS, unreliableCells);
}
