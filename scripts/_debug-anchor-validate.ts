// UNG VIEN NEO lay tu MAU BIEU CHUAN Thong tu (khong suy tu sample):
//  - other: TT200/2014 + TT99/2025 (B01/B02/B03-DN)
//  - bank:  TT49/2014/TT-NHNN + TT200 (B02/B03/B04-TCTD)
//  - CTCK:  TT210/2014 + TT334/2016 (B01/B02/B03-CTCK + chi tieu ngoai BCTHTC)
//  - insurance: TT232/2012/TT-BTC (B01/B02/B03-DNPNT)
// Moi ung vien duoc CHAY MIRROR-CHECK tren corpus that: neu no (hoac ca token
// token-AND) xuat hien o 1 bang ANH EM cua bat ky bao cao nao -> REJECT (soi
// guong, khong the lam neo - bai hoc MIG "phi nhuong tai bao hiem").
import { execSync } from 'child_process';
import { normalizeLabelText } from '../lib/export/statement-shared';

type Marker = string | string[];
// TOKEN-AND: chi giu TU KHOA PHAN BIET COT LOI (cho phep chen tu giua/qualifier
// "ngan han"/"dai han"/"ve ban hang..."), KHONG khop ca cum cung tung chu (de
// hut khi cong ty viet lech - nguon goc chuoi loi m/ay hom). Van phai du DOC
// QUYEN: mirror-check duoi day loc cai nao soi guong bang anh em.
const CANDIDATES: Record<'balanceSheet'|'incomeStatement'|'cashFlow'|'offBalanceSheet', Marker[]> = {
  // ---- BANG CAN DOI KE TOAN / BAO CAO TINH HINH TAI CHINH ----
  balanceSheet: [
    ['TONG CONG TAI SAN'],            // ma 270 (giu "cong" de khac bank "tong tai san")
    ['TONG CONG NGUON VON'],          // ma 440
    ['TONG TAI SAN'],                 // bank
    ['TONG NO PHAI TRA', 'VON CHU SO HUU'], // bank
    ['TAI SAN NGAN HAN'],             // ma 100
    ['TAI SAN CO DINH HUU HINH'],     // ma 221 (cum on dinh, it bien the)
    ['TAI SAN CO DINH VO HINH'],      // ma 227
    ['PHAI THU', 'CUA KHACH HANG'],   // ma 131: hut "Phai thu [ngan han] cua khach hang"
    ['NGUOI MUA TRA TIEN TRUOC'],     // ma 132/312
    ['PHAI TRA NGUOI BAN'],           // ma 311/331
    ['VAY VA NO THUE TAI CHINH'],     // ma 320/338
    ['QUY KHEN THUONG', 'PHUC LOI'],  // ma 353: "Quy khen thuong[,] phuc loi"
    ['LOI NHUAN SAU THUE CHUA PHAN PHOI'], // ma 421
    ['THANG DU VON CO PHAN'],         // ma 412
    ['PHAI TRA HOAT DONG GIAO DICH CHUNG KHOAN'], // CTCK
    ['TIEN NOP', 'QUY HO TRO THANH TOAN'],        // CTCK
    ['TAI SAN TAI BAO HIEM'],         // insurance
  ],
  // ---- KET QUA HOAT DONG KINH DOANH ----
  incomeStatement: [
    ['DOANH THU THUAN'],              // ma 10: "Doanh thu thuan [ve ban hang.../ HDKD BH]"
    ['GIA VON'],                      // ma 11: "Gia von [hang ban]"
    ['LOI NHUAN GOP'],                // ma 20
    ['GIAM TRU DOANH THU'],           // ma 02: "Cac khoan giam tru doanh thu"
    ['CHI PHI BAN HANG'],             // ma 25
    ['CHI PHI QUAN LY'],              // ma 26: hut "...doanh nghiep"/"...cong ty chung khoan"
    ['LOI NHUAN THUAN', 'HOAT DONG KINH DOANH'], // ma 30
    ['TONG LOI NHUAN', 'TRUOC THUE'], // ma 50: hut "...ke toan truoc thue"/"...truoc thue"
    'LOI NHUAN SAU THUE THU NHAP DOANH NGHIEP', // ma 60: cum LIEN (token-AND bi phan tan: BS co "LNST chua phan phoi" + "thue TNDN hoan lai" o 2 dong)
    ['CHI PHI THUE', 'TNDN', 'HIEN HANH'], // ma 51
    ['CHI PHI THUE', 'TNDN', 'HOAN LAI'],  // ma 52
    ['LAI CO BAN TREN CO PHIEU'],     // ma 70
    ['DOANH THU PHI BAO HIEM'],       // insurance
    ['CHI BOI THUONG'],               // insurance (khac "du phong boi thuong" BS)
    ['DOANH THU THUAN', 'KINH DOANH BAO HIEM'], // insurance (trung ['DOANH THU THUAN'] o tren, vo hai)
    ['LOI NHUAN GOP', 'KINH DOANH BAO HIEM'],   // insurance
    ['NGHIEP VU MOI GIOI CHUNG KHOAN'], // CTCK (ca doanh thu lan chi phi)
    ['CONG DOANH THU HOAT DONG'],     // CTCK
    ['CONG CHI PHI HOAT DONG'],       // CTCK
    ['THU NHAP LAI THUAN'],           // bank
    ['LAI THUAN', 'HOAT DONG DICH VU'], // bank
    ['DU PHONG RUI RO TIN DUNG'],     // bank
  ],
  // ---- LUU CHUYEN TIEN TE ----
  cashFlow: [
    ['LUU CHUYEN TIEN', 'HOAT DONG KINH DOANH'],
    ['LUU CHUYEN TIEN', 'HOAT DONG DAU TU'],
    ['LUU CHUYEN TIEN', 'HOAT DONG TAI CHINH'],
    ['LUU CHUYEN TIEN THUAN TRONG KY'],
    ['TIEN CHI TRA', 'LAI VAY'],
    ['TIEN CHI NOP THUE', 'THU NHAP DOANH NGHIEP'],
    ['TIEN THU', 'BAN HANG', 'CUNG CAP DICH VU'],
    'TIEN THU TU PHAT HANH CO PHIEU', // cum LIEN (token-AND phan tan o BCDKT NH)
  ],
  // ---- CHI TIEU NGOAI BCTHTC (CTCK) / NGOAI BANG (bank) ----
  offBalanceSheet: [
    ['BAO LANH VAY VON'],
  ],
};

