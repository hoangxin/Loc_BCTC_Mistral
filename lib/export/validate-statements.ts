import type { FinancialStatements, StatementTable } from './financial-statements';
import {
  normalizeLabelText as normalizeLabel,
  findLabelColumnIndex as findLabelColumnIndexOnColumns,
  valueColumnIndexes,
  findMaSoColumnIndex,
  parseCode,
  findRowByCode,
  isLikelySubtotalRow,
  findIncomeStatementGroupMismatches,
  findDecimalCodeGroupMismatches,
  findBalanceSheetLevel2Mismatches,
  type GroupSumMismatch,
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
  return findLabelColumnIndexOnColumns(table.columns, table.rows);
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

// Nhu findRow, nhung tra ve VI TRI (index trong table.rows) thay vi chinh
// dong - can cho childrenBetween duoi (khoanh vung "cac dong con nam GIUA 2
// dong nhom" theo VI TRI, khong theo ma so - xem validateBalanceSheetSubtotals).
// `preferSubtotal`: uu tien dong la TONG NHOM (vd "A. Tai san ngan han") khi
// cung 1 cum tu cung xuat hien lai o 1 dong con cap duoi (vd truong hop TT200
// cu "I. Von chu so huu" trung ten voi dong cha "D - Von chu so huu") - dong
// TONG luon dung TRUOC dong con trong bang nen "khop dau tien la dong tong"
// se luon dung.
function findRowIndex(
  table: StatementTable,
  labelIndex: number,
  matcher: (normalizedLabel: string) => boolean,
  options?: { preferSubtotal?: boolean }
): number {
  const matches: number[] = [];
  table.rows.forEach((row, i) => {
    const label = row[labelIndex];
    if (typeof label === 'string' && matcher(normalizeLabel(label))) matches.push(i);
  });
  if (matches.length === 0) return -1;
  if (options?.preferSubtotal) {
    const subtotal = matches.find((i) => isLikelySubtotalRow(table, table.rows[i], labelIndex));
    if (subtotal !== undefined) return subtotal;
  }
  return matches[0];
}

// Cac dong "cap 2" (I, II, III...) cua 1 nhom - khoanh vung theo VI TRI (nam
// GIUA dong nhom (vd "A. Tai san ngan han") va dong nhom KE TIEP (vd "B. Tai
// san dai han") trong bang), KHONG theo khoang ma so co dinh nhu truoc (xem
// comment o validateBalanceSheetSubtotals ve ly do doi).
function childrenBetween(
  table: StatementTable,
  labelIndex: number,
  startIdx: number,
  endIdx: number
): (string | number | null)[][] {
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return [];
  return table.rows.slice(startIdx + 1, endIdx).filter((row) => isLikelySubtotalRow(table, row, labelIndex));
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
        message: `Khong tim thay muc con nao cua "${groupLabel}" (dong "cap 2" I/II/III...) - khong kiem tra duoc tong cac muc con.`,
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

// Nguyen tac ke toan bat buoc, KHONG con dua vao MA SO co dinh nhu truoc (bo
// 2026-07-08, phan hoi user): TT99/2025 chen them nhom "Tai san sinh hoc"
// lam DICH CHUYEN ma so tong tai san tu 270 (TT200) sang 280 (TT99) - te hon
// nua, ma so 270 CU lai trung voi ma so THAT SU cua 1 dong con khac trong
// TT99 ("VII. Tai san dai han khac") - da xac nhan qua OCR that tren BCTC
// IDV (mau TT99): findRowByCode(..., 270) tim NHAM sang dong con nay thay vi
// dong tong that (280), lam sai lech ca dang thuc "TS ngan han + TS dai han
// = Tong cong tai san" LAN "tong cac muc con cua TS dai han" (khoang ma so
// 200-270 cu vo tinh loai mat dong con thu 7 cua nhom, vi no NAM DUNG o bien
// tren 270). Doi sang tim theo TEN CHI TIEU (on dinh qua ca 2 thong tu, dung
// y het triet ly lib/analysis.ts da chon) + khoanh vung "cac dong con" theo
// VI TRI trong bang (xem childrenBetween) thay vi khoang ma so co dinh.
//   TS ngan han + TS dai han = Tong cong tai san
//   No phai tra + Von chu so huu = Tong cong nguon von
// Kiem tra sau hon (theo tung nhom): tong cac muc con cap 2 (I, II, III...)
// cua tung nhom co khop voi chinh dong tong cua nhom do khong - giup khoanh
// vung chinh xac nhom nao la nguon goc gay lech, thay vi chi biet "co lech
// dau do". Ca 2 dang thuc deu chay (khong chi khi cai kia that bai) vi day
// la 2 kiem tra doc lap, gio deu phai bao ro neu khong the thuc hien duoc
// (xem compareOrFlag/validateIdentity/validateChildrenSum).
function validateBalanceSheetSubtotals(table: StatementTable): ValidationIssue[] {
  const labelIndex = findLabelColumnIndex(table);
  const issues: ValidationIssue[] = [];

  const shortTermAssetsIdx = findRowIndex(table, labelIndex, (l) => l.includes('TAI SAN NGAN HAN') && !l.includes('KHAC'), {
    preferSubtotal: true,
  });
  const longTermAssetsIdx = findRowIndex(table, labelIndex, (l) => l.includes('TAI SAN DAI HAN') && !l.includes('KHAC'), {
    preferSubtotal: true,
  });
  const totalAssetsIdx = findRowIndex(table, labelIndex, (l) => l.includes('TONG CONG TAI SAN'));

  const shortTermAssets = shortTermAssetsIdx === -1 ? null : table.rows[shortTermAssetsIdx];
  const longTermAssets = longTermAssetsIdx === -1 ? null : table.rows[longTermAssetsIdx];
  const totalAssets = totalAssetsIdx === -1 ? null : table.rows[totalAssetsIdx];

  issues.push(
    ...validateIdentity(
      table,
      'TS ngan han',
      shortTermAssets,
      'TS dai han',
      longTermAssets,
      'Tong cong tai san',
      totalAssets,
      (col, a, b, total) => `"${col}": TS ngan han (${a}) + TS dai han (${b}) khong khop Tong cong tai san (${total})`
    )
  );
  issues.push(
    ...validateChildrenSum(table, 'TS ngan han', shortTermAssets, childrenBetween(table, labelIndex, shortTermAssetsIdx, longTermAssetsIdx))
  );
  issues.push(
    ...validateChildrenSum(table, 'TS dai han', longTermAssets, childrenBetween(table, labelIndex, longTermAssetsIdx, totalAssetsIdx))
  );
  // Sau hon 1 tang nua (2026-07-12, yeu cau nguoi dung): trong CHINH nhom "TS
  // ngan han"/"TS dai han" da biet ranh gioi o tren, kiem tra TIEP tung dong
  // "cap 1" (I./II...) co khop voi tong cac dong con CUA NO hay khong (xem
  // findBalanceSheetLevel2Mismatches) - khoanh vung sau hon nua neu co lech.
  issues.push(...groupSumMismatchesToIssues('balanceSheet', findBalanceSheetLevel2Mismatches(table, shortTermAssetsIdx, longTermAssetsIdx)));
  issues.push(...groupSumMismatchesToIssues('balanceSheet', findBalanceSheetLevel2Mismatches(table, longTermAssetsIdx, totalAssetsIdx)));

  const liabilitiesIdx = findRowIndex(table, labelIndex, (l) => l.includes('NO PHAI TRA'), { preferSubtotal: true });
  const equityIdx = findRowIndex(table, labelIndex, (l) => l.includes('VON CHU SO HUU'), { preferSubtotal: true });
  const totalCapitalIdx = findRowIndex(table, labelIndex, (l) => l.includes('TONG CONG NGUON VON'));

  const liabilities = liabilitiesIdx === -1 ? null : table.rows[liabilitiesIdx];
  const equity = equityIdx === -1 ? null : table.rows[equityIdx];
  const totalCapital = totalCapitalIdx === -1 ? null : table.rows[totalCapitalIdx];

  issues.push(
    ...validateIdentity(
      table,
      'No phai tra',
      liabilities,
      'Von chu so huu',
      equity,
      'Tong cong nguon von',
      totalCapital,
      (col, a, b, total) => `"${col}": No phai tra (${a}) + Von chu so huu (${b}) khong khop Tong cong nguon von (${total})`
    )
  );
  issues.push(...validateChildrenSum(table, 'No phai tra', liabilities, childrenBetween(table, labelIndex, liabilitiesIdx, equityIdx)));
  issues.push(...validateChildrenSum(table, 'Von chu so huu', equity, childrenBetween(table, labelIndex, equityIdx, totalCapitalIdx)));
  issues.push(...groupSumMismatchesToIssues('balanceSheet', findBalanceSheetLevel2Mismatches(table, liabilitiesIdx, equityIdx)));
  issues.push(...groupSumMismatchesToIssues('balanceSheet', findBalanceSheetLevel2Mismatches(table, equityIdx, totalCapitalIdx)));

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
export function findRevenueRow(table: StatementTable): (string | number | null)[] | null {
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

// Chuyen 1 danh sach GroupSumMismatch (statement-shared.ts, dung chung cho
// nhieu kieu kiem tra: nhom phang KQKD, ma so thap phan, cap1->cap2 BCDKT)
// thanh ValidationIssue - tranh lap lai cung 1 doan dung message o nhieu noi.
function groupSumMismatchesToIssues(table: 'balanceSheet' | 'incomeStatement', mismatches: GroupSumMismatch[]): ValidationIssue[] {
  return mismatches.map((m) => ({
    table,
    message: `"${m.columnName}": Tong cac dong con cua "${m.groupLabel}" (${m.sum}) khong khop chinh dong "${m.groupLabel}" (${m.reported}) - co the do OCR gop/bia dong, can xem tay.`,
  }));
}

// Kiem tra "tong cac chi tieu 01,02,03...= dong Cong .../Tong ..." cua CHINH
// nhom do trong KQKD - dung chung cho MOI loai hinh DN (khong rieng CTCK, xem
// findIncomeStatementGroupMismatches). Phat hien duoc loi OCR gop/bia dong
// (MBS Q2/2026, 2026-07-11) ma cac kiem tra VAS co dinh o tren (Loi nhuan gop
// = DT thuan - Gia von...) khong bat duoc vi khac cong thuc/khac chi tieu.
function validateIncomeStatementGroupSums(table: StatementTable): ValidationIssue[] {
  return groupSumMismatchesToIssues('incomeStatement', findIncomeStatementGroupMismatches(table));
}

// Ma so dang thap phan (X.Y, vd "111.1"/"111.2" la con cua "111") phai co
// tong khop voi CHINH dong cha (X) - dua HOAN TOAN vao cau truc ma so, KHONG
// phu thuoc ten tieng Viet, nen ap dung duoc CHUNG cho ca balanceSheet lan
// incomeStatement (2026-07-12, yeu cau nguoi dung mo rong kiem tra cheo "sau
// hon" - xem findDecimalCodeGroupMismatches).
function validateDecimalCodeGroupSums(table: StatementTable, tableName: 'balanceSheet' | 'incomeStatement'): ValidationIssue[] {
  return groupSumMismatchesToIssues(tableName, findDecimalCodeGroupMismatches(table));
}

// Kiem tra tinh nhat quan noi tai cua so lieu da trich - hoan toan cuc bo,
// khong goi AI, khong ton token. Dung de phat hien loi do OCR/AI doc nham so,
// vd truong hop tung gap: 1 chu so du/thieu lam lech ca chuc lan. NGUYEN TAC
// (2026-07-05): "khong kiem tra duoc" LUON duoc coi la 1 canh bao can bao ra,
// khong bao gio am tham tra ve "khong co van de gi" chi vi thieu du lieu de so
// sanh - xem comment chi tiet o compareOrFlag/validateIdentity/validateChildrenSum.
//
// validateBalanceSheetSubtotals() da TU GOI them findBalanceSheetLevel2Mismatches
// (cap1->cap2, vd "I. Tai san tai chinh" = tong cac dong 111-117) ngay ben
// trong no (can ranh gioi 4 nhom da tinh san o do) - khong goi lai o day de
// tranh trung lap.
export function validateFinancialStatements(statements: FinancialStatements): ValidationIssue[] {
  return [
    ...validateBalanceSheet(statements.balanceSheet),
    ...validateBalanceSheetSubtotals(statements.balanceSheet),
    ...validateDecimalCodeGroupSums(statements.balanceSheet, 'balanceSheet'),
    ...validateIncomeStatement(statements.incomeStatement),
    ...validateIncomeStatementTax(statements.incomeStatement),
    ...validateIncomeStatementGroupSums(statements.incomeStatement),
    ...validateDecimalCodeGroupSums(statements.incomeStatement, 'incomeStatement'),
  ];
}

// Gom TAT CA mismatch dang co cau truc (GroupSumMismatch, chua chuyen thanh
// chuoi ValidationIssue) tu ca 2 bang - dung CHUNG cho ca validateFinancialStatements
// (map thanh canh bao doc duoc o tren) LAN lib/export/financial-statements.ts
// (dem so luong de quyet dinh retry + khoanh vung o (rowIndex,columnIndex)
// "khong dang tin cay" cho lib/analysis.ts) - MOT nguon du lieu duy nhat,
// tranh tinh lai ranh gioi 4 nhom BCDKT 2 lan o 2 noi khac nhau.
export interface TaggedGroupSumMismatch extends GroupSumMismatch {
  table: 'balanceSheet' | 'incomeStatement';
}

export function findAllGroupSumMismatches(statements: FinancialStatements): TaggedGroupSumMismatch[] {
  const bs = statements.balanceSheet;
  const is = statements.incomeStatement;
  const labelIndex = findLabelColumnIndex(bs);

  const shortTermAssetsIdx = findRowIndex(bs, labelIndex, (l) => l.includes('TAI SAN NGAN HAN') && !l.includes('KHAC'), { preferSubtotal: true });
  const longTermAssetsIdx = findRowIndex(bs, labelIndex, (l) => l.includes('TAI SAN DAI HAN') && !l.includes('KHAC'), { preferSubtotal: true });
  const totalAssetsIdx = findRowIndex(bs, labelIndex, (l) => l.includes('TONG CONG TAI SAN'));
  const liabilitiesIdx = findRowIndex(bs, labelIndex, (l) => l.includes('NO PHAI TRA'), { preferSubtotal: true });
  const equityIdx = findRowIndex(bs, labelIndex, (l) => l.includes('VON CHU SO HUU'), { preferSubtotal: true });
  const totalCapitalIdx = findRowIndex(bs, labelIndex, (l) => l.includes('TONG CONG NGUON VON'));

  const tagBs = (m: GroupSumMismatch): TaggedGroupSumMismatch => ({ ...m, table: 'balanceSheet' });
  const tagIs = (m: GroupSumMismatch): TaggedGroupSumMismatch => ({ ...m, table: 'incomeStatement' });

  return [
    ...findBalanceSheetLevel2Mismatches(bs, shortTermAssetsIdx, longTermAssetsIdx).map(tagBs),
    ...findBalanceSheetLevel2Mismatches(bs, longTermAssetsIdx, totalAssetsIdx).map(tagBs),
    ...findBalanceSheetLevel2Mismatches(bs, liabilitiesIdx, equityIdx).map(tagBs),
    ...findBalanceSheetLevel2Mismatches(bs, equityIdx, totalCapitalIdx).map(tagBs),
    ...findDecimalCodeGroupMismatches(bs).map(tagBs),
    ...findIncomeStatementGroupMismatches(is).map(tagIs),
    ...findDecimalCodeGroupMismatches(is).map(tagIs),
  ];
}
