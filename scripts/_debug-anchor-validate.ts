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
const CANDIDATES: Record<'balanceSheet'|'incomeStatement'|'cashFlow'|'offBalanceSheet', Marker[]> = {
  // ---- BANG CAN DOI KE TOAN / BAO CAO TINH HINH TAI CHINH ----
  balanceSheet: [
    'TONG CONG TAI SAN',              // ma 270 (other/CTCK/insurance)
    'TONG CONG NGUON VON',            // ma 440
    ['TONG TAI SAN'],                 // bank (TT49 dung "Tong tai san")
    'TONG NO PHAI TRA VA VON CHU SO HUU', // bank
    'TAI SAN NGAN HAN',               // ma 100
    'TAI SAN DAI HAN',                // ma 200
    'TAI SAN CO DINH HUU HINH',       // ma 221
    'TAI SAN CO DINH VO HINH',        // ma 227
    'PHAI THU NGAN HAN CUA KHACH HANG', // ma 131
    'NGUOI MUA TRA TIEN TRUOC',       // ma 132/312
    'PHAI TRA NGUOI BAN',             // ma 311 (dung ten goc, mirror-check se loc neu can)
    'VAY VA NO THUE TAI CHINH',       // ma 320/338
    'CHI PHI PHAI TRA',               // ma 335
    'QUY KHEN THUONG PHUC LOI',       // ma 353
    'LOI NHUAN SAU THUE CHUA PHAN PHOI', // ma 421
    'VON GOP CUA CHU SO HUU',         // ma 411
    'THANG DU VON CO PHAN',           // ma 412
    // CTCK
    'PHAI TRA HOAT DONG GIAO DICH CHUNG KHOAN',
    'TIEN NOP QUY HO TRO THANH TOAN',
    // Insurance (TT232)
    'TAI SAN TAI BAO HIEM',
    'DU PHONG NGHIEP VU',
  ],
  // ---- KET QUA HOAT DONG KINH DOANH ----
  incomeStatement: [
    'DOANH THU THUAN VE BAN HANG',    // ma 10 (nguoi dung: "doanh thu thuan")
    'GIA VON HANG BAN',               // ma 11 (nguoi dung: "gia von")
    'LOI NHUAN GOP',                  // ma 20
    'CAC KHOAN GIAM TRU DOANH THU',   // ma 02
    'CHI PHI BAN HANG',               // ma 25
    'CHI PHI QUAN LY DOANH NGHIEP',   // ma 26
    'LOI NHUAN THUAN TU HOAT DONG KINH DOANH', // ma 30
    'TONG LOI NHUAN KE TOAN TRUOC THUE', // ma 50
    'LOI NHUAN SAU THUE THU NHAP DOANH NGHIEP', // ma 60
    'CHI PHI THUE TNDN HIEN HANH',    // ma 51
    'CHI PHI THUE TNDN HOAN LAI',     // ma 52
    'LAI CO BAN TREN CO PHIEU',       // ma 70
    // Insurance (TT232 B02-DNPNT)
    'DOANH THU PHI BAO HIEM',
    'CHI BOI THUONG',
    'DOANH THU THUAN HOAT DONG KINH DOANH BAO HIEM',
    'LOI NHUAN GOP HOAT DONG KINH DOANH BAO HIEM',
    // CTCK (TT210 B02-CTCK)
    'DOANH THU NGHIEP VU MOI GIOI CHUNG KHOAN',
    'CHI PHI NGHIEP VU MOI GIOI CHUNG KHOAN',
    'CONG DOANH THU HOAT DONG',
    'CONG CHI PHI HOAT DONG',
    // Bank (TT49 B03-TCTD)
    'THU NHAP LAI THUAN',
    'LAI THUAN TU HOAT DONG DICH VU',
    'CHI PHI DU PHONG RUI RO TIN DUNG',
  ],
  // ---- LUU CHUYEN TIEN TE ----
  cashFlow: [
    ['LUU CHUYEN TIEN', 'HOAT DONG KINH DOANH'],
    ['LUU CHUYEN TIEN', 'HOAT DONG DAU TU'],
    ['LUU CHUYEN TIEN', 'HOAT DONG TAI CHINH'],
    'LUU CHUYEN TIEN THUAN TRONG KY',
    'KHAU HAO TAI SAN CO DINH',
    'TIEN CHI TRA LAI VAY',
    'TIEN CHI NOP THUE THU NHAP DOANH NGHIEP',
    ['TIEN THU TU BAN HANG', 'CUNG CAP DICH VU'],
    'TIEN THU TU PHAT HANH CO PHIEU',
    ['TUONG DUONG TIEN CUOI KY'],
  ],
  // ---- CHI TIEU NGOAI BCTHTC (CTCK) / NGOAI BANG (bank) ----
  offBalanceSheet: [
    'TAI SAN QUAN LY THEO CAM KET',
    'CO PHIEU DANG LUU HANH',
    ['TIEN GUI', 'GIAO DICH CHUNG KHOAN'],
    'BAO LANH VAY VON',
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
