'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  emptyMarksDoc,
  fromLegacyState,
  isMarksDoc,
  mergeMarksDocs,
  toLegacyState,
  type MarksDoc,
  type HighlightState as SharedHighlightState,
  type ReportMarkState as SharedReportMarkState,
} from '@/lib/report-marks';

const STORAGE_KEY = 'bctc-watchlist-v1';
// Ban DOC day du (kem dau thoi gian tung muc) dung de dong bo len server -
// giu RIENG khoi STORAGE_KEY de ban cu van doc duoc neu phai lui code.
const DOC_STORAGE_KEY = 'bctc-watchlist-doc-v1';
// Cho lang 1 nhip roi moi day len server: nguoi dung thuong tick lien tay
// nhieu o, khong can moi tick 1 lan ghi repo.
const SYNC_DEBOUNCE_MS = 4000;

// 3 trang thai 1 o chi tieu dang highlight co the dung (yeu cau nguoi dung
// 2026-07-18): 'blink' = vang dam + nhap nhay (tier level2 tu nhien), 'light'
// = vang nhat khong nhap nhay (tier level1 tu nhien), 'off' = tat han, tro ve
// giao dien binh thuong khong mau. Nguoi dung co the chuyen QUA LAI ca 3 trang
// thai nay bat ke tier goc la gi (vd 1 o level1 van bam len duoc 'blink').
export type HighlightState = SharedHighlightState;

// Danh dau THU CONG o o Ma CK (yeu cau nguoi dung 2026-07-25) - truoc day chi
// co 1 trang thai boolean "da doc" (bôi xam). Nay them "Luu y" (bôi vang) ben
// canh "Da xong" (bôi xam nhu cu), chon 1 trong 2 qua popup xac nhan giong
// pattern MuteableHighlightCell. undefined = chua danh dau gi.
export type ReportMarkState = SharedReportMarkState;

interface StoredState {
  codes: string[];
  highlightOverrides: [string, HighlightState][];
  // Danh dau THU CONG theo tung bao cao - key la filePath (giong highlightKey,
  // KHONG phai stockCode: 1 ma CK co the co nhieu bao cao/ky doc lap nhau,
  // danh dau rieng tung cai). Truong MOI (2026-07-25), thay the readFilePaths
  // (boolean "da doc") bang trang thai co 2 gia tri (note/done).
  reportMarks: [string, ReportMarkState][];
  // Noi dung ghi chu cho lua chon "Lưu ý" (yeu cau nguoi dung 2026-07-29) -
  // nhap qua popup luc chon "Lưu ý" (xem NoteModal, ReportsSummaryTable.tsx),
  // hien lai qua tooltip hover o Ma CK. Key giong reportMarks (filePath), luu
  // TACH RIENG khoi reportMarks (khong xoa khi bo danh dau, de gia tri cu con
  // do neu nguoi dung danh dau "Lưu ý" lai sau nay).
  reportNotes: [string, string][];
}

// SUA 2026-10-27 (su co that, nguoi dung mat >=90 danh dau chi trong 1 ngay):
// khi KHONG doc duoc du lieu da luu (JSON hong), ban cu bi coi nhu "chua co gi"
// roi lan ghi ke tiep DE LUON len tren - mat vinh vien, khong cach nao cuu.
// Nay giu lai nguyen van ban khong doc duoc sang 1 khoa rieng truoc khi tiep
// tuc, de con co cai ma phuc hoi thu cong.
function backupUnreadableState(raw: string) {
  try {
    window.localStorage.setItem(`${STORAGE_KEY}-loi-${new Date().toISOString().slice(0, 19)}`, raw);
  } catch {
    // het cho luu thi thoi - khong duoc nem loi lam hong ca Provider
  }
}

function loadStored(): StoredState {
  const empty: StoredState = { codes: [], highlightOverrides: [], reportMarks: [], reportNotes: [] };
  if (typeof window === 'undefined') return empty;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  try {
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    const reportMarks: [string, ReportMarkState][] = Array.isArray(parsed.reportMarks)
      ? parsed.reportMarks
      : // Du lieu cu (truoc 2026-07-25) chi co readFilePaths: string[] (boolean
        // "da doc xong") - quy doi moi filePath trong do thanh trang thai 'done'
        // de khong mat danh dau cu cua nguoi dung khi nang cap.
        Array.isArray(parsed.readFilePaths)
        ? parsed.readFilePaths.map((filePath: string): [string, ReportMarkState] => [filePath, 'done'])
        : [];
    return {
      codes: Array.isArray(parsed.codes) ? parsed.codes : [],
      highlightOverrides: Array.isArray(parsed.highlightOverrides) ? parsed.highlightOverrides : [],
      reportMarks,
      reportNotes: Array.isArray(parsed.reportNotes) ? parsed.reportNotes : [],
    };
  } catch {
    if (raw) backupUnreadableState(raw);
    return empty;
  }
}

