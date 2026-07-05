// Tach tu lib/export/pdf.ts (2026-07-05) - dung chung cho ca "Toan van bao
// cao" cua PDF (dong dang bang trong Thuyet minh, vision model danh dau ranh
// gioi cot bang " | ") VA cho .doc nhi phan cu (lib/export/doc-statements.ts,
// text trich ra tu word-extractor KHONG co ranh gioi cot ro rang nhu docx/pdf,
// phai tu dua vao vi tri cac token giong so de doan ranh gioi cot).

// Vai dong AI KHONG chen dau "|" du da duoc dan trong prompt (khong tuan thu
// 100%, da gap that qua feedback user 2026-07-05 tren cac dong chi tiet don
// le nhu "- Nguyen gia   221   9   3.913...   3.901...") - luoi an toan doc
// lap voi prompt: neu 1 dong CHUA co "|" nhung co it nhat 1 so dang tien te
// that su (nhom 3 chu so cach nhau boi dau cham, vd "3.913.145.788.793") VA
// tong cong co >=2 "token giong so" (ke ca ma so ngan nhu "221"), tu dong chen
// "|" truoc moi token do - dua theo khoang trang, khong doi hoi model phai
// tu lam dung 100%.
export const REAL_AMOUNT_PATTERN = /\(?-?\d{1,3}(?:\.\d{3})+\)?/;
export const NUMERIC_TOKEN_PATTERN = /\(?-?\d[\d.,]*\)?/g;

export function autoColumnarize(line: string): string {
  if (line.includes('|')) return line;
  if (!REAL_AMOUNT_PATTERN.test(line)) return line;

  const matches = [...line.matchAll(NUMERIC_TOKEN_PATTERN)];
  if (matches.length < 2) return line;

  let result = '';
  let lastEnd = 0;
  for (const match of matches) {
    const start = match.index ?? 0;
    result += `${line.slice(lastEnd, start).trim()} | `;
    result += match[0];
    lastEnd = start + match[0].length;
  }
  return result;
}
