// Luu FetchStatus thanh NHIEU file, moi KY bao cao 1 file, thay vi 1 file
// data/latest-fetch.json duy nhat.
//
// Ly do (2026-10-25, yeu cau nguoi dung): file don da 52MB, GitHub canh bao
// vuot muc khuyen nghi 50MB khi push. Nang hon ca kich thuoc hien tai la
// LICH SU: moi lan chay fetch deu commit lai TOAN BO file, nen repo phinh
// them hang chuc MB moi lan du chi them vai bao cao cua 1 quy. Tach theo ky
// thi 1 lan chay chi ghi lai dung manh cua ky do.
//
// Cach luu:
//   data/fetch-status/index.json   - phan dung chung (running, generatedAt,
//                                    totals, failed, interrupted, excluded,
//                                    lastCustomSourceCheck) - chi ~33KB
//   data/fetch-status/2026-Q3.json - MANG reports cua rieng ky do
//
// Dinh dang manh: MOI BAO CAO 1 DONG (khong thut dau dong lồng nhau). Thut
// dau dong kieu JSON.stringify(x, null, 2) chiem 52% dung luong file (do
// that: 52MB -> 24,9MB khi bo). Van xuong dong giua cac bao cao de git con
// delta/diff theo tung bao cao thay vi coi ca manh la 1 dong khong lo.
//
// readStatus() GOP lai thanh dung FetchStatus nhu truoc, nen moi noi goi
// (app/page.tsx, lib/pipeline.ts, cac script) khong phai sua gi.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import type { FetchStatus, DownloadedReport } from './status';

const DATA_DIR = join(process.cwd(), 'data');
export const STATUS_DIR = join(DATA_DIR, 'fetch-status');
const INDEX_PATH = join(STATUS_DIR, 'index.json');
// File cu 1 manh - van doc duoc de checkout chua chuyen doi/ban cu khong vo.
const LEGACY_PATH = join(DATA_DIR, 'latest-fetch.json');

const EMPTY_STATUS: FetchStatus = {
  running: false,
  generatedAt: '',
  periodLabel: null,
  year: null,
  totalFound: 0,
  totalMatched: 0,
  downloaded: 0,
  failed: [],
  interruptedReports: [],
  excludedReports: [],
  reports: [],
  lastCustomSourceCheck: null,
};

// Ten manh theo ky. Bao cao thieu periodYear/periodSlug (du lieu cu) don vao
// "khong-ro" thay vi bi bo roi - mat du lieu am tham la rui ro lon nhat o day.
export function periodShardName(report: Pick<DownloadedReport, 'periodYear' | 'periodSlug'>): string {
  const year = report.periodYear;
  const slug = report.periodSlug;
  return year && slug ? `${year}-${slug}` : 'khong-ro';
}

function groupByPeriod(reports: DownloadedReport[]): Map<string, DownloadedReport[]> {
  const groups = new Map<string, DownloadedReport[]>();
  for (const report of reports) {
    const key = periodShardName(report);
    const list = groups.get(key);
    if (list) list.push(report);
    else groups.set(key, [report]);
  }
  return groups;
}

// Mang JSON voi moi phan tu 1 dong - xem comment dau file ve ly do.
function serializeShard(reports: DownloadedReport[]): string {
  if (reports.length === 0) return '[]\n';
  return `[\n${reports.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`;
}

// Ghi qua file tam roi rename (atomic tren ca POSIX lan NTFS) - giu nguyen
// chot chong hong file cua writeStatus cu, xem comment tai lib/pipeline.ts.
function writeFileAtomic(path: string, content: string) {
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, content, 'utf-8');
  renameSync(tmpPath, path);
}

function shardFiles(): string[] {
  if (!existsSync(STATUS_DIR)) return [];
  return readdirSync(STATUS_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'index.json')
    .sort();
}

export function readStatus(): FetchStatus {
  if (!existsSync(INDEX_PATH)) {
    // Chua chuyen doi: doc file cu de ban cu/checkout cu van chay duoc.
    if (existsSync(LEGACY_PATH)) {
      const parsed = JSON.parse(readFileSync(LEGACY_PATH, 'utf-8')) as Partial<FetchStatus>;
      return { ...EMPTY_STATUS, ...parsed } as FetchStatus;
    }
    return { ...EMPTY_STATUS, failed: [], interruptedReports: [], excludedReports: [], reports: [] };
  }

  const index = JSON.parse(readFileSync(INDEX_PATH, 'utf-8')) as Partial<FetchStatus>;
  const reports: DownloadedReport[] = [];
  for (const file of shardFiles()) {
    const shard = JSON.parse(readFileSync(join(STATUS_DIR, file), 'utf-8')) as DownloadedReport[];
    reports.push(...shard);
  }
  // Backfill field them SAU nay (interruptedReports/excludedReports) khi doc
  // du lieu ghi tu ban cu - giu nguyen hanh vi cua readStatus cu.
  return { ...EMPTY_STATUS, ...index, reports } as FetchStatus;
}

export function writeStatus(status: FetchStatus) {
  mkdirSync(STATUS_DIR, { recursive: true });

  const groups = groupByPeriod(status.reports);

  // CHI ghi lai manh co noi dung THAY DOI - day la ca diem cua viec tach file:
  // 1 lan chay fetch 1 quy khong duoc lam ban cac quy khac (git se coi la thay
  // doi va commit lai het, dung lai dung van de can tranh).
  for (const [period, reports] of groups) {
    const path = join(STATUS_DIR, `${period}.json`);
    const next = serializeShard(reports);
    if (existsSync(path) && readFileSync(path, 'utf-8') === next) continue;
    writeFileAtomic(path, next);
  }

  // Manh cua ky khong con bao cao nao: ghi mang rong thay vi xoa file, de
  // viec "bien mat" luon la thay doi NHIN THAY duoc trong git chu khong phai
  // 1 file lang le khong con.
  for (const file of shardFiles()) {
    const period = file.replace(/\.json$/, '');
    if (groups.has(period)) continue;
    const path = join(STATUS_DIR, file);
    if (readFileSync(path, 'utf-8') === '[]\n') continue;
    writeFileAtomic(path, '[]\n');
  }

  const { reports: _reports, ...rest } = status;
  writeFileAtomic(INDEX_PATH, `${JSON.stringify(rest, null, 2)}\n`);
}

// Dung cho script kiem tra/chuyen doi: liet ke manh dang co kem kich thuoc.
export function shardSummary(): { period: string; bytes: number }[] {
  return shardFiles().map((file) => ({
    period: file.replace(/\.json$/, ''),
    bytes: statSync(join(STATUS_DIR, file)).size,
  }));
}
