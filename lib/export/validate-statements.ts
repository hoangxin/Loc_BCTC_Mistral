import type { FinancialStatements, StatementTable } from './financial-statements';
import {
  normalizeLabelText as normalizeLabel,
  findLabelColumnIndex as findLabelColumnIndexOnColumns,
  valueColumnIndexes,
  findMaSoColumnIndex,
  parseCode,
  findRowByCode,
} from './statement-shared';

export interface ValidationIssue {
  table: 'balanceSheet' | 'incomeStatement';
  message: string;
}

// Cot chua ten chi tieu KHONG LUON O VI TRI DAU (index 0) - vd bang "Ket qua
// hoat dong kinh doanh" thuong co them cot "STT" dung truoc. Neu cu gia dinh
// row[0] la nhan (nhu truoc day), voi bang co STT thi row[0] chi la so thu tu
// ("1", "2"...) - matcher se khong bao gio khop, khien validateIncomeStatement/
// validateIncomeStatementTax am tham bi bo qua hoan toan (tra ve [] vi
// revenueRow/costRow/... luon null) - da gap that qua feedback user 2026-07-04
// (cung goc voi bug lech cot da sua o financial-statements.ts). Tim theo TEN
// cot (fuzzy "CHI TIEU"/"TAI SAN"/"NGUON VON" - bang can doi ke toan thuong
// dat ten cot dau la "Tai san" thay vi "Chi tieu", xem statement-shared.ts),
// fallback ve 0 neu khong co cot nao khop ten do.
function findLabelColumnIndex(table: StatementTable): number {
  return findLabelColumnIndexOnColumns(table.columns);
}

function findRow(
  table: StatementTable,
  matcher: (normalizedLabel: string) => boolean
): (string | number | null)[] | null {
  const labelIndex = findLabelColumnIndex(table);
  for (const row of table.rows) {
    const label = row[labelIndex];
    if (typeof label === 'string' && matcher(normalizeLabel(label))) {
      return row;
    }
  }
  return null;
}

function findRows(
  table: StatementTable,
  matcher: (normalizedLabel: string) => boolean
): (string | number | null)[][] {
  const labelIndex = findLabelColumnIndex(table);
  return table.rows.filter((row) => {
    const label = row[labelIndex];
    return typeof label === 'string' && matcher(normalizeLabel(label));
  });
}

// Cong don theo vi tri cot giua nhieu dong khop (vd "Chi phi thue TNDN" bi
// tach thanh 2 dong rieng: hien hanh + hoan lai) truoc khi so sanh - CHI cong
// cac cot gia tri that su (xem valueColumnIndexes), khong dong theo index tho.
function sumRows(table: StatementTable, rows: (string | number | null)[][]): number[] {
  const sums = new Array(table.columns.length).fill(0);
  if (rows.length === 0) return sums;
  const indexes = valueColumnIndexes(table);
  for (const row of rows) {
    for (const i of indexes) {
      const value = row[i];
      if (typeof value === 'number') sums[i] += value;
    }
  }
  return sums;
}

// Cho phep sai so nho do lam tron, nhung van bat duoc loi lech ca chuc/tram
// lan nhu truong hop du/thieu 1 chu so khi OCR doc so dai.
function numbersClose(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return diff <= Math.max(1000, scale * 0.0005);
}

const ROMAN_NUMERAL_PATTERN = /^[IVXLCDM]+$/i;
// Muc con CAP 3 (chi tiet duoi 1 nhom La Ma, vd "1./ Tien", "7 Vay va no...")
// luon bat dau bang SO A-RAP (co the kem "." hoac "/" roi khoang trang) - dau
// hieu nay dang tin cay hon "ma so chia het cho 10" (xem comment duoi day).
const ARABIC_ITEM_PREFIX = /^\d+[.\/)]?\s/;