// Ap 1 THAY DOI len ban DANG NAM TRONG localStorage (doc - sua - ghi), thay vi
// ghi de bang toan bo state trong RAM cua tab nay.
//
// SUA 2026-10-27 - DAY LA NGUYEN NHAN su co mat danh dau: truoc day moi lan
// state doi, 1 useEffect ghi TRON VEN state cua tab hien tai de len localStorage,
// con localStorage chi duoc DOC DUNG 1 LAN luc mo tab. Chi can mo app o 2 tab
// (hoac 1 tab de quen tu hom truoc) la du mat du lieu: tab A mo luc sang (doc
// duoc 0 danh dau), nguoi dung danh dau 90 ma o tab B (localStorage = 90), quay
// lai tab A tick THEM 1 o bat ky -> tab A ghi de state cua rieng no (1 danh
// dau) -> 89 danh dau cua tab B bien mat, khong canh bao gi. Khop dung voi hien
// tuong da gap: reportMarks tut ve 32 trong khi highlightOverrides van con 167
// (nhung highlight von da co san trong RAM cua tab ghi de).
//
// Doc - sua - ghi khien thay doi cua 2 tab cong don len nhau, va viec XOA
// (bo tick) van hoat dong vi no la 1 thay doi co chu dich tren dung khoa do.
// Ban DOC (kem dau thoi gian) nam song song voi ban cu: ban cu de giao dien
// doc nhanh, ban doc de GOP voi server/may khac ma khong mat du lieu.
function loadDoc(): MarksDoc {
  if (typeof window === 'undefined') return emptyMarksDoc();
  try {
    const raw = window.localStorage.getItem(DOC_STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (isMarksDoc(parsed)) return parsed;
    }
  } catch {
    // doc hong thi dung ban cu dung lai o duoi
  }
  // Chua co ban doc (lan dau sau khi nang cap): dung lai ban cu, dau thoi gian
  // 0 de bat ky thay doi moi nao cung thang khi gop.
  return fromLegacyState(loadStored(), 0);
}

function saveDoc(doc: MarksDoc) {
  try {
    window.localStorage.setItem(DOC_STORAGE_KEY, JSON.stringify(doc));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toLegacyState(doc)));
  } catch (error) {
    console.error('Khong luu duoc danh dau vao localStorage', error);
  }
}

interface WatchlistContextValue {
  watchlist: Set<string>;
  isWatched: (code: string) => boolean;
  addToWatchlist: (code: string) => void;
  removeFromWatchlist: (code: string) => void;
  // undefined = chua tung doi - dung tier tu nhien cua o (level1/level2).
  getHighlightOverride: (key: string) => HighlightState | undefined;
  setHighlightOverride: (key: string, state: HighlightState) => void;
  // Danh dau THU CONG theo filePath (yeu cau nguoi dung 2026-07-22, mo rong
  // 2026-07-25 tu boolean sang 2 trang thai) - CHI luu tick THU CONG cua nguoi
  // dung, khong lien quan gi den warnings/du lieu OCR - hoan toan client-local
  // (localStorage), khong dong bo len server. undefined = chua danh dau gi.
  getReportMark: (filePath: string) => ReportMarkState | undefined;
  // state = null xoa danh dau (ve trang thai chua danh dau).
  setReportMark: (filePath: string, state: ReportMarkState | null) => void;
  // Ghi chu cho lua chon "Lưu ý" (yeu cau nguoi dung 2026-07-29) - xem
  // reportNotes o StoredState tren cho ly do tach rieng khoi reportMarks.
  getReportNote: (filePath: string) => string | undefined;
  setReportNote: (filePath: string, note: string) => void;
  // Dong bo len repo + xuat/nhap file sao luu (them 2026-10-27, xem
  // lib/report-marks.ts). syncState de giao dien noi ro dang o trang thai nao -
  // nguoi dung PHAI thay duoc danh dau da len server hay chua.
  syncState: SyncState;
  syncNow: () => Promise<void>;
  exportToFile: () => void;
  importFromFile: (file: File) => Promise<{ ok: boolean; message: string }>;
}

