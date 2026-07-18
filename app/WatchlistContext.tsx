'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'bctc-watchlist-v1';

interface StoredState {
  codes: string[];
  muted: string[];
}

function loadStored(): StoredState {
  if (typeof window === 'undefined') return { codes: [], muted: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { codes: [], muted: [] };
    const parsed = JSON.parse(raw);
    return {
      codes: Array.isArray(parsed.codes) ? parsed.codes : [],
      muted: Array.isArray(parsed.muted) ? parsed.muted : [],
    };
  } catch {
    return { codes: [], muted: [] };
  }
}

interface WatchlistContextValue {
  watchlist: Set<string>;
  isWatched: (code: string) => boolean;
  addToWatchlist: (code: string) => void;
  removeFromWatchlist: (code: string) => void;
  muted: Set<string>;
  isMuted: (key: string) => boolean;
  toggleMuted: (key: string) => void;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

// Watchlist + mute-nhap-nhay (yeu cau nguoi dung 2026-07-18) - Provider dat o
// app/Tabs.tsx (goc chung CA tab "Chon bao cao loc" lan "Ket qua", khong
// unmount khi doi tab/sub-tab nao) de watchlist tao o 1 tab tu dong dong bo
// MOI noi (ca ket qua lan bang preview trong "Chon bao cao loc") ma khong can
// prop-drilling qua tung tang. Kem localStorage de khong mat khi F5/reload
// (vd sau khi bam "Xoá kết quả" goi window.location.reload()).
export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [codes, setCodes] = useState<Set<string>>(() => new Set());
  const [muted, setMuted] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadStored();
    setCodes(new Set(stored.codes));
    setMuted(new Set(stored.muted));
    setHydrated(true);
  }, []);

  useEffect(() => {
    // Bo qua lan render dau (truoc khi doc xong localStorage) de khong ghi
    // de state rong len du lieu da luu tu truoc.
    if (!hydrated) return;
    const state: StoredState = { codes: Array.from(codes), muted: Array.from(muted) };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [codes, muted, hydrated]);

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

  const toggleMuted = useCallback((key: string) => {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const value = useMemo<WatchlistContextValue>(
    () => ({
      watchlist: codes,
      isWatched: (code: string) => codes.has((code ?? '').toUpperCase()),
      addToWatchlist,
      removeFromWatchlist,
      muted,
      isMuted: (key: string) => muted.has(key),
      toggleMuted,
    }),
    [codes, muted, addToWatchlist, removeFromWatchlist, toggleMuted],
  );

  return <WatchlistContext.Provider value={value}>{children}</WatchlistContext.Provider>;
}

export function useWatchlist(): WatchlistContextValue {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used within WatchlistProvider');
  return ctx;
}
