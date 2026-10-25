// Kiem thu CUC BO (server gia lap tren 127.0.0.1, KHONG goi mang that, khong
// ton phi) cho ban sua 2026-10-25 "8 bao cao Q3 mat vi CDN Vietstock nghen":
//  1. downloadOne vuot qua duoc chuoi 520 -> 522 -> ket noi bi cat (aborted)
//  2. file bi CAT GIUA CHUNG ma stream van dong "tu te" (Content-Length khai
//     bao lon hon so byte that) phai bi phat hien, khong duoc nhan nham la xong
//  3. jitter: cac thoi gian cho phai khac nhau va nam trong +/-20%
//
// Chay: npx tsx scripts/_debug-download-retry-2026-10-25.ts
import { createServer } from 'http';
import { mkdtempSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { downloadOne } from '../lib/download';
import { withTransientRetry } from '../lib/http';

const BODY = Buffer.from('PK\u0003\u0004 noi dung gia lap cua 1 file bctc'.repeat(50));

let mode: 'flaky' | 'truncated-once' = 'flaky';
let hits = 0;

const server = createServer((_req, res) => {
  hits++;
  if (mode === 'flaky') {
    // 3 lan dau hong y het su co that (520 -> 522 -> cat ket noi), lan 4 OK
    if (hits === 1) return res.writeHead(520).end('cloudflare');
    if (hits === 2) return res.writeHead(522).end('cloudflare');
    if (hits === 3) {
      res.writeHead(200, { 'Content-Length': String(BODY.length) });
      res.write(BODY.subarray(0, 10));
      return res.destroy(); // cat giua chung -> Error: aborted
    }
    res.writeHead(200, { 'Content-Length': String(BODY.length) });
    return res.end(BODY);
  }
  // 'truncated-once': lan dau KHAI BAO du byte nhung gui thieu roi dong tu te
  res.writeHead(200, { 'Content-Length': String(BODY.length) });
  res.end(hits === 1 ? BODY.subarray(0, 20) : BODY);
});

async function main() {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const dir = mkdtempSync(join(tmpdir(), 'dl-test-'));
  const report = {
    stockCode: 'TST',
    fileUrl: `http://127.0.0.1:${port}/TST_Baocaotaichinh_Q3_2026.zip`,
    fileExt: '.zip',
  } as never;

  console.log('--- Test 1: 520 -> 522 -> aborted -> 200 (phai thanh cong)');
  const t0 = Date.now();
  const filePath = await downloadOne(report, dir);
  const size = statSync(filePath).size;
  console.log(`   OK sau ${hits} lan goi, ${Math.round((Date.now() - t0) / 1000)}s, file ${size} byte (dung = ${BODY.length})`);
  if (hits !== 4) throw new Error(`FAIL: phai goi 4 lan, thuc te ${hits}`);
  if (size !== BODY.length) throw new Error('FAIL: file tai ve khong du byte');

  console.log('--- Test 2: server gui thieu byte nhung dong tu te (phai bi phat hien + thu lai)');
  mode = 'truncated-once';
  hits = 0;
  const t1 = Date.now();
  const filePath2 = await downloadOne(report, dir);
  const size2 = statSync(filePath2).size;
  console.log(`   OK sau ${hits} lan goi, ${Math.round((Date.now() - t1) / 1000)}s, file ${size2} byte`);
  if (hits !== 2) throw new Error(`FAIL: lan tai thieu byte khong bi phat hien (${hits} lan goi)`);
  if (size2 !== BODY.length) throw new Error('FAIL: file cuoi cung van thieu byte');

  console.log('--- Test 3: jitter (base 1000ms, 8 lan)');
  const delays: number[] = [];
  for (let i = 0; i < 8; i++) {
    await withTransientRetry(
      async () => {
        throw Object.assign(new Error('aborted'), { code: 'ECONNRESET' });
      },
      { attempts: 2, delaysMs: [1000], onRetry: (_e, _a, delayMs) => delays.push(delayMs) }
    ).catch(() => {});
  }
  console.log('  ', delays.join(', '), `(${new Set(delays).size} gia tri khac nhau)`);
  if (new Set(delays).size < 4) throw new Error('FAIL: jitter khong hoat dong');
  const outOfRange = delays.filter((d) => d < 800 || d > 1200);
  if (outOfRange.length) throw new Error(`FAIL: jitter vuot bien +/-20%: ${outOfRange.join(', ')}`);

  console.log('\nTAT CA PASS');
  server.close();
}

main().catch((error) => {
  console.error(error);
  server.close();
  process.exit(1);
});
