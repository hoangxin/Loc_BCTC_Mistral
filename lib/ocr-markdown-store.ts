// Luu markdown OCR THO cho MOI bao cao trong pipeline production ("Tai BCTC",
// chay tren GitHub Actions - xem .github/workflows/fetch-bctc.yml) - GHI DE
// theo tung (ma+ky+pham vi hop nhat/rieng le), KHONG tich luy lich su, de
// dung luong repo ty le voi so bao cao dang trong data/latest-fetch.json thay
// vi phinh dan theo thoi gian moi lan fetch lai (quyet dinh cua nguoi dung,
// 2026-07-16 - sau su co MCH/ABB/TPB: LCTT rong tren live nhung khong co
// markdown nao de dieu tra ma khong ton OCR that lan 2, vi pipeline production
// truoc day CHI commit data/latest-fetch.json, chua bao gio luu markdown tho).
//
// KHAC voi lib/debug-markdown-index.ts (CHI danh cho debug/re-fetch cuc bo
// tren may local, tich luy nhieu lan khong ghi de, tu nhan la "khong phai
// pipeline production") - file nay LA 1 phan CHINH THUC cua pipeline that,
// duoc .github/workflows/fetch-bctc.yml commit lai cung 1 buoc voi
// data/latest-fetch.json.
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OCR_MARKDOWN_DIR = join(process.cwd(), 'data', 'ocr-markdown');

// Bo dau + khoang trang de dung an toan trong ten file tren moi he dieu hanh
// (vd StatementScope "Hợp nhất" -> "HopNhat").
function sanitizeForFilename(value: string): string {
  return value
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFD')
    .replace(/[^a-zA-Z0-9]+/g, '');
}

// periodKey PHAI gom ca nam+ky+pham vi (khong chi ma co phieu) - 1 ma co the
// co nhieu ky/pham vi khac nhau, ghi de nham se mat markdown cua ky khac.
export function saveProductionOcrMarkdown(stockCode: string, periodKey: string, markdown: string): void {
  if (!existsSync(OCR_MARKDOWN_DIR)) mkdirSync(OCR_MARKDOWN_DIR, { recursive: true });
  const fileName = `${sanitizeForFilename(stockCode)}__${sanitizeForFilename(periodKey)}.md`;
  writeFileSync(join(OCR_MARKDOWN_DIR, fileName), markdown, 'utf-8');
}