// ------- corpus de mirror-check -------
const COMMITS = ['22d82d3','16ac172d','4a629c2','b7ec9d5','e892664','df854f9','48c5e9f','47b3041','1d4cc89','HEAD'];
const KEYS = ['balanceSheet','incomeStatement','cashFlow','offBalanceSheet'] as const;
const byKey = new Map<string, any>();
for (const c of COMMITS) { let raw:string; try{raw=execSync(`git show ${c}:data/latest-fetch.json`,{encoding:'utf-8',maxBuffer:64*1024*1024});}catch{continue;} for(const r of JSON.parse(raw).reports??[]){const k=`${r.stockCode}|${r.periodYear}|${r.periodSlug}`;if(!byKey.has(k))byKey.set(k,r);} }
const labelIdx = (t:any)=>{const i=(t.columns??[]).findIndex((c:string)=>/chỉ tiêu|tài sản|nguồn vốn/i.test(c||''));return i===-1?0:i;};
const recs: {biz:string;code:string;stmt:string;text:string}[] = [];
for (const r of byKey.values()) for (const stmt of KEYS){ const t=r.statements?.[stmt]; if(!t?.rows?.length)continue; const L=labelIdx(t); recs.push({biz:r.businessType??'?',code:r.stockCode,stmt,text:t.rows.map((row:any[])=>normalizeLabelText(String(row[L]??''))).join(' | ')}); }

const matches = (text:string, m:Marker) => typeof m==='string' ? text.includes(m) : m.every(x=>text.includes(x));

for (const stmt of KEYS) {
  console.log(`\n===== ${stmt} =====`);
  for (const m of CANDIDATES[stmt]) {
    const mirror = recs.filter(r=>r.stmt!==stmt && matches(r.text,m));
    const own = recs.filter(r=>r.stmt===stmt && matches(r.text,m));
    const ownBiz = [...new Set(own.map(r=>r.biz))].sort();
    const label = Array.isArray(m)?`[${m.join(' & ')}]`:m;
    if (mirror.length) {
      console.log(`  REJECT  ${label.padEnd(52)} <- soi guong: ${[...new Set(mirror.map(r=>r.code+':'+r.stmt))].slice(0,4).join(', ')}`);
    } else {
      console.log(`  ok  ${String(own.length).padStart(2)}x [${ownBiz.join(',')||'-'}]  ${label}`);
    }
  }
}
