'use client';

import { useEffect, useRef, useState } from 'react';
import type { QuarterPeriod } from '@/lib/quarter';

type Status = 'idle' | 'loading' | 'waiting' | 'error';

const POLL_INTERVAL_MS = 5000;
// Tai + loc + download hang tram file co the mat vai phut - dung poll qua
// lau de tranh tab quen mat dang fetch mai.
const MAX_POLL_MS = 15 * 60 * 1000;

function quarterKey(q: QuarterPeriod): string {
  return `${q.year}-Q${q.quarter}`;
}

export default function FetchControls({
  currentGeneratedAt,
  quarterOptions,
  previousQuarter,
}: {
  currentGeneratedAt: string;
  quarterOptions: QuarterPeriod[];
  previousQuarter: QuarterPeriod;
}) {
  const [selectedKey, setSelectedKey] = useState(quarterKey(quarterOptions[0]));
  const [hoursWindow, setHoursWindow] = useState(24);
  const [reportLimit, setReportLimit] = useState(50);
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

  function startPolling() {
    const startedAt = Date.now();
    pollHandle.current = setInterval(async () => {
      if (Date.now() - startedAt > MAX_POLL_MS) {
        stopPolling();
        setMessage('Chạy lâu hơn dự kiến - bạn tự tải lại trang sau nhé.');
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

  const selected = quarterOptions.find((q) => quarterKey(q) === selectedKey) ?? quarterOptions[0];
  const isCurrentQuarter = selected.quarter === previousQuarter.quarter && selected.year === previousQuarter.year;
  const busy = status === 'loading' || status === 'waiting';

  async function runFetch() {
    setStatus('loading');
    try {
      const response = await fetch('/api/trigger-fetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quarter: selected.quarter,
          year: selected.year,
          ...(isCurrentQuarter ? { hoursWindow } : { reportLimit }),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data?.error || 'Có lỗi xảy ra.');
        setStatus('error');
        return;
      }

      setMessage(`Đã bắt đầu tải BCTC Quý ${selected.quarter}/${selected.year}. Trang sẽ tự tải lại khi xong.`);
      setStatus('waiting');
      startPolling();
    } catch {
      setMessage('Không kết nối được tới server.');
      setStatus('error');
    }
  }

  return (
    <div className="fetch-controls">
      <div className="fetch-controls-row">
        <label className="field">
          <span className="field-label">Quý báo cáo</span>
          <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} disabled={busy}>
            {quarterOptions.map((q) => (
              <option key={quarterKey(q)} value={quarterKey(q)}>
                Quý {q.quarter}/{q.year}
              </option>
            ))}
          </select>
        </label>

        {isCurrentQuarter ? (
          <label className="field">
            <span className="field-label">Lấy BCTC nộp trong (giờ gần nhất)</span>
            <input type="number" min={1} value={hoursWindow} onChange={(e) => setHoursWindow(Number(e.target.value))} disabled={busy} />
          </label>
        ) : (
          <label className="field">
            <span className="field-label">Số BCTC gần nhất muốn lấy về</span>
            <input type="number" min={1} value={reportLimit} onChange={(e) => setReportLimit(Number(e.target.value))} disabled={busy} />
          </label>
        )}

        <button className="trigger-button" onClick={runFetch} disabled={busy}>
          {busy ? 'Đang chạy...' : 'Tải BCTC'}
        </button>
      </div>

      {message && (
        <div className="trigger-row">
          <span className={`trigger-message ${status === 'error' ? 'trigger-message-error' : ''}`}>{message}</span>
          {status === 'error' && (
            <button className="trigger-button" onClick={() => setStatus('idle')}>
              Đóng
            </button>
          )}
        </div>
      )}
    </div>
  );
}