// Phan biet dong "cap 2" (I, II, III... - dong tong cua 1 nhom) voi dong "cap
// 3" (chi tiet don le duoi 1 nhom) - truoc day CHI dua vao "ma so la boi so
// cua 10", da gap that (2026-07-05, smoke test tren HSG qua Mistral): mot so
// dong CHI TIET (khong phai dong tong) tinh co cung co ma so chia het cho 10
// (vd ma 320 "Vay va no thue tai chinh ngan han", ma 420 "Quy khac thuoc von
// chu so huu" - ca 2 deu la muc le, KHONG phai dong tong nhom, nhung 320%10=0
// va 420%10=0 nen bi heuristic cu tinh nham la "cap 2", cong du vao tong gay
// lech). Dung THEM tin hieu STT (neu bang co cot STT rieng, gia tri La Ma nhu
// "I"/"II" moi la dong tong that su - "7" la so A-rap nghia la muc chi tiet)
// hoac tien to trong TEN CHI TIEU (neu bang KHONG co cot STT rieng, vd TIX -
// La Ma nam ngay trong ten nhu "III. Bat dong san dau tu" cho dong tong, con
// "1./ Phai thu..." cho muc chi tiet) de loai cac dong chi tiet gia mao nay
// ra khoi tong, thay vi chi dua vao ma so chia het cho 10 (van giu lam dieu
// kien BAT BUOC, chi khong con la dieu kien DU nua).
function isLikelySubtotalRow(table: StatementTable, row: (string | number | null)[], labelIndex: number): boolean {
  const sttIndex = table.columns.findIndex((col) => normalizeLabel(col).includes('STT'));
  if (sttIndex !== -1) {
    const sttValue = String(row[sttIndex] ?? '').trim();
    if (sttValue === '') return true; // mot so dong tong khong co STT rieng - khong du du lieu de bac bo, giu nguyen hanh vi cu (chap nhan)
    return ROMAN_NUMERAL_PATTERN.test(sttValue);
  }
  const label = String(row[labelIndex] ?? '').trim();
  return !ARABIC_ITEM_PREFIX.test(label);
}

// Cong cac dong "cap 2" (I, II, III... - ma so la boi so cua 10) trong
// khoang (min, max) - KHONG cong dong "cap 3" (vd I.1, I.2...) vi da nam
// trong gia tri cua dong cap 2 chua chung roi, cong them se bi tinh 2 lan.
function sumChildrenByCodeRange(
  table: StatementTable,
  maSoIndex: number,
  min: number,
  max: number
): (string | number | null)[][] {
  const labelIndex = findLabelColumnIndex(table);
  return table.rows.filter((row) => {
    const code = parseCode(row[maSoIndex]);
    if (code === null || code <= min || code >= max || code % 10 !== 0) return false;
    return isLikelySubtotalRow(table, row, labelIndex);
  });
}

// NGUYEN TAC QUAN TRONG (chot 2026-07-05, theo phan hoi user): neu 1 kiem tra
// KHONG THE THUC HIEN duoc (khong tim thay dong can thiet, hoac gia tri doc
// duoc khong phai dang so hop le), phai coi do la MOT LOI/CANH BAO can bao ra
// - TUYET DOI KHONG duoc am tham bo qua/tra ve "khong co van de gi". Truoc
// day cac ham o day tra ve [] (rong = khong co canh bao nao) khi khong tim
// thay du du lieu de so sanh - day la 1 lo hong nguy hiem: 1 bao cao co du
// lieu hong/thieu hoan toan van co the "qua" het moi kiem tra chi vi khong co
// gi de so sanh, tao cam giac an toan gia. Moi nhanh "khong the kiem tra" ben
// duoi deu phai push 1 ValidationIssue ro rang, khong duoc return [] hay bo
// qua im lang.
function compareOrFlag(
  table: 'balanceSheet' | 'incomeStatement',
  columnName: string,
  description: string,
  a: string | number | null,
  b: string | number | null,
  buildMismatchMessage: (a: number, b: number) => string
): ValidationIssue | null {
  if (typeof a === 'number' && typeof b === 'number') {
    return numbersClose(a, b) ? null : { table, message: buildMismatchMessage(a, b) };
  }
  return {
    table,
    message: `"${columnName}": khong kiem tra duoc "${description}" vi gia tri doc duoc khong phai dang so hop le (${JSON.stringify(a)} / ${JSON.stringify(b)}) - can xem tay.`,
  };
}

// Nguyen tac ke toan bat buoc dung voi MOI bang can doi ke toan, khong phu
// thuoc tung cong ty: Tong cong tai san = Tong cong nguon von. Day la dang
// thuc toan hoc chu khong phai AI doan - lech nghia la co it nhat 1 o so bi
// trich/OCR sai o dau do.
function validateBalanceSheet(table: StatementTable): ValidationIssue[] {
  const assetsRow = findRow(table, (label) => label.includes('TONG CONG TAI SAN'));
  const capitalRow = findRow(table, (label) => label.includes('TONG CONG NGUON VON'));
  if (!assetsRow || !capitalRow) {
    return [
      {
        table: 'balanceSheet',
        message:
          'Khong tim thay dong "Tong cong tai san" va/hoac "Tong cong nguon von" - khong kiem tra cheo duoc, can xem tay.',
      },
    ];
  }

  const issues: ValidationIssue[] = [];
  for (const i of valueColumnIndexes(table)) {
    const columnName = table.columns[i] ?? `cot ${i}`;
    const issue = compareOrFlag(
      'balanceSheet',
      columnName,
      'Tong cong tai san = Tong cong nguon von',
      assetsRow[i] ?? null,
      capitalRow[i] ?? null,
      (a, b) => `"${columnName}": Tong cong tai san (${a}) khong khop Tong cong nguon von (${b})`
    );
    if (issue) issues.push(issue);
  }
  return issues;
}

