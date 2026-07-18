'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useWatchlist } from './WatchlistContext';

// Nut Watchlist (yeu cau nguoi dung 2026-07-18) - dat CHUNG dong voi Xuat
// Excel tong hop/Xoa ket qua (xem ReportsSummaryTable.tsx). Danh sach dung
// chung qua WatchlistContext (dat o ResultsByPeriodTabs, KHONG unmount khi
// doi tab) nen them/xoa o day tu dong hien ra o TAT CA cac tab ky/loai hinh
// DN khac, khong can lam lai rieng tung noi.
export default function WatchlistButton() {
  const { watchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Cho go nhieu ma cung luc, cach nhau dau phay/khoang trang (tien dung
    // khi paste ca danh sach ma CK).
    input
      .split(/[\s,;]+/)
      .map((code) => code.trim())
      .filter(Boolean)
      .forEach((code) => addToWatchlist(code));
    setInput('');
  }

  const codes = Array.from(watchlist).sort();

  return (
    <div className="split-button" ref={wrapperRef}>
      <button type="button" className="secondary-button" onClick={() => setOpen((v) => !v)}>
        Watchlist{codes.length > 0 ? ` (${codes.length})` : ''} ▾
      </button>
      {open && (
        <div className="split-button-menu watchlist-panel">
          <form className="watchlist-add-row" onSubmit={handleAdd}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="VD: IDV, VCB"
              autoFocus
            />
            <button type="submit" className="secondary-button">
              Thêm
            </button>
          </form>
          {codes.length === 0 ? (
            <span className="watchlist-empty">Chưa có mã nào trong watchlist.</span>
          ) : (
            <div className="watchlist-list">
              {codes.map((code) => (
                <span key={code} className="watchlist-chip">
                  {code}
                  <button
                    type="button"
                    onClick={() => removeFromWatchlist(code)}
                    aria-label={`Xoá ${code} khỏi watchlist`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
