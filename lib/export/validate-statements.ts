import type { FinancialStatements, StatementTable } from './financial-statements';
import type { BusinessType } from '../business-type';
import {
  normalizeLabelText as normalizeLabel,
  findLabelColumnIndex as findLabelColumnIndexOnColumns,
  valueColumnIndexes,
  findMaSoColumnIndex,
  parseCode,
  findRowByCode,
  isLikelySubtotalRow,
  isDuplicateKnownBalanceSheetLevel1Row,
  hasReliableSubtotalSignal,
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
  // Khong co tin hieu dang tin cay nao (xem hasReliableSubtotalSignal) - BO
  // QUA thay vi doan (co the sai) - tra ve [] cho validateChildrenSum bao
  // "khong tim thay muc con" (that tha "khong kiem tra duoc"), an toan hon la
  // ep isLikelySubtotalRow tra loi khi khong co du du lieu.
  if (!hasReliableSubtotalSignal(table, labelIndex)) return [];
  const result: (string | number | null)[][] = [];
  for (let i = startIdx + 1; i < endIdx; i++) {
    const row = table.rows[i];
    if (!isLikelySubtotalRow(table, row, labelIndex)) continue;
    // Dong con lap lai y het ten nhom cha (vd "Hang ton kho" khi chi co 1 muc
    // con) - loai de tranh dem 2 lan (xem isDuplicateKnownBalanceSheetLevel1Row).
    if (isDuplicateKnownBalanceSheetLevel1Row(table, labelIndex, startIdx + 1, i)) continue;
    result.push(row);
  }
  return result;
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

// Dong "Tong cong tai san"/"Tong cong nguon von" doi ten theo TUNG mau bieu
// (DN thuong/CTCK/Ngan hang) - da xac nhan qua doi chieu that (2026-07-12):
// TCB/HDB (Mau B02a/TCTD-HN, Thong tu 49/2014) ghi "TONG TAI SAN CO" (khong
// co chu "CONG") va "TONG NO PHAI TRA VA VON CHU SO HUU" (khong phai "NGUON
// VON"); SHS (Mau B01-CTCK) ghi "TONG CONG NO VA VON CHU SO HUU" (thieu chu
// "PHAI TRA" so voi ban Ngan hang). TRUOC KHI them cac bien the nay, ca 2
// loai bao cao deu bi bao SAI "khong tim thay dong Tong cong..." tren MOI
// bao cao (khong phai loi rieng le) du du lieu van parse dung va hien du
// trong Excel (classifyTableByContent dung marker linh hoat hon, khong bi
// anh huong) - CHI rieng validateBalanceSheet/validateBalanceSheetSubtotals/
// findAllGroupSumMismatches dung chuoi cung nhac nen moi bi.
function isTotalAssetsLabel(label: string): boolean {
  // 'TONG TAI SAN' (khong "CONG", khong "CO") - xac nhan them qua MBS Q2/2026
  // (Mau B01-CTCK): "TONG TAI SAN (270 = 100 + 200)". Luu y day la BIEN THE
  // THU 3, khac ca 2 bien the CTCK/Ngan hang da co - cung 1 loai hinh doanh
  // nghiep (CTCK) van co the dung tu ngu khac nhau giua cac cong ty
  // (SHS ghi "TONG CONG TAI SAN" nhu DN thuong, MBS ghi "TONG TAI SAN" tron).
  return label.includes('TONG CONG TAI SAN') || label.includes('TONG TAI SAN CO') || label.includes('TONG TAI SAN');
}

function isTotalCapitalLabel(label: string): boolean {
  return (
    label.includes('TONG CONG NGUON VON') ||
    label.includes('TONG CONG NO VA VON CHU SO HUU') ||
    label.includes('TONG NO PHAI TRA VA VON CHU SO HUU')
  );
}

// Nguyen tac ke toan bat buoc dung voi MOI bang can doi ke toan, khong phu
// thuoc tung cong ty: Tong cong tai san = Tong cong nguon von. Day la dang
// thuc toan hoc chu khong phai AI doan - lech nghia la co it nhat 1 o so bi
// trich/OCR sai o dau do.
function validateBalanceSheet(table: StatementTable): ValidationIssue[] {
  const assetsRow = findRow(table, isTotalAssetsLabel);
  const capitalRow = findRow(table, isTotalCapitalLabel);
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
  const totalAssetsIdx = findRowIndex(table, labelIndex, isTotalAssetsLabel);

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
  // BO buoc "sau hon 1 tang" o day (tung dua vao findBalanceSheetLevel2Mismatches
  // de kiem tra tung dong "cap 1" (I./II...) co khop tong cac dong con CUA NO
  // hay khong) - GIAM DO SAU theo yeu cau nguoi dung (2026-07-12, sau khi thay
  // di sau qua de gay hoi quy qua lai giua cac dinh dang bang khac nhau, xem
  // hasReliableSubtotalSignal): CHI can dam bao "TS ngan han = tong cac dong
  // cap 1 cua no" (validateChildrenSum o tren) - KHONG can kiem tra tiep tung
  // dong cap 1 do (vd "I. Tai san tai chinh") co tu cong dung NOI BO no hay
  // khong (vd "ton kho" khong can kiem tra cac dong con cua chinh no). Van
  // giu findBalanceSheetLevel2Mismatches cho findAllGroupSumMismatches (goi
  // rieng o duoi, dung cho co che retry OCR + co "khong dang tin cay" tren
  // UI - muc dich khac, chua doi pham vi o day).

  const liabilitiesIdx = findRowIndex(table, labelIndex, (l) => l.includes('NO PHAI TRA'), { preferSubtotal: true });
  const equityIdx = findRowIndex(table, labelIndex, (l) => l.includes('VON CHU SO HUU'), { preferSubtotal: true });
  const totalCapitalIdx = findRowIndex(table, labelIndex, isTotalCapitalLabel);

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
//
// SUA 2026-07-12 (xac nhan qua HDB/VCB that): mot so bao cao (dac biet Ngan
// hang) in CA 2 dong CHI TIET ("Chi phi thue TNDN hien hanh", "Thu nhap/(Chi
// phi) thue TNDN hoan lai") LAN 1 dong TONG da cong san ("Chi phi thue TNDN",
// khong co hau to "hien hanh"/"hoan lai") - findRows(...'CHI PHI THUE') khop
// CA dong chi tiet "hien hanh" LAN dong tong, sumRows() cong ca 2 lai thanh
// GAP DOI gia tri thue that (da xac nhan qua so: HDB dong tong = -1.205.194,
// nhung code cu tinh duoc -2.437.195 = tong sai do cong them dong chi tiet
// -1.232.001 mot lan nua). Uu tien dong TONG (nhan KHONG chua "hien
// hanh"/"hoan lai") neu co - chi fallback ve cong don cac dong chi tiet khi
// KHONG co dong tong rieng (bao cao chi in 2 dong chi tiet, khong co dong
// gop).
function findIncomeTaxRows(table: StatementTable): (string | number | null)[][] {
  const isDetailRow = (label: string) => label.includes('HIEN HANH') || label.includes('HOAN LAI');
  const totalRow = findRow(table, (label) => label.includes('CHI PHI THUE') && !isDetailRow(label));
  if (totalRow) return [totalRow];
  return findRows(table, (label) => label.includes('CHI PHI THUE') || (label.includes('THUE TNDN') && isDetailRow(label)));
}

function validateIncomeStatementTax(table: StatementTable): ValidationIssue[] {
  const beforeTaxRow = findRow(table, (label) => label.includes('TRUOC THUE'));
  const taxRows = findIncomeTaxRows(table);
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
      // Dung Math.abs(tax) - xac nhan qua HDB/VCB/TPB/TCB/BVH that (2026-07-12):
      // "Chi phi thue TNDN" co the in AM (vd HDB "-1.205.194", dung quy uoc
      // dau am = khoan giam tru, cong THANG vao loi nhuan) HOAC DUONG (vd TIX
      // "9.256.950.792", dung quy uoc la SO TRU, cong thuc ghi ro "60=50-51-52")
      // tuy tung cong ty/mau bieu - cong thuc cu "beforeTax - tax" GIA DINH
      // tax luon la SO DUONG can tru, nen khi tax am (HDB) thi tru so am =
      // CONG THEM, sai gap doi (6.107.334 - (-1.205.194) = 7.312.528, trong
      // khi LNST that = 4.902.140 = 6.107.334 + (-1.205.194)). Lay tri tuyet
      // doi truoc khi tru xu ly duoc CA 2 quy uoc dau, vi "chi phi thue" luon
      // mang y nghia GIAM loi nhuan (tru truong hop hiem duoc loi thue rong,
      // chua gap trong du lieu that nao ca).
      const taxMagnitude = Math.abs(tax);
      if (!numbersClose(beforeTax - taxMagnitude, afterTax)) {
        issues.push({
          table: 'incomeStatement',
          message: `"${columnName}": Loi nhuan sau thue (${afterTax}) khong khop Loi nhuan truoc thue - Chi phi thue TNDN (${beforeTax - taxMagnitude})`,
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
// CAP NHAT 2026-07-12 (yeu cau nguoi dung, sau khi TCB/cac bao cao Ngan hang
// bi bao HANG LOAT canh bao "khong tim thay dong..." vi cac chi tieu KHONG
// TON TAI o loai hinh do, khong phai loi OCR/parse): ham nay TRUOC DAY khong
// biet businessType, luon chay HET moi kiem tra cho MOI bao cao - 2 kiem tra
// duoi day KHONG PHAI universal, phai bo qua dung loai hinh:
// - validateBalanceSheetSubtotals (TS ngan han + TS dai han = Tong TS): Ngan
//   hang KHONG chia tai san theo ngan han/dai han (xac nhan qua HDB/VCB that
//   - BCDKT ngan hang liet ke theo loai tai san: tien mat, tien gui SBV, cho
//   vay TCTD khac..., khong co "A. TAI SAN NGAN HAN"/"B. TAI SAN DAI HAN" nao
//   ca) - kiem tra nay LUON that bai voi ngan hang, khong phai loi. CTCK/DN
//   thuong/Bao hiem VAN co cau truc nay (xac nhan qua SHS that) nen van chay.
// - validateIncomeStatement (Loi nhuan gop = Doanh thu thuan - Gia von hang
//   ban): CHI ap dung cho DN thuong (ban hang hoa/dich vu that) - Ngan
//   hang/CTCK/Bao hiem khong co khai niem "gia von hang ban" (Ngan hang co
//   thu nhap lai, CTCK co lai/lo tai san tai chinh, Bao hiem co phi bao
//   hiem...) nen luon "khong tim thay dong Gia von hang ban", khong phai loi.
// "Khong kiem tra duoc" (thieu du lieu/tin hieu, xem hasReliableSubtotalSignal)
// LA MOT LOAI CANH BAO KHAC HAN "phat hien so lieu sai lech" - dong dau la
// THONG BAO TRUNG THUC (khong doan bua), dong sau la KET QUA THAT SU cua 1
// phep cong. Gop rieng vi 1 bao cao co the ra 6-9 dong loai dau (moi dong cho
// 1 chi tieu khac nhau khong tim thay) - yeu cau nguoi dung 2026-07-12: gop
// lai thanh 1 DONG DUY NHAT/bao cao (thay vi liet ke tung dong rac roi) VA
// hien thi MO HON tren UI (xem "KHONG DU TIN HIEU:" prefix, doi chieu voi
// app/ReportsSummaryTable.tsx doc prefix nay de chon mau nhat hon).
function isCannotVerifyMessage(message: string): boolean {
  return message.startsWith('Khong tim thay') || message.includes('khong phai dang so hop le');
}

export function validateFinancialStatements(statements: FinancialStatements, businessType: BusinessType): ValidationIssue[] {
  const rawIssues = [
    ...validateBalanceSheet(statements.balanceSheet),
    ...(businessType === 'bank' ? [] : validateBalanceSheetSubtotals(statements.balanceSheet)),
    ...validateDecimalCodeGroupSums(statements.balanceSheet, 'balanceSheet'),
    ...(businessType === 'other' ? validateIncomeStatement(statements.incomeStatement) : []),
    ...validateIncomeStatementTax(statements.incomeStatement),
    ...validateIncomeStatementGroupSums(statements.incomeStatement),
    ...validateDecimalCodeGroupSums(statements.incomeStatement, 'incomeStatement'),
  ];

  const realIssues = rawIssues.filter((i) => !isCannotVerifyMessage(i.message));
  const cannotVerifyIssues = rawIssues.filter((i) => isCannotVerifyMessage(i.message));
  if (cannotVerifyIssues.length === 0) return realIssues;

  const balanceSheetCount = cannotVerifyIssues.filter((i) => i.table === 'balanceSheet').length;
  const incomeStatementCount = cannotVerifyIssues.filter((i) => i.table === 'incomeStatement').length;
  const parts = [
    balanceSheetCount > 0 ? `${balanceSheetCount} muc trong BCDKT` : null,
    incomeStatementCount > 0 ? `${incomeStatementCount} muc trong KQKD` : null,
  ].filter((p): p is string => !!p);
  const collapsed: ValidationIssue = {
    table: 'balanceSheet',
    message: `KHONG DU TIN HIEU: khong kiem tra cheo sau duoc ${parts.join(', ')} (thieu ten dong hoac cau truc bang khong ro rang) - khong phai loi, chi la khong du du lieu de xac minh.`,
  };
  return [...realIssues, collapsed];
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
  const totalAssetsIdx = findRowIndex(bs, labelIndex, isTotalAssetsLabel);
  const liabilitiesIdx = findRowIndex(bs, labelIndex, (l) => l.includes('NO PHAI TRA'), { preferSubtotal: true });
  const equityIdx = findRowIndex(bs, labelIndex, (l) => l.includes('VON CHU SO HUU'), { preferSubtotal: true });
  const totalCapitalIdx = findRowIndex(bs, labelIndex, isTotalCapitalLabel);

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
