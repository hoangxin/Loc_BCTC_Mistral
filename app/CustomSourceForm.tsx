'use client';

import { useEffect, useRef, useState } from 'react';
import type { OcrMode } from '@/lib/ocr-mode';

type Status = 'idle' | 'loading' | 'waiting' | 'not-found' | 'error';

const POLL_INTERVAL_MS = 5000;
// AI duyet trang + tai + OCR 3 bang co the mat vai phut (giong "Tai BCTC") -
// dispatch GitHub Actions KHONG tra ket qua ngay nua, phai poll.
const MAX_POLL_MS = 15 * 60 * 1000;

export default function CustomSourceForm() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  // Sync/batch (yeu cau nguoi dung 2026-07-21, xem lib/ocr-mode.ts va
  // FetchControls.tsx) - bam "Enter"/go phim Enter CHUA goi gi ca, chi mo 2
  // lua chon Batch/Sync, bam 1 trong 2 moi thuc su submit.
  const [ocrChoiceOpen, setOcrChoiceOpen] = useState(false);
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

  async function submit(ocrMode: OcrMode) {
    if (!url.trim()) return;
    setOcrChoiceOpen(false);
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/custom-source', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), ocrMode }),
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
          if (e.key === 'Enter') setOcrChoiceOpen(true);
        }}
        disabled={busy}
      />
      {!ocrChoiceOpen ? (
        <button className="trigger-button" onClick={() => setOcrChoiceOpen(true)} disabled={busy}>
          {busy ? 'Đang tìm...' : 'Enter'}
        </button>
      ) : (
        <div className="mode-toggle" role="group" aria-label="Chọn cách gọi Mistral OCR">
          <button
            type="button"
            className="trigger-button"
            onClick={() => submit('batch')}
            disabled={busy}
            title="Rẻ hơn ~50%, nhưng phụ thuộc hàng đợi xử lý của Mistral (có thể nghẽn)"
          >
            Batch
          </button>
          <button
            type="button"
            className="trigger-button"
            onClick={() => submit('sync')}
            disabled={busy}
            title="Gọi trực tiếp, không qua hàng đợi - dùng khi Batch đang nghẽn"
          >
            Sync
          </button>
          <button type="button" className="secondary-button" onClick={() => setOcrChoiceOpen(false)} disabled={busy}>
            Huỷ
          </button>
        </div>
      )}
      <button className="secondary-button" onClick={() => setOpen(false)} disabled={busy}>
        Đóng
      </button>
      {message && <span className={`trigger-message ${status === 'error' ? 'trigger-message-error' : ''}`}>{message}</span>}
    </div>
  );
}
