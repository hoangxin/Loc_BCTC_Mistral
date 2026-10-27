'use client';

import { useRef, useState } from 'react';
import { useWatchlist } from './WatchlistContext';

// Thanh nho hien TRANG THAI dong bo danh dau + 2 nut Xuat/Nhap file sao luu.
//
// Vi sao phai hien ro (su co 2026-10-27): truoc day danh dau chi nam trong
// localStorage, va khi no bi mat (tab cu ghi de / trinh duyet tu don khi o dia
// day) thi KHONG CO BAT KY dau hieu nao - nguoi dung chi phat hien khi mo ra
// thay trang tron. Nay luc nao cung nhin thay danh dau da len repo hay chua,
// va luon tu tai duoc 1 ban sao ve may.
export default function MarksSyncBar() {
  const { syncState, syncNow, exportToFile, importFromFile } = useWatchlist();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);

  const label =
    syncState.kind === 'syncing'
      ? 'Đang lưu lên repo…'
      : syncState.kind === 'saved'
        ? `Đã lưu lên repo lúc ${new Date(syncState.at).toLocaleTimeString('vi-VN')}`
        : syncState.kind === 'error'
          ? `Chưa lưu được: ${syncState.message}`
          : 'Đánh dấu lưu trong trình duyệt';

  return (
    <div className="marks-sync-bar">
      <span className={`marks-sync-status ${syncState.kind}`} title="Trạng thái đồng bộ đánh dấu (Lưu ý / Đã xong / ghi chú / ô tô màu / mã theo dõi)">
        {label}
      </span>
      <button type="button" className="marks-sync-button" onClick={() => void syncNow()} disabled={syncState.kind === 'syncing'}>
        Lưu ngay
      </button>
      <button type="button" className="marks-sync-button" onClick={exportToFile}>
        Xuất file
      </button>
      <button type="button" className="marks-sync-button" onClick={() => fileInput.current?.click()}>
        Nhập file
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const result = await importFromFile(file);
          setMessage(result.message);
        }}
      />
      {message && (
        <span className="marks-sync-message" onClick={() => setMessage(null)} title="Bấm để ẩn">
          {message}
        </span>
      )}
    </div>
  );
}
