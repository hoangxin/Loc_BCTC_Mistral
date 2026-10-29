// Danh dau THU CONG cua nguoi dung (watchlist, "Luu y"/"Da xong", ghi chu,
// trang thai highlight tuy chinh) - kieu du lieu + phep GOP dung chung cho CA
// phia trinh duyet (app/WatchlistContext.tsx) lan phia server
// (app/api/report-marks).
//
// VI SAO CO FILE NAY (su co that 2026-10-27): truoc day toan bo danh dau chi
// song trong localStorage cua DUNG 1 trinh duyet. Nguoi dung mat >=90 danh dau
// lam trong 1 ngay vi 2 chuyen cong lai:
//   1. 1 tab mo tu truoc ghi de localStorage bang state cu cua no (da sua
//      rieng, xem WatchlistContext).
//   2. O dia C day 100% - Chrome TU DON du lieu localStorage cua website khi
//      may het cho, khong hoi, khong bao.
// Khong co ban sao nao o dau de khoi phuc. Nay danh dau duoc dong bo len
// chinh repo (qua GitHub API) nen con nguyen ke ca khi trinh duyet bi don,
// doi may hay doi trinh duyet.

// Moi muc deu kem DAU THOI GIAN de gop duoc 2 ban doc lap (2 tab, 2 may, hoac
// ban trinh duyet vs ban tren server) ma khong mat du lieu: ban MOI HON thang.
// value = null nghia la "da xoa" (tombstone) - phai giu lai, neu xoa han thi
// lan gop sau ban cu se "hoi sinh" muc da bo.
export interface MarkEntry<T> {
  value: T | null;
  at: number;
}

export type HighlightState = 'blink' | 'light' | 'off';
export type ReportMarkState = 'note' | 'done';

export interface MarksDoc {
  version: 1;
  updatedAt: string;
  codes: Record<string, MarkEntry<true>>;
  marks: Record<string, MarkEntry<ReportMarkState>>;
  notes: Record<string, MarkEntry<string>>;
  highlights: Record<string, MarkEntry<HighlightState>>;
}

export function emptyMarksDoc(): MarksDoc {
  return { version: 1, updatedAt: new Date(0).toISOString(), codes: {}, marks: {}, notes: {}, highlights: {} };
}

function mergeSection<T>(a: Record<string, MarkEntry<T>>, b: Record<string, MarkEntry<T>>): Record<string, MarkEntry<T>> {
  const out: Record<string, MarkEntry<T>> = { ...a };
  for (const [key, entry] of Object.entries(b)) {
    const current = out[key];
    // Bang diem thi uu tien ban dang co GIA TRI hon tombstone - tranh truong
    // hop du lieu cu (at = 0, vd ban nhap tu file sao luu) xoa nham muc moi.
    if (!current || entry.at > current.at || (entry.at === current.at && current.value === null && entry.value !== null)) {
      out[key] = entry;
    }
  }
  return out;
}

// GOP 2 ban: khong ben nao de len ben nao ca ban - tung MUC mot, ban moi hon
// thang. Nho vay 2 tab/2 may dong bo lech nhau van cong don dung.
export function mergeMarksDocs(a: MarksDoc, b: MarksDoc): MarksDoc {
  return {
    version: 1,
    updatedAt: new Date(Math.max(Date.parse(a.updatedAt) || 0, Date.parse(b.updatedAt) || 0)).toISOString(),
    codes: mergeSection(a.codes, b.codes),
    marks: mergeSection(a.marks, b.marks),
    notes: mergeSection(a.notes, b.notes),
    highlights: mergeSection(a.highlights, b.highlights),
  };
}

// So sanh NOI DUNG 2 ban, BO QUA `updatedAt`.
//
// VI SAO CAN (su co that 2026-10-29): phia server truoc day luon ghi lai
// updatedAt = thoi diem hien tai truoc khi gop, nen file JSON LUON khac ban
// tren repo du nguoi dung khong doi danh dau nao - GitHub tao commit moi moi
// lan, va moi commit do lai keo theo 1 lan build Vercel. 428 commit trong
// ngay 2026-10-28, gan het chi doi dung 1 dong updatedAt, da dot het han muc
// deployment cua Vercel; den luc GitHub Actions push ket qua BCTC that thi
// Vercel tu choi build ("Deployment rate limited - retry in 24 hours") nen
// web dung so lieu cu. Dung ham nay de khong commit khi khong co gi doi.
export function sameMarksContent(a: MarksDoc, b: MarksDoc): boolean {
  return canonicalContent(a) === canonicalContent(b);
}

function canonicalContent(doc: MarksDoc): string {
  // Sap xep khoa truoc khi so: thu tu khoa trong JSON phu thuoc thu tu ghi,
  // khong phai noi dung - 2 ban cung du lieu van ra 2 chuoi khac nhau neu so
  // tho. Giu ca `at` vi do la thu quyet dinh ben nao thang khi gop.
  const section = <T>(record: Record<string, MarkEntry<T>>): unknown[] =>
    Object.keys(record)
      .sort()
      .map((key) => [key, record[key].value, record[key].at]);
  return JSON.stringify([section(doc.codes), section(doc.marks), section(doc.notes), section(doc.highlights)]);
}

// Dang cu trong localStorage (khong co dau thoi gian) - quy doi voi at = 0 de
// ban nao CO dau thoi gian cung thang, nhung van khong mat du lieu cu.
export interface LegacyStoredState {
  codes: string[];
  highlightOverrides: [string, HighlightState][];
  reportMarks: [string, ReportMarkState][];
  reportNotes: [string, string][];
}

export function fromLegacyState(state: LegacyStoredState, at = 0): MarksDoc {
  const doc = emptyMarksDoc();
  for (const code of state.codes ?? []) doc.codes[code] = { value: true, at };
  for (const [key, value] of state.highlightOverrides ?? []) doc.highlights[key] = { value, at };
  for (const [key, value] of state.reportMarks ?? []) doc.marks[key] = { value, at };
  for (const [key, value] of state.reportNotes ?? []) doc.notes[key] = { value, at };
  return doc;
}

export function toLegacyState(doc: MarksDoc): LegacyStoredState {
  const live = <T>(section: Record<string, MarkEntry<T>>): [string, T][] =>
    Object.entries(section)
      .filter(([, e]) => e.value !== null)
      .map(([k, e]) => [k, e.value as T]);
  return {
    codes: live(doc.codes).map(([code]) => code),
    highlightOverrides: live(doc.highlights),
    reportMarks: live(doc.marks),
    reportNotes: live(doc.notes),
  };
}

export function isMarksDoc(value: unknown): value is MarksDoc {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<MarksDoc>;
  return v.version === 1 && !!v.codes && !!v.marks && !!v.notes && !!v.highlights;
}
