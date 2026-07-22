'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'bctc-watchlist-v1';

// 3 trang thai 1 o chi tieu dang highlight co the dung (yeu cau nguoi dung
// 2026-07-18): 'blink' = vang dam + nhap nhay (tier level2 tu nhien), 'light'
// = vang nhat khong nhap nhay (tier level1 tu nhien), 'off' = tat han, tro ve
// giao dien binh thuong khong mau. Nguoi dung co the chuyen QUA LAI ca 3 trang
// thai nay bat ke tier goc la gi (vd 1 o level1 van bam len duoc 'blink').
export type HighlightState = 'blink' | 'light' | 'off';

interface StoredState {
  codes: string[];
  highlightOverrides: [string, HighlightState][];
  // Danh dau THU CONG "da doc xong" theo tung bao cao (yeu cau nguoi dung
  // 2026-07-22) - key la filePath (giong highlightKey, KHONG phai stockCode:
  // 1 ma CK co the co nhieu bao cao/ky doc lap nhau, danh dau rieng tung cai).
  // Truong MOI, file cu (chua co truong nay) tu dong fallback ve mang rong qua
  // Array.isArray check duoi, khong can bump STORAGE_KEY.
  readFilePaths: string[];
}

function loadStored(): StoredState {
  if (typeof window === 'undefined') return { codes: [], highlightOverrides: [], readFilePaths: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { codes: [], highlightOverrides: [], readFilePaths: [] };
    const parsed = JSON.parse(raw);
    return {
      codes: Array.isArray(parsed.codes) ? parsed.codes : [],
      highlightOverrides: Array.isArray(parsed.highlightOverrides) ? parsed.highlightOverrides : [],
      readFilePaths: Array.isArray(parsed.readFilePaths) ? parsed.readFilePaths : [],
    };
  } catch {
    return { codes: [], highlightOverrides: [], readFilePaths: [] };
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
  // Danh dau "da doc xong" theo filePath (yeu cau nguoi dung 2026-07-22) - CHI
  // luu tick THU CONG cua nguoi dung, khong lien quan gi den warnings/du lieu
  // OCR - hoan toan client-local (localStorage), khong dong bo len server.
  isReportRead: (filePath: string) => boolean;
  toggleReportRead: (filePath: string) => void;
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
  const [readFilePaths, setReadFilePaths] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadStored();
    setCodes(new Set(stored.codes));
    setOverrides(new Map(stored.highlightOverrides));
    setReadFilePaths(new Set(stored.readFilePaths));
    setHydrated(true);
  }, []);

  useEffect(() => {
    // Bo qua lan render dau (truoc khi doc xong localStorage) de khong ghi
    // de state rong len du lieu da luu tu truoc.
    if (!hydrated) return;
    const state: StoredState = {
      codes: Array.from(codes),
      highlightOverrides: Array.from(overrides.entries()),
      readFilePaths: Array.from(readFilePaths),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [codes, overrides, readFilePaths, hydrated]);

  const addToWatchlist = useCallback((code: string) => {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    setCodes((prev) => {
      if (prev.has(normalized)) return prev;
      const next = new Set(prev);
      next.add(normalized);
      return next;
    });
  }, []);

  const removeFromWatchlist = useCallback((code: string) => {
    setCodes((prev) => {
      if (!prev.has(code)) return prev;
      const next = new Set(prev);
      next.delete(code);
      return next;
    });
  }, []);

  const setHighlightOverride = useCallback((key: string, state: HighlightState) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(key, state);
      return next;
    });
  }, []);

  const toggleReportRead = useCallback((filePath: string) => {
    setReadFilePaths((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }, []);

  const value = useMemo<WatchlistContextValue>(
    () => ({
      watchlist: codes,
      isWatched: (code: string) => codes.has((code ?? '').toUpperCase()),
      addToWatchlist,
      removeFromWatchlist,
      getHighlightOverride: (key: string) => overrides.get(key),
      setHighlightOverride,
      isReportRead: (filePath: string) => readFilePaths.has(filePath),
      toggleReportRead,
    }),
    [codes, overrides, readFilePaths, addToWatchlist, removeFromWatchlist, setHighlightOverride, toggleReportRead],
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider');
  return ctx;
}
