// Dong bo CHINH XAC voi ANCHOR_MARKERS_BY_KEY (lib/export/markdown-tables.ts)
// tai thoi diem chay - mirror-check tren corpus that de xac nhan KHONG soi
// guong bang anh em. Chay lai moi khi doi bo neo truoc khi commit.
import { execSync } from 'child_process';
import { normalizeLabelText } from '../lib/export/statement-shared';

type Marker = string | string[];
const CANDIDATES: Record<'balanceSheet'|'incomeStatement'|'cashFlow'|'offBalanceSheet', Marker[]> = {
  balanceSheet: [
    ['TONG CONG TAI SAN'],
    ['TONG CONG NGUON VON'],
    ['TAI SAN NGAN HAN'],
    ['TAI SAN CO DINH HUU HINH'],
    ['TAI SAN CO DINH VO HINH'],
    ['QUY KHEN THUONG', 'PHUC LOI'],
    ['LOI NHUAN SAU THUE CHUA PHAN PHOI'],
    ['THANG DU VON CO PHAN'],
    ['TONG TAI SAN'],
    ['TONG NO PHAI TRA', 'VON CHU SO HUU'],
    ['TAI SAN TAI BAO HIEM'],
  ],
  incomeStatement: [
    ['DOANH THU THUAN'],
    ['GIA VON'],
    ['LOI NHUAN GOP'],
    ['GIAM TRU DOANH THU'],
    ['CHI PHI BAN HANG'],
    ['CHI PHI QUAN LY'],
    ['TONG LOI NHUAN', 'TRUOC THUE'],
    ['LOI NHUAN KE TOAN', 'TRUOC THUE'],
    'LOI NHUAN SAU THUE THU NHAP DOANH NGHIEP',
    ['CHI PHI THUE', 'TNDN', 'HIEN HANH'],
    ['CHI PHI THUE', 'TNDN', 'HOAN LAI'],
    ['LAI CO BAN TREN CO PHIEU'],
    ['DOANH THU PHI BAO HIEM'],
    ['CHI BOI THUONG'],
    ['NGHIEP VU MOI GIOI CHUNG KHOAN'],
    ['CONG DOANH THU HOAT DONG'],
    ['CONG CHI PHI HOAT DONG'],
    ['THU NHAP LAI THUAN'],
    ['LAI THUAN', 'HOAT DONG DICH VU'],
  ],
  cashFlow: [
    ['LUU CHUYEN TIEN', 'HOAT DONG KINH DOANH'],
    ['LUU CHUYEN TIEN', 'HOAT DONG DAU TU'],
    ['LUU CHUYEN TIEN', 'HOAT DONG TAI CHINH'],
    ['LUU CHUYEN TIEN THUAN TRONG KY'],
    ['TIEN CHI TRA', 'LAI VAY'],
    ['TIEN CHI NOP THUE', 'THU NHAP DOANH NGHIEP'],
    ['TIEN THU', 'BAN HANG', 'CUNG CAP DICH VU'],
    ['TIEN THU TU PHAT HANH CO PHIEU'],
  ],
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

let rejects = 0;
for (const stmt of KEYS) {
  console.log(`\n===== ${stmt} =====`);
  for (const m of CANDIDATES[stmt]) {
    const mirror = recs.filter(r=>r.stmt!==stmt && matches(r.text,m));
    const own = recs.filter(r=>r.stmt===stmt && matches(r.text,m));
    const ownBiz = [...new Set(own.map(r=>r.biz))].sort();
    const label = Array.isArray(m)?`[${m.join(' & ')}]`:m;
    if (mirror.length) {
      rejects++;
      console.log(`  REJECT  ${label.padEnd(52)} <- soi guong: ${[...new Set(mirror.map(r=>r.code+':'+r.stmt))].slice(0,4).join(', ')}`);
    } else {
      console.log(`  ok  ${String(own.length).padStart(2)}x [${ownBiz.join(',')||'-'}]  ${label}`);
    }
  }
}
console.log(`\n${rejects} reject(s) tren corpus 33 bao cao.`);
