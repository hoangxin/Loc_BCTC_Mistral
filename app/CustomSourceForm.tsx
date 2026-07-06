'use client';

import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'loading' | 'waiting' | 'not-found' | 'error';

const POLL_INTERVAL_MS = 5000;
// AI duyet trang + tai + OCR 3 bang co the mat vai phut (giong "Tai BCTC") -
// dispatch GitHub Actions KHONG tra ket qua ngay nua, phai poll.
const MAX_POLL_MS = 15 * 60 * 1000;

export default function CustomSourceForm() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollHandle.current) clearInterval(pollHandle.current);
    };
  }, []);

  function stopPolling() {
    if (pollHandle.current) {
      clearInterval(pollHandle.current);
      pollHandle.current = null;
    }
  }

  // Doi chieu FetchStatus.lastCustomSourceCheck.requestId (ghi boi
  // lib/custom-source.ts tren GitHub Actions runner, LUON ghi ke ca
  // found:false) voi requestId vua gui - day la cach DUY NHAT phan biet "chua
  // chay xong" voi "chay xong nhung khong thay".
  function startPolling(requestId: string) {
    const startedAt = Date.now();
    pollHandle.current = setInterval(async () => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        stopPolling();
        setMessage('Chạy lâu hơn dự kiến - bạn tự thử lại sau nhé.');
        setStatus('error');
        return;
      }
      try {
        const response = await fetch('/api/fetch-status', { cache: 'no-store' });
        const data = await response.json();
        const check = data?.lastCustomSourceCheck;
        if (check && check.requestId === requestId) {
          stopPolling();
          if (check.found) {
            window.location.reload();
          } else {
            setMessage(check.message || 'Chưa có');
            setStatus('not-found');
          }
        }
      } catch {
        // loi tam thoi khi poll - bo qua, poll tiep
      }
    }, POLL_INTERVAL_MS);
  }

  async function submit() {
    if (!url.trim()) return;
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/custom-source', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        setMessage(data?.error || 'Có lỗi xảy ra.');
        setStatus('error');
        return;
      }

      setMessage('Đã bắt đầu tìm trên trang - có thể mất vài phút.');
      setStatus('waiting');
      startPolling(data.requestId);
    } catch {
      setMessage('Không kết nối được tới server.');
      setStatus('error');
    }
  }

  if (!open) {
    return (
      <button className="secondary-button" onClick={() => setOpen(true)}>
        + Thêm nguồn riêng
      </button>
    );
  }

  const busy = status === 'loading' || status === 'waiting';

  return (
    <div className="custom-source-form">
      <input
        type="url"
        className="custom-source-input"
        placeholder="Dán link website công ty..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        disabled={busy}
      />
      <button className="trigger-button" onClick={submit} disabled={busy}>
        {busy ? 'Đang tìm...' : 'Enter'}
      </button>
      <button className="secondary-button" onClick={() => setOpen(false)} disabled={busy}>
        Đóng
      </button>
      {message && <span className={`trigger-message ${status === 'error' ? 'trigger-message-error' : ''}`}>{message}</span>}
    </div>
  );
}