export type SyncState =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'saved'; at: number }
  | { kind: 'error'; message: string };

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

// Watchlist + trang thai highlight tuy chinh (yeu cau nguoi dung 2026-07-18) -
// Provider dat o app/Tabs.tsx (goc chung CA tab "Chon bao cao loc" lan "Ket
// qua", khong unmount khi doi tab/sub-tab nao) de watchlist tao o 1 tab tu
// dong dong bo MOI noi ma khong can prop-drilling qua tung tang. Kem
// localStorage de khong mat khi F5/reload (vd sau khi bam "Xoá kết quả" goi
// window.location.reload()).
export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [codes, setCodes] = useState<Set<string>>(() => new Set());
  const [overrides, setOverrides] = useState<Map<string, HighlightState>>(() => new Map());
  const [reportMarks, setReportMarks] = useState<Map<string, ReportMarkState>>(() => new Map());
  const [reportNotes, setReportNotes] = useState<Map<string, string>>(() => new Map());
  // Khong con co "hydrated" nua: truoc day no la chot chan duy nhat ngan buoc
  // ghi-de-toan-bo ghi state RONG len du lieu that. Nay moi thay doi deu di qua
  // applyDocChange (doc - sua - ghi), khong con buoc ghi de nao de ma chan.
  useEffect(() => {
    const stored = toLegacyState(loadDoc());
    setCodes(new Set(stored.codes));
    setOverrides(new Map(stored.highlightOverrides));
    setReportMarks(new Map(stored.reportMarks));
    setReportNotes(new Map(stored.reportNotes));
  }, []);

  // Dong bo GIUA CAC TAB: tab khac ghi thi tab nay doc lai ngay, de RAM khong
  // con om 1 ban cu roi hieu nham la "trang thai that". Su kien 'storage' chi
  // ban o CAC TAB KHAC (khong ban o chinh tab vua ghi) - dung nhu can.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== STORAGE_KEY && event.key !== DOC_STORAGE_KEY) return;
      const stored = toLegacyState(loadDoc());
      setCodes(new Set(stored.codes));
      setOverrides(new Map(stored.highlightOverrides));
      setReportMarks(new Map(stored.reportMarks));
      setReportNotes(new Map(stored.reportNotes));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Trinh duyet co the DON localStorage cua 1 trang web khi may het cho (du
  // nguoi dung khong xoa gi) - xin giu lai lau dai de giam rui ro do. Khong
  // dam bao 100%, nen van can duong luu ngoai trinh duyet.
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => undefined);
  }, []);

  const [syncState, setSyncState] = useState<SyncState>({ kind: 'idle' });
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyDoc = useCallback((doc: MarksDoc) => {
    saveDoc(doc);
    const legacy = toLegacyState(doc);
    setCodes(new Set(legacy.codes));
    setOverrides(new Map(legacy.highlightOverrides));
    setReportMarks(new Map(legacy.reportMarks));
    setReportNotes(new Map(legacy.reportNotes));
  }, []);

  // Day ban doc hien tai len server roi GOP ban server tra ve - 2 chieu trong
  // 1 lan goi, nen may khac danh dau gi cung ve day du.
  const syncNow = useCallback(async () => {
    setSyncState({ kind: 'syncing' });
    try {
      const response = await fetch('/api/report-marks', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(loadDoc()),
      });
      const data = (await response.json()) as { ok?: boolean; doc?: unknown; error?: string };
      if (!response.ok || !data.ok || !isMarksDoc(data.doc)) {
        setSyncState({ kind: 'error', message: data.error ?? `Lỗi ${response.status}` });
        return;
      }
      applyDoc(mergeMarksDocs(loadDoc(), data.doc));
      setSyncState({ kind: 'saved', at: Date.now() });
    } catch (error) {
      setSyncState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, [applyDoc]);

  const scheduleSync = useCallback(() => {
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void syncNow(), SYNC_DEBOUNCE_MS);
  }, [syncNow]);

  // Luc mo app: keo ban tren server ve va GOP (khong de len) - mo o may khac
  // hoac sau khi trinh duyet bi don du lieu thi danh dau van tro lai day du.
  useEffect(() => {
    let huy = false;
    (async () => {
      try {
        const response = await fetch('/api/report-marks', { cache: 'no-store' });
        const data = (await response.json()) as { ok?: boolean; doc?: unknown };
        if (huy || !response.ok || !data.ok || !isMarksDoc(data.doc)) return;
        const merged = mergeMarksDocs(loadDoc(), data.doc);
        applyDoc(merged);
        // Ban dia phuong co the dang co muc ma server chua biet (vd danh dau
        // luc mat mang) - day nguoc len luon cho khoi lech.
        scheduleSync();
      } catch {
        // khong co mang/server chua cau hinh token: van chay binh thuong voi
        // ban trong trinh duyet, chi la chua co ban du phong tren repo
      }
    })();
    return () => {
      huy = true;
    };
  }, [applyDoc, scheduleSync]);

  // Ghi 1 thay doi vao ban doc (kem dau thoi gian) + hen dong bo len server.
  const applyDocChange = useCallback(
    (apply: (doc: MarksDoc) => MarksDoc) => {
      applyDoc(apply(loadDoc()));
      scheduleSync();
    },
    [applyDoc, scheduleSync]
  );

  const exportToFile = useCallback(() => {
    const blob = new Blob([JSON.stringify(loadDoc(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bctc-danh-dau-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, []);

  const importFromFile = useCallback(
    async (file: File): Promise<{ ok: boolean; message: string }> => {
      try {
        const text = await file.text();
        const parsed: unknown = JSON.parse(text);
        // Nhan CA ban xuat moi (co dau thoi gian) LAN ban sao luu thu cong cua
        // localStorage kieu cu - ban cu vao voi dau thoi gian 0 nen khong de
        // mat nhung gi dang co.
        const incoming = isMarksDoc(parsed)
          ? parsed
          : fromLegacyState(parsed as StoredState, 0);
        const merged = mergeMarksDocs(loadDoc(), incoming);
        applyDoc(merged);
        scheduleSync();
        const legacy = toLegacyState(merged);
        return {
          ok: true,
          message: `Đã nhập: ${legacy.reportMarks.length} đánh dấu, ${legacy.reportNotes.length} ghi chú, ${legacy.highlightOverrides.length} ô tô màu, ${legacy.codes.length} mã theo dõi.`,
        };
      } catch (error) {
        return { ok: false, message: `Không đọc được file: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
    [applyDoc, scheduleSync]
  );

  // Moi thay doi deu ghi kem DAU THOI GIAN (xem MarkEntry) - do la thu cho
  // phep gop 2 ban tu 2 tab/2 may ma khong ben nao de mat ben nao.
  const addToWatchlist = useCallback(
    (code: string) => {
      const normalized = code.trim().toUpperCase();
      if (!normalized) return;
      applyDocChange((doc) => ({ ...doc, codes: { ...doc.codes, [normalized]: { value: true, at: Date.now() } } }));
    },
    [applyDocChange]
  );

  const removeFromWatchlist = useCallback(
    (code: string) => {
      applyDocChange((doc) => ({ ...doc, codes: { ...doc.codes, [code]: { value: null, at: Date.now() } } }));
    },
    [applyDocChange]
  );

  const setHighlightOverride = useCallback(
    (key: string, state: HighlightState) => {
      applyDocChange((doc) => ({ ...doc, highlights: { ...doc.highlights, [key]: { value: state, at: Date.now() } } }));
    },
    [applyDocChange]
  );

  const setReportMark = useCallback(
    (filePath: string, state: ReportMarkState | null) => {
      applyDocChange((doc) => ({ ...doc, marks: { ...doc.marks, [filePath]: { value: state, at: Date.now() } } }));
    },
    [applyDocChange]
  );

  const setReportNote = useCallback(
    (filePath: string, note: string) => {
      applyDocChange((doc) => ({ ...doc, notes: { ...doc.notes, [filePath]: { value: note, at: Date.now() } } }));
    },
    [applyDocChange]
  );

  const value = useMemo<WatchlistContextValue>(
    () => ({
      watchlist: codes,
      isWatched: (code: string) => codes.has((code ?? '').toUpperCase()),
      addToWatchlist,
      removeFromWatchlist,
      getHighlightOverride: (key: string) => overrides.get(key),
      setHighlightOverride,
      getReportMark: (filePath: string) => reportMarks.get(filePath),
      getReportNote: (filePath: string) => reportNotes.get(filePath),
      setReportNote,
      setReportMark,
      syncState,
      syncNow,
      exportToFile,
      importFromFile,
    }),
    [
      codes,
      overrides,
      reportMarks,
      reportNotes,
      addToWatchlist,
      removeFromWatchlist,
      setHighlightOverride,
      setReportMark,
      setReportNote,
      syncState,
      syncNow,
      exportToFile,
      importFromFile,
    ],
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider');
  return ctx;
}
