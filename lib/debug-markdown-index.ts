// Danh muc TAP TRUNG cac lan markdown tho da luu vao data/debug-empty-parse/
// (2026-07-16, theo yeu cau nguoi dung sau su co PTI: goi OCR lai vo ich vi
// khong biet/khong tim ra markdown da luu tu lan truoc). Truoc day moi script
// re-fetch tu dat ten file rieng (ma + timestamp), khong co danh muc nao ghi
// lai "da co markdown cua ma nao, luc nao" - phai tu nho/grep ten file, de
// bo sot va goi OCR that TON TIEN vo ich lan 2. CHI dung cho debug/re-fetch
// cuc bo (khong phai pipeline production tren Vercel - server dam may khong
// giu file giua cac lan chay, xem README).
//
// QUAN TRONG (theo phan hoi nguoi dung): PHAI khoanh vung theo QUY/NAM (vd
// "Q1/2026"), KHONG CHI theo ma co phieu - neu khong, markdown da luu cho
// mot ky bao cao se bi lay ra "canh bao trung" nham khi nguoi dung that su
// can fetch ky KHAC (vd Q2/2026) cua CUNG 1 ma, gay phien toan khong dang co.
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const INDEX_PATH = join(process.cwd(), 'data', 'debug-empty-parse', 'index.json');

export interface MarkdownIndexEntry {
  stockCode: string;
  periodLabel: string; // vd "Q1/2026" - PHAI khop chinh xac de tinh la "cung ky"
  savedAt: string; // ISO timestamp
  markdownPath: string; // duong dan tuong doi tu goc repo
  pagesFetched?: number;
  source: string; // ten script/ham da tao ra file nay (vd "ocr-capped-probe", "refetch-one")
  note?: string;
}

export function recordMarkdownIndex(entry: Omit<MarkdownIndexEntry, 'savedAt'>): void {
  const existing: MarkdownIndexEntry[] = existsSync(INDEX_PATH) ? JSON.parse(readFileSync(INDEX_PATH, 'utf-8')) : [];
  existing.push({ ...entry, savedAt: new Date().toISOString() });
  writeFileSync(INDEX_PATH, JSON.stringify(existing, null, 2), 'utf-8');
}

// Tra ve TAT CA lan da luu cho 1 ma TRONG DUNG 1 KY BAO CAO (moi nhat o
// cuoi) - kiem tra TRUOC KHI goi OCR that lai cho ma+ky do trong bat ky
// script re-fetch nao. KHONG loc theo ky (periodLabel === undefined) tra ve
// TAT CA ky cua ma do - chi dung de xem lich su chung, khong dung de quyet
// dinh co "trung" hay khong.
export function findMarkdownIndexFor(stockCode: string, periodLabel?: string): MarkdownIndexEntry[] {
  if (!existsSync(INDEX_PATH)) return [];
  const existing: MarkdownIndexEntry[] = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
  return existing.filter((e) => e.stockCode === stockCode && (periodLabel === undefined || e.periodLabel === periodLabel));
}
