import { existsSync } from 'fs';
import { join } from 'path';

// Chay thang qua tsx (khong qua Next.js) khong tu nap .env - xem comment
// tuong tu trong scripts/run-fetch.ts.
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

import { resolveQuarterTerm, fetchReportFilesForTerm, type ReportFile } from '../lib/vietstock-reports';
import { runFetchPipeline } from '../lib/pipeline';

// Test co chu dich (yeu cau nguoi dung 2026-07-12) sau khi bat billing +
// doi sang Batch API: chon dung 5 bao cao cu the bang selectedFileInfoIds
// (KHONG chay ca 1946 bao cao Q1/2026) de kiem tra callMistralOcrBatch that
// truoc khi ap dung cho toan bo 1500 bao cao.
interface Target {
  stockCode: string;
  scopeKeyword?: string; // 'hợp nhất' | 'mẹ' - undefined = khong yeu cau, lay ban chinh dau tien
}

const TARGETS: Target[] = [
  { stockCode: 'SHS' },
  { stockCode: 'PVS', scopeKeyword: 'hợp nhất' },
  { stockCode: 'PVI', scopeKeyword: 'hợp nhất' },
  // TCB, ANT tam bo qua theo yeu cau nguoi dung 2026-07-12 - gioi han lai
  // chi PVI/SHS/PVS cho lan test nay (sau khi sua cat trang + file-upload).
  // { stockCode: 'TCB' },
  // { stockCode: 'ANT', scopeKeyword: 'mẹ' },
];

function pickBestMatch(candidates: ReportFile[], target: Target): ReportFile | null {
  if (candidates.length === 0) return null;
  let pool = candidates;
  if (target.scopeKeyword) {
    const scoped = pool.filter((r) => r.title.toLowerCase().includes(target.scopeKeyword!));
    if (scoped.length > 0) pool = scoped;
  }
  // Uu tien ban KHONG phai "soat xet"/"dieu chinh" (ban chinh thuc dau tien).
  const primary = pool.filter((r) => !/so[aá]t x[eé]t|đi[eề]u ch[iỉ]nh/i.test(r.title));
  const finalPool = primary.length > 0 ? primary : pool;
  return [...finalPool].sort((a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime())[0];
}

async function main() {
  console.log('Dang lay danh sach bao cao Q1/2026 tu Vietstock...');
  const term = await resolveQuarterTerm(1, 2026);
  if (!term) throw new Error('Khong tim thay ky Quy 1/2026');
  const allReports = await fetchReportFilesForTerm(term);
  console.log(`Tong so bao cao Q1/2026: ${allReports.length}`);

  const selectedIds: number[] = [];
  const selection: { target: Target; picked: ReportFile | null; candidateCount: number }[] = [];

  for (const target of TARGETS) {
    const candidates = allReports.filter((r) => r.stockCode.toUpperCase() === target.stockCode.toUpperCase());
    const picked = pickBestMatch(candidates, target);
    selection.push({ target, picked, candidateCount: candidates.length });
    if (picked) selectedIds.push(picked.fileInfoID);
  }

  console.log('\n=== Bao cao duoc chon ===');
  for (const s of selection) {
    if (s.picked) {
      console.log(`${s.target.stockCode} -> [${s.picked.exchange}] "${s.picked.title}" (fileInfoID=${s.picked.fileInfoID}, trong so ${s.candidateCount} ung vien)`);
    } else {
      console.log(`${s.target.stockCode} -> KHONG TIM THAY (0 ung vien)`);
    }
  }

  if (selectedIds.length === 0) {
    console.log('\nKhong co bao cao nao de chay, dung lai.');
    return;
  }

  console.log(`\nBat dau chay pipeline cho ${selectedIds.length} bao cao...`);
  const start = Date.now();
  const status = await runFetchPipeline({ term, selectedFileInfoIds: selectedIds });
  const elapsedMs = Date.now() - start;

  const relevantReports = status.reports.filter((r) => TARGETS.some((t) => t.stockCode.toUpperCase() === r.stockCode.toUpperCase()));
  console.log(`\n=== Ket qua (${(elapsedMs / 1000).toFixed(1)}s) ===`);
  console.log('Downloaded:', status.downloaded);
  console.log('Thanh cong (reports):', relevantReports.length, relevantReports.map((r) => `${r.stockCode}(${r.statementScope})`));
  const relevantFailed = status.failed.filter((f) => TARGETS.some((t) => t.stockCode.toUpperCase() === f.stockCode.toUpperCase()));
  if (relevantFailed.length > 0) {
    console.log('LOI:', JSON.stringify(relevantFailed, null, 2));
  } else {
    console.log('Khong co loi cho 5 bao cao nay.');
  }
}

main().catch((err) => {
  console.error('Script that bai:', err);
  process.exit(1);
});