// Kiem tra 1 dang thuc "A + B = Tong" theo ma so, dung chung cho ca nhom
// tai san (100+200=270) va nguon von (300+400=440). Neu thieu bat ky dong nao
// trong 3 dong (a/b/tong) - PHAI bao la khong kiem tra duoc (khong return []),
// vi ca 3 ma so nay la bat buoc phai co theo Thong tu 200, khong phai truong
// hop "co the khong co" tuy bao cao.
function validateIdentity(
  table: StatementTable,
  aLabel: string,
  aRow: (string | number | null)[] | null,
  bLabel: string,
  bRow: (string | number | null)[] | null,
  totalLabel: string,
  totalRow: (string | number | null)[] | null,
  describe: (columnName: string, a: number, b: number, total: number) => string
): ValidationIssue[] {
  const missing = [!aRow && aLabel, !bRow && bLabel, !totalRow && totalLabel].filter((v): v is string => !!v);
  if (missing.length > 0) {
    return [
      {
        table: 'balanceSheet',
        message: `Khong tim thay dong: ${missing.join(', ')} - khong kiem tra duoc dang thuc "${aLabel} + ${bLabel} = ${totalLabel}".`,
      },
    ];
  }

  const issues: ValidationIssue[] = [];
  for (const i of valueColumnIndexes(table)) {
    const a = aRow![i] ?? null;
    const b = bRow![i] ?? null;
    const total = totalRow![i] ?? null;
    const columnName = table.columns[i] ?? `cot ${i}`;
    if (typeof a === 'number' && typeof b === 'number' && typeof total === 'number') {
      if (!numbersClose(a + b, total)) {
        issues.push({ table: 'balanceSheet', message: describe(columnName, a, b, total) });
      }
    } else {
      issues.push({
        table: 'balanceSheet',
        message: `"${columnName}": khong kiem tra duoc "${aLabel} + ${bLabel} = ${totalLabel}" vi gia tri doc duoc khong phai dang so hop le (${JSON.stringify(a)} / ${JSON.stringify(b)} / ${JSON.stringify(total)}) - can xem tay.`,
      });
    }
  }
  return issues;
}

// Kiem tra "tong cac muc con cap 2 = dong tong cua nhom" - PHAI bao neu
// khong tim thay dong tong (parentRow null) HOAC khong tim thay muc con nao
// (children rong), thay vi im lang bo qua nhu truoc.
function validateChildrenSum(
  table: StatementTable,
  groupLabel: string,
  parentRow: (string | number | null)[] | null,
  children: (string | number | null)[][]
): ValidationIssue[] {
  if (!parentRow) {
    return [
      {
        table: 'balanceSheet',
        message: `Khong tim thay dong "${groupLabel}" - khong kiem tra duoc tong cac muc con.`,
      },
    ];
  }
  if (children.length === 0) {
    return [
      {
        table: 'balanceSheet',
        message: `Khong tim thay muc con nao cua "${groupLabel}" (theo ma so cap 2) - khong kiem tra duoc tong cac muc con.`,
      },
    ];
  }

  const sums = sumRows(table, children);
  const issues: ValidationIssue[] = [];
  for (const i of valueColumnIndexes(table)) {
    const columnName = table.columns[i] ?? `cot ${i}`;
    const issue = compareOrFlag(
      'balanceSheet',
      columnName,
      `tong cac muc con cua "${groupLabel}"`,
      sums[i] ?? null,
      parentRow[i] ?? null,
      (sum, reported) => `"${columnName}": Tong cac muc trong ${groupLabel} (${sum}) khong khop dong ${groupLabel} (${reported})`
    );
    if (issue) issues.push(issue);
  }
  return issues;
}

