'use client';

import { useRef, useState } from 'react';

const POLL_INTERVAL_MS = 5000;
// Xoa la thao tac nhe (khong OCR gi) nhung van di qua GitHub Actions (checkout
// + npm ci) nen van co do tre ~1-2 phut co dinh - cho du de an toan.
const MAX_POLL_MS = 5 * 60 * 1000;

type Status = 'idle' | 'confirming' | 'loading' | 'waiting' | 'error';

export default function ClearResultsButton({ currentGeneratedAt }: { currentGeneratedAt: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollHandle.current) {
      clearInterval(pollHandle.current);
      pollHandle.current = null;
    }
  }

  function startPolling() {
    const startedAt = Date.now();
    pollHandle.current = setInterval(async () => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        stopPolling();
        setMessage('Xoá lâu hơn dự kiến - bạn tự tải lại trang sau nhé.');
        setStatus('error');
        return;
      }
      try {
        const response = await fetch('/api/fetch-status', { cache: 'no-store' });
        const data = await response.json();
        if (!data.running && data.generatedAt && data.generatedAt !== currentGeneratedAt) {
          stopPolling();
          window.location.reload();
        }
      } catch {
        // loi tam thoi khi poll - bo qua, poll tiep
      }
    }, POLL_INTERVAL_MS);
  }

  async function doClear() {
    setStatus('loading');
    try {
      const response = await fetch('/api/clear-results', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data?.error || 'Có lỗi xảy ra.');
        setStatus('error');
        return;
      }
      setMessage('Đang xoá kết quả. Trang sẽ tự tải lại khi xong.');
      setStatus('waiting');
      startPolling();
    } catch {
      setMessage('Không kết nối được tới server.');
      setStatus('error');
    }
  }

  const busy = status === 'loading' || status === 'waiting';

  if (status === 'confirming') {
    return (
      <div className="trigger-row">
        <span className="trigger-message trigger-message-error">Xoá toàn bộ kết quả đã tích luỹ? Không thể hoàn tác.</span>
        <button className="trigger-button" onClick={doClear}>
          Xác nhận xoá
        </button>
        <button className="secondary-button" onClick={() => setStatus('idle')}>
          Huỷ
        </button>
      </div>
    );
  }

  return (
    <div className="trigger-row">
      <button className="secondary-button" onClick={() => setStatus('confirming')} disabled={busy}>
        {busy ? 'Đang xoá...' : 'Xoá kết quả'}
      </button>
      {message && (
        <span className={`trigger-message ${status === 'error' ? 'trigger-message-error' : ''}`}>{message}</span>
      )}
    </div>
  );
}
