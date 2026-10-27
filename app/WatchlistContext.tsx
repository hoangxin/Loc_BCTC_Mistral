'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'bctc-watchlist-v1';

// 3 trang thai 1 o chi tieu dang highlight co the dung (yeu cau nguoi dung
// 2026-07-18): 'blink' = vang dam + nhap nhay (tier level2 tu nhien), 'light'
// = vang nhat khong nhap nhay (tier level1 tu nhien), 'off' = tat han, tro ve
// giao dien binh thuong khong mau. Nguoi dung co the chuyen QUA LAI ca 3 trang
// thai nay bat ke tier goc la gi (vd 1 o level1 van bam len duoc 'blink').
export type HighlightState = 'blink' | 'light' | 'off';

// Danh dau THU CONG o o Ma CK (yeu cau nguoi dung 2026-07-25) - truoc day chi
// co 1 trang thai boolean "da doc" (bôi xam). Nay them "Luu y" (bôi vang) ben
// canh "Da xong" (bôi xam nhu cu), chon 1 trong 2 qua popup xac nhan giong
// pattern MuteableHighlightCell. undefined = chua danh dau gi.
export type ReportMarkState = 'note' | 'done';

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
// Them/sua 1 cap [khoa, gia tri] trong danh sach da luu, giu nguyen thu tu cu.
function upsertEntry<T>(entries: [string, T][], key: string, value: T): [string, T][] {
  const idx = entries.findIndex(([k]) => k === key);
  if (idx === -1) return [...entries, [key, value]];
  const next = entries.slice();
  next[idx] = [key, value];
  return next;
}

function mutateStored(apply: (prev: StoredState) => StoredState): StoredState {
  const latest = loadStored();
  const next = apply(latest);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.error('Khong luu duoc danh dau vao localStorage', error);
  }
  return next;
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
}

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
  // applyChange (doc - sua - ghi), khong con buoc ghi de nao de ma chan.
  useEffect(() => {
    const stored = loadStored();
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
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      const stored = loadStored();
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

  // Ap thay doi THANG len ban dang nam trong localStorage roi dong bo lai RAM -
  // xem mutateStored ve ly do khong con ghi de bang toan bo state cua tab nay.
  const applyChange = useCallback((apply: (prev: StoredState) => StoredState) => {
    const next = mutateStored(apply);
    setCodes(new Set(next.codes));
    setOverrides(new Map(next.highlightOverrides));
    setReportMarks(new Map(next.reportMarks));
    setReportNotes(new Map(next.reportNotes));
  }, []);

  const addToWatchlist = useCallback(
    (code: string) => {
      const normalized = code.trim().toUpperCase();
      if (!normalized) return;
      applyChange((prev) => ({ ...prev, codes: prev.codes.includes(normalized) ? prev.codes : [...prev.codes, normalized] }));
    },
    [applyChange]
  );

  const removeFromWatchlist = useCallback(
    (code: string) => {
      applyChange((prev) => ({ ...prev, codes: prev.codes.filter((c) => c !== code) }));
    },
    [applyChange]
  );

  const setHighlightOverride = useCallback(
    (key: string, state: HighlightState) => {
      applyChange((prev) => ({ ...prev, highlightOverrides: upsertEntry(prev.highlightOverrides, key, state) }));
    },
    [applyChange]
  );

  const setReportMark = useCallback(
    (filePath: string, state: ReportMarkState | null) => {
      applyChange((prev) => ({
        ...prev,
        reportMarks: state === null ? prev.reportMarks.filter(([k]) => k !== filePath) : upsertEntry(prev.reportMarks, filePath, state),
      }));
    },
    [applyChange]
  );

  const setReportNote = useCallback(
    (filePath: string, note: string) => {
      applyChange((prev) => ({ ...prev, reportNotes: upsertEntry(prev.reportNotes, filePath, note) }));
    },
    [applyChange]
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
    }),
    [codes, overrides, reportMarks, reportNotes, addToWatchlist, removeFromWatchlist, setHighlightOverride, setReportMark, setReportNote],
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider');
  return ctx;
}
