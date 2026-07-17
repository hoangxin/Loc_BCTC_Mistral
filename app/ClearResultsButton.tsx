'use client';

import { useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 5000;
// Xoa la thao tac nhe (khong OCR gi) nhung van di qua GitHub Actions (checkout
// + npm ci) nen van co do tre ~1-2 phut co dinh - cho du de an toan.
const MAX_POLL_MS = 5 * 60 * 1000;

type Status = 'idle' | 'menu' | 'confirming' | 'loading' | 'waiting' | 'error';
type Target = 'all' | 'selected';

// SUA 2026-07-17 (yeu cau nguoi dung - moi tab "Ket qua {ky}" can nut nay voi
// 2 lua chon thay vi luon xoa CA ky): bam nut mo menu 2 dong "Xoa tat ca (N
// bao cao)" / "Xoa bao cao da chon (N)" - dong sau bi vo hieu neu chua tick
// dong nao. allFilePaths = toan bo bao cao trong KY dang mo (khong phai toan
// bo he thong - moi tab da tu loc theo ky, xem PeriodResultsPanel) - "Xoa tat
// ca" o day CHI xoa cac bao cao nay (truyen filePaths tuong minh xuong
// clearResults, xem lib/pipeline.ts), KHONG con xoa toan bo cache nhu ban cu.
export default function ClearResultsButton({
  allFilePaths,
  selectedFilePaths,
  currentGeneratedAt,
}: {
  allFilePaths: string[];
  selectedFilePaths: string[];
  currentGeneratedAt: string;
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [target, setTarget] = useState<Target>('all');
  const [message, setMessage] = useState('');
  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== 'menu') return;
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setStatus('idle');
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [status]);

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
    const filePaths = target === 'all' ? allFilePaths : selectedFilePaths;
    try {
      const response = await fetch('/api/clear-results', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filePaths }),
      });
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
    const count = target === 'all' ? allFilePaths.length : selectedFilePaths.length;
    return (
      <div className="trigger-row">
        <span className="trigger-message trigger-message-error">
          Xoá {count} báo cáo {target === 'all' ? 'trong kỳ này' : 'đã chọn'}? Không thể hoàn tác.
        </span>
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
      <div className="split-button" ref={wrapperRef}>
        <button
          className="secondary-button"
          onClick={() => setStatus((s) => (s === 'menu' ? 'idle' : 'menu'))}
          disabled={busy || allFilePaths.length === 0}
        >
          {busy ? 'Đang xoá...' : 'Xoá kết quả ▾'}
        </button>
        {status === 'menu' && (
          <div className="split-button-menu">
            <button
              className="split-button-menu-item"
              onClick={() => {
                setTarget('all');
                setStatus('confirming');
              }}
            >
              Xoá tất cả ({allFilePaths.length} báo cáo)
            </button>
            <button
              className="split-button-menu-item"
              onClick={() => {
                setTarget('selected');
                setStatus('confirming');
              }}
              disabled={selectedFilePaths.length === 0}
            >
              Xoá báo cáo đã chọn ({selectedFilePaths.length})
            </button>
          </div>
        )}
      </div>
      {message && (
        <span className={`trigger-message ${status === 'error' ? 'trigger-message-error' : ''}`}>{message}</span>
      )}
    </div>
  );
}
