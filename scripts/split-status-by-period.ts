// Chuyen data/latest-fetch.json (1 file) sang data/fetch-status/ (moi ky 1
// file) - xem lib/status-store.ts ve ly do.
//
// TU KIEM CHUNG roi moi bao thanh cong: doc lai bang readStatus() va so voi
// ban goc theo TUNG bao cao (khoa dinh danh + so sanh sau toan bo noi dung),
// khong chi dem so luong. File goc KHONG bi xoa o day - xoa la viec rieng,
// lam sau khi da nhin ket qua kiem chung.
//   npx tsx scripts/split-status-by-period.ts
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { readStatus, writeStatus, shardSummary, STATUS_DIR } from '../lib/status-store';
import type { FetchStatus, DownloadedReport } from '../lib/status';

const LEGACY_PATH = join(process.cwd(), 'data', 'latest-fetch.json');

function reportKey(r: DownloadedReport): string {
  return [r.stockCode, r.periodYear, r.periodSlug, r.statementScope, r.title].join('|');
}

function main() {
  if (!existsSync(LEGACY_PATH)) throw new Error(`Khong thay ${LEGACY_PATH}`);
  const truoc = JSON.parse(readFileSync(LEGACY_PATH, 'utf-8')) as FetchStatus;
  const bytesTruoc = statSync(LEGACY_PATH).size;
  console.log(`Doc file cu: ${truoc.reports.length} bao cao, ${(bytesTruoc / 1048576).toFixed(1)} MB`);

  writeStatus(truoc);
  const sau = readStatus();

  // 1. Cac truong dung chung (moi thu tru reports).
  const { reports: _r1, ...goc } = truoc;
  const { reports: _r2, ...moi } = sau;
  const truongLech = Object.keys({ ...goc, ...moi }).filter(
    (k) => JSON.stringify((goc as any)[k]) !== JSON.stringify((moi as any)[k])
  );

  // 2. Tung bao cao: so khop theo khoa dinh danh, roi so SAU toan bo noi dung.
  const mapTruoc = new Map<string, DownloadedReport[]>();
  for (const r of truoc.reports) {
    const k = reportKey(r);
    mapTruoc.set(k, [...(mapTruoc.get(k) ?? []), r]);
  }
  const mapSau = new Map<string, DownloadedReport[]>();
  for (const r of sau.reports) {
    const k = reportKey(r);
    mapSau.set(k, [...(mapSau.get(k) ?? []), r]);
  }

  const thieu: string[] = [];
  const thua: string[] = [];
  const khacNoiDung: string[] = [];
  for (const [k, ds] of mapTruoc) {
    const dsSau = mapSau.get(k);
    if (!dsSau || dsSau.length !== ds.length) {
      thieu.push(`${k} (truoc ${ds.length}, sau ${dsSau?.length ?? 0})`);
      continue;
    }
    for (let i = 0; i < ds.length; i++) {
      if (JSON.stringify(ds[i]) !== JSON.stringify(dsSau[i])) khacNoiDung.push(k);
    }
  }
  for (const k of mapSau.keys()) if (!mapTruoc.has(k)) thua.push(k);

  console.log(`\nDa ghi vao ${STATUS_DIR}:`);
  let tong = 0;
  for (const { period, bytes } of shardSummary()) {
    tong += bytes;
    console.log(`   ${period.padEnd(12)} ${(bytes / 1048576).toFixed(2).padStart(7)} MB`);
  }
  const indexBytes = statSync(join(STATUS_DIR, 'index.json')).size;
  tong += indexBytes;
  console.log(`   ${'index'.padEnd(12)} ${(indexBytes / 1048576).toFixed(2).padStart(7)} MB`);
  console.log(`   ${'TONG'.padEnd(12)} ${(tong / 1048576).toFixed(2).padStart(7)} MB  (truoc: ${(bytesTruoc / 1048576).toFixed(2)} MB)`);

  console.log('\n--- KIEM CHUNG ---');
  console.log(`So bao cao:      ${truoc.reports.length} -> ${sau.reports.length}`);
  console.log(`Truong lech:     ${truongLech.length ? truongLech.join(', ') : 'khong co'}`);
  console.log(`Bao cao thieu:   ${thieu.length}${thieu.length ? ' -> ' + thieu.slice(0, 5).join(' ; ') : ''}`);
  console.log(`Bao cao thua:    ${thua.length}${thua.length ? ' -> ' + thua.slice(0, 5).join(' ; ') : ''}`);
  console.log(`Khac noi dung:   ${khacNoiDung.length}${khacNoiDung.length ? ' -> ' + khacNoiDung.slice(0, 5).join(' ; ') : ''}`);

  const dat = truongLech.length === 0 && thieu.length === 0 && thua.length === 0 && khacNoiDung.length === 0;
  console.log(dat ? '\n=> DAT: du lieu y nguyen sau khi tach.' : '\n=> HONG: KHONG duoc xoa file cu.');
  process.exitCode = dat ? 0 : 1;
}

main();