// Nguyen tac ke toan bat buoc theo Thong tu 200, dua vao MA SO thay vi ten
// chi tieu (chinh xac hon - xem findMaSoColumnIndex):
//   100 (Tai san ngan han) + 200 (Tai san dai han) = 270 (Tong cong tai san)
//   300 (No phai tra) + 400 (Von chu so huu) = 440 (Tong cong nguon von)
// Kiem tra sau hon (theo tung nhom): tong cac muc con cap 2 (I, II, III...)
// cua tung nhom (100, 200, 300, 400) co khop voi chinh dong tong cua nhom do
// khong - giup khoanh vung chinh xac nhom nao la nguon goc gay lech, thay vi
// chi biet "co lech dau do". Ca 2 dang thuc deu chay (khong chi khi cai kia
// that bai) vi day la 2 kiem tra doc lap, gio deu phai bao ro neu khong the
// thuc hien duoc (xem compareOrFlag/validateIdentity/validateChildrenSum).
function validateBalanceSheetSubtotals(table: StatementTable): ValidationIssue[] {
  const maSoIndex = findMaSoColumnIndex(table);
  if (maSoIndex === null) {
    return [
      {
        table: 'balanceSheet',
        message: 'Khong tim thay cot "Ma so" - khong kiem tra duoc cac dang thuc can doi ke toan theo ma so.',
      },
    ];
  }

  const issues: ValidationIssue[] = [];

  const shortTermAssets = findRowByCode(table, maSoIndex, 100);
  const longTermAssets = findRowByCode(table, maSoIndex, 200);
  const totalAssets = findRowByCode(table, maSoIndex, 270);
  issues.push(
    ...validateIdentity(
      table,
      'TS ngan han (ma so 100)',
      shortTermAssets,
      'TS dai han (ma so 200)',
      longTermAssets,
      'Tong cong tai san (ma so 270)',
      totalAssets,
      (col, a, b, total) => `"${col}": TS ngan han (${a}) + TS dai han (${b}) khong khop Tong cong tai san (${total})`
    )
  );
  issues.push(...validateChildrenSum(table, 'TS ngan han', shortTermAssets, sumChildrenByCodeRange(table, maSoIndex, 100, 200)));
  issues.push(...validateChildrenSum(table, 'TS dai han', longTermAssets, sumChildrenByCodeRange(table, maSoIndex, 200, 270)));

  const liabilities = findRowByCode(table, maSoIndex, 300);
  const equity = findRowByCode(table, maSoIndex, 400);
  const totalCapital = findRowByCode(table, maSoIndex, 440);
  issues.push(
    ...validateIdentity(
      table,
      'No phai tra (ma so 300)',
      liabilities,
      'Von chu so huu (ma so 400)',
      equity,
      'Tong cong nguon von (ma so 440)',
      totalCapital,
      (col, a, b, total) => `"${col}": No phai tra (${a}) + Von chu so huu (${b}) khong khop Tong cong nguon von (${total})`
    )
  );
  issues.push(...validateChildrenSum(table, 'No phai tra', liabilities, sumChildrenByCodeRange(table, maSoIndex, 300, 400)));
  issues.push(...validateChildrenSum(table, 'Von chu so huu', equity, sumChildrenByCodeRange(table, maSoIndex, 400, 440)));

  return issues;
}

// "Doanh thu thuan" hay bi viet tat thanh "DT thuan" (vd HSG: "DT thuần về
// ban hang va cung cap dich vu (10=01-02)") - da gap that (2026-07-05, smoke
// test qua Mistral OCR, model OCR chep DUNG NGUYEN VAN chu viet tat trong tai
// lieu goc thay vi tu dong "chuan hoa" ve "Doanh thu thuan" nhu mot so lan
// Qwen (model sinh van ban) co the da vo tinh lam truoc day). Fallback sang
// tim theo MA SO (10, co dinh theo Thong tu 200/mau B02-DN) neu khong khop
// nhan bang chu - dang tin cay hon vi khong phu thuoc cach viet tat tung
// cong ty.
function findRevenueRow(table: StatementTable): (string | number | null)[] | null {
  const byLabel = findRow(table, (label) => label.includes('DOANH THU THUAN') || label.includes('DT THUAN'));
  if (byLabel) return byLabel;
  const maSoIndex = findMaSoColumnIndex(table);
  return maSoIndex === null ? null : findRowByCode(table, maSoIndex, 10);
}

