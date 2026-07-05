'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReportTerm } from '@/lib/vietstock-reports';
import type { QuarterPeriod } from '@/lib/quarter';
import { isRegularQuarterTerm, periodDisplayLabel } from '@/lib/period-label';

type Status = 'idle' | 'loading' | 'waiting' | 'error';
type FilterMode = 'hours' | 'count';

const POLL_INTERVAL_MS = 5000;
// Tai + loc + download hang tram file co the mat vai phut - dung poll qua
// lau de tranh tab quen mat dang fetch mai.
const MAX_POLL_MS = 15 * 60 * 1000;

// reportTermID KHONG duy nhat qua cac nam (vd "Quý 3" moi nam deu dung lai
// reportTermID=4 - da gap that qua debug that: dropdown bi trung value giua
// "Quý 3/2025" va "Quý 3/2026") - phai ghep them yearPeriod moi ra key duy nhat.
function termKey(term: ReportTerm): string {
  return `${term.reportTermID}-${term.yearPeriod}`;
}

export default function FetchControls({
  currentGeneratedAt,
  previousQuarter,
}: {
  currentGeneratedAt: string;
  previousQuarter: QuarterPeriod;
}) {
  const [terms, setTerms] = useState<ReportTerm[] | null>(null);
  const [termsError, setTermsError] = useState('');
  const [selectedKey, setSelectedKey] = useState('');

  // CHI co y nghia khi isCurrentQuarter (Quy "vua qua") - cac ky khac (quy cu
  // hon, 6T/9T/Nam) da nop du tu lau, "gio gan nhat" khong con y nghia nen
  // luon dung 'count' (khong hien toggle - xem JSX duoi).
  const [filterMode, setFilterMode] = useState<FilterMode>('hours');
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

  // Lay danh sach ky THAT cua Vietstock (Quy 1-4, "6T", "9T", "Nam") 1 lan
  // khi mount - xem app/api/report-terms, lib/vietstock-reports.ts
  // fetchReportTerms - tu "tinh tien" theo ngay hien tai vi day la du lieu
  // song, khong phai danh sach 8 quy tu sinh nhu truoc.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/report-terms');
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok) {
          setTermsError(data?.error || 'Không tải được danh sách kỳ báo cáo.');
          return;
        }
        const list: ReportTerm[] = data.terms;
        setTerms(list);
        const defaultTerm =
          list.find((t) => {
            const quarter = isRegularQuarterTerm(t);
            return quarter && quarter.quarter === previousQuarter.quarter && quarter.year === previousQuarter.year;
          }) ?? list[0];
        if (defaultTerm) setSelectedKey(termKey(defaultTerm));
      } catch {
        if (!cancelled) setTermsError('Không kết nối được tới server.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTerm = terms?.find((t) => termKey(t) === selectedKey) ?? null;
  const regularQuarter = selectedTerm ? isRegularQuarterTerm(selectedTerm) : null;
  const isCurrentQuarter = regularQuarter
    ? regularQuarter.quarter === previousQuarter.quarter && regularQuarter.year === previousQuarter.year
    : false;
  const busy = status === 'loading' || status === 'waiting';
  // Quy "vua qua" cho chon 1 trong 2 (hours/count) - cac ky khac luon dung count.
  const effectiveMode: FilterMode = isCurrentQuarter ? filterMode : 'count';

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

  async function runFetch() {
    if (!selectedTerm) return;
    setStatus('loading');
    try {
      const response = await fetch('/api/trigger-fetch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reportTermID: selectedTerm.reportTermID,
          yearPeriod: selectedTerm.yearPeriod,
          description: selectedTerm.description,
          ...(effectiveMode === 'hours' ? { hoursWindow } : { reportLimit }),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data?.error || 'Có lỗi xảy ra.');
        setStatus('error');
        return;
      }

      setMessage(`Đã bắt đầu tải BCTC ${periodDisplayLabel(selectedTerm)}. Trang sẽ tự tải lại khi xong.`);
      setStatus('waiting');
      startPolling();
    } catch {
      setMessage('Không kết nối được tới server.');
      setStatus('error');
    }
  }

  const inputsDisabled = busy || !selectedTerm;

  return (
    <div className="fetch-controls">
      <div className="fetch-controls-row">
        <label className="field">
          <span className="field-label">Kỳ báo cáo</span>
          <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)} disabled={busy || !terms}>
            {(terms ?? []).map((term) => (
              <option key={termKey(term)} value={termKey(term)}>
                {periodDisplayLabel(term)}
              </option>
            ))}
          </select>
        </label>

        {isCurrentQuarter && (
          <div className="mode-toggle" role="group" aria-label="Cách lấy BCTC">
            <button
              type="button"
              className={`mode-toggle-btn ${filterMode === 'hours' ? 'active' : ''}`}
              onClick={() => setFilterMode('hours')}
              disabled={inputsDisabled}
            >
              Theo giờ
            </button>
            <button
              type="button"
              className={`mode-toggle-btn ${filterMode === 'count' ? 'active' : ''}`}
              onClick={() => setFilterMode('count')}
              disabled={inputsDisabled}
            >
              Theo số báo cáo
            </button>
          </div>
        )}

        {effectiveMode === 'hours' ? (
          <label className="field">
            <span className="field-label">Lấy BCTC nộp trong (giờ gần nhất)</span>
            <input
              type="number"
              min={1}
              value={hoursWindow}
              onChange={(e) => setHoursWindow(Number(e.target.value))}
              disabled={inputsDisabled}
            />
          </label>
        ) : (
          <label className="field">
            <span className="field-label">Số BCTC gần nhất muốn lấy về</span>
            <input
              type="number"
              min={1}
              value={reportLimit}
              onChange={(e) => setReportLimit(Number(e.target.value))}
              disabled={inputsDisabled}
            />
          </label>
        )}

        <button className="trigger-button" onClick={runFetch} disabled={inputsDisabled}>
          {busy ? 'Đang chạy...' : 'Tải BCTC'}
        </button>
      </div>

      {termsError && <span className="trigger-message trigger-message-error">{termsError}</span>}

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