// Cong thuc co dinh theo VAS: Loi nhuan gop = Doanh thu thuan - Gia von hang ban.
function validateIncomeStatement(table: StatementTable): ValidationIssue[] {
  const revenueRow = findRevenueRow(table);
  const costRow = findRow(table, (label) => label.includes('GIA VON HANG BAN'));
  const grossProfitRow = findRow(table, (label) => label.includes('LOI NHUAN GOP'));
  const missing = [
    !revenueRow && 'Doanh thu thuan',
    !costRow && 'Gia von hang ban',
    !grossProfitRow && 'Loi nhuan gop',
  ].filter((v): v is string => !!v);
  if (missing.length > 0) {
    return [
      {
        table: 'incomeStatement',
        message: `Khong tim thay dong: ${missing.join(', ')} - khong kiem tra duoc "Loi nhuan gop = Doanh thu thuan - Gia von".`,
      },
    ];
  }

  const issues: ValidationIssue[] = [];
  for (const i of valueColumnIndexes(table)) {
    const revenue = revenueRow![i] ?? null;
    const cost = costRow![i] ?? null;
    const grossProfit = grossProfitRow![i] ?? null;
    const columnName = table.columns[i] ?? `cot ${i}`;
    if (typeof revenue === 'number' && typeof cost === 'number' && typeof grossProfit === 'number') {
      if (!numbersClose(revenue - cost, grossProfit)) {
        issues.push({
          table: 'incomeStatement',
          message: `"${columnName}": Loi nhuan gop (${grossProfit}) khong khop Doanh thu thuan - Gia von (${revenue - cost})`,
        });
      }
    } else {
      issues.push({
        table: 'incomeStatement',
        message: `"${columnName}": khong kiem tra duoc "Loi nhuan gop = Doanh thu thuan - Gia von" vi gia tri doc duoc khong phai dang so hop le - can xem tay.`,
      });
    }
  }
  return issues;
}

// Cong thuc co dinh theo VAS: Loi nhuan sau thue = Loi nhuan truoc thue - Chi
// phi thue TNDN (hien hanh + hoan lai, cong don neu tach rieng 2 dong).
function validateIncomeStatementTax(table: StatementTable): ValidationIssue[] {
  const beforeTaxRow = findRow(table, (label) => label.includes('TRUOC THUE'));
  const taxRows = findRows(table, (label) => label.includes('CHI PHI THUE'));
  const afterTaxRow = findRow(table, (label) => label.includes('LOI NHUAN SAU THUE'));
  const missing = [
    !beforeTaxRow && 'Loi nhuan truoc thue',
    taxRows.length === 0 && 'Chi phi thue TNDN',
    !afterTaxRow && 'Loi nhuan sau thue',
  ].filter((v): v is string => !!v);
  if (missing.length > 0) {
    return [
      {
        table: 'incomeStatement',
        message: `Khong tim thay dong: ${missing.join(', ')} - khong kiem tra duoc "Loi nhuan sau thue = Loi nhuan truoc thue - Chi phi thue TNDN".`,
      },
    ];
  }

  const taxSums = sumRows(table, taxRows);
  const issues: ValidationIssue[] = [];
  for (const i of valueColumnIndexes(table)) {
    const beforeTax = beforeTaxRow![i] ?? null;
    const tax = taxSums[i] ?? null;
    const afterTax = afterTaxRow![i] ?? null;
    const columnName = table.columns[i] ?? `cot ${i}`;
    if (typeof beforeTax === 'number' && typeof tax === 'number' && typeof afterTax === 'number') {
      if (!numbersClose(beforeTax - tax, afterTax)) {
        issues.push({
          table: 'incomeStatement',
          message: `"${columnName}": Loi nhuan sau thue (${afterTax}) khong khop Loi nhuan truoc thue - Chi phi thue TNDN (${beforeTax - tax})`,
        });
      }
    } else {
      issues.push({
        table: 'incomeStatement',
        message: `"${columnName}": khong kiem tra duoc "Loi nhuan sau thue = Loi nhuan truoc thue - Chi phi thue TNDN" vi gia tri doc duoc khong phai dang so hop le - can xem tay.`,
      });
    }
  }
  return issues;
}

// Kiem tra tinh nhat quan noi tai cua so lieu da trich - hoan toan cuc bo,
// khong goi AI, khong ton token. Dung de phat hien loi do OCR/AI doc nham so,
// vd truong hop tung gap: 1 chu so du/thieu lam lech ca chuc lan. NGUYEN TAC
// (2026-07-05): "khong kiem tra duoc" LUON duoc coi la 1 canh bao can bao ra,
// khong bao gio am tham tra ve "khong co van de gi" chi vi thieu du lieu de so
// sanh - xem comment chi tiet o compareOrFlag/validateIdentity/validateChildrenSum.
export function validateFinancialStatements(statements: FinancialStatements): ValidationIssue[] {
  return [
    ...validateBalanceSheet(statements.balanceSheet),
    ...validateBalanceSheetSubtotals(statements.balanceSheet),
    ...validateIncomeStatement(statements.incomeStatement),
    ...validateIncomeStatementTax(statements.incomeStatement),
  ];
}
