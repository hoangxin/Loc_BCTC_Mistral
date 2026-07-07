'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReportFile, ReportTerm } from '@/lib/vietstock-reports';
import type { QuarterPeriod } from '@/lib/quarter';
import { isRegularQuarterTerm, periodDisplayLabel } from '@/lib/period-label';
import { formatTimestamp } from '@/lib/format';

type Status = 'idle' | 'loading' | 'waiting' | 'error';
type FilterMode = 'hours' | 'count' | 'select';
type PreviewStatus = 'idle' | 'loading' | 'ready' | 'error';

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

  // 'hours' CHI co y nghia khi isCurrentQuarter (Quy "vua qua") - cac ky khac
  // (quy cu hon, 6T/9T/Nam) da nop du tu lau, "gio gan nhat" khong con y
  // nghia nen luon dung 'count' hoac 'select' (xem effectiveMode/JSX duoi).
  // 'select' (tick chon tay tung bao cao trong bang preview) co nghia o MOI
  // ky, khong rieng gi ky hien tai.
  const [filterMode, setFilterMode] = useState<FilterMode>('hours');
  const [hoursWindow, setHoursWindow] = useState(24);
  const [reportLimit, setReportLimit] = useState(50);
  // Chi dung khi filterMode === 'select' - key theo ReportFile.fileInfoID
  // (duy nhat, xem lib/vietstock-reports.ts) - reset ve rong moi khi doi ky
  // (xem effect loadPreview duoi).
  const [selectedFileInfoIds, setSelectedFileInfoIds] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);

  // Xem truoc danh muc bao cao THAT cua ky dang chon (app/api/report-list,
  // dung lai fetchReportFilesForTerm - cung ham pipeline that su dung) - o
  // MOI/So BCTC gan nhat + nut "Tai BCTC" bi khoa (xem inputsDisabled duoi)
  // cho toi khi danh muc nay tai xong, tranh nguoi dung bam "Tai BCTC" truoc
  // khi thay dung danh muc that cua ky vua chon.
  const [previewReports, setPreviewReports] = useState<ReportFile[] | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle');
  const [previewError, setPreviewError] = useState('');

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
  // Quy "vua qua" cho chon 1 trong 3 (hours/count/select) - cac ky khac chi
  // cho count/select (khong co 'hours', xem comment filterMode o tren).
  const effectiveMode: FilterMode = isCurrentQuarter ? filterMode : filterMode === 'select' ? 'select' : 'count';

  const loadPreview = useCallback(async (term: ReportTerm) => {
    setPreviewStatus('loading');
    setPreviewReports(null);
    setPreviewError('');
    try {
      const params = new URLSearchParams({
        reportTermID: String(term.reportTermID),
        yearPeriod: String(term.yearPeriod),
        description: term.description,
      });
      const response = await fetch(`/api/report-list?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        setPreviewError(data?.error || 'Không tải được danh mục báo cáo.');
        setPreviewStatus('error');
        return;
      }
      setPreviewReports(data.reports);
      setPreviewStatus('ready');
    } catch {
      setPreviewError('Không kết nối được tới server.');
      setPreviewStatus('error');
    }
  }, []);

  // Doi ky (dropdown) -> tai lai danh muc that cua ky do ngay, o MOI/So BCTC
  // gan nhat + nut "Tai BCTC" cho toi khi xong (xem inputsDisabled duoi). Xoa
  // luon lua chon tick cu (thuoc danh muc ky truoc, khong con y nghia o ky moi).
  useEffect(() => {
    if (!selectedTerm) return;
    let cancelled = false;
    setSelectedFileInfoIds(new Set());
    (async () => {
      if (!cancelled) await loadPreview(selectedTerm);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  function toggleSelectedReport(fileInfoID: number) {
    setSelectedFileInfoIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileInfoID)) next.delete(fileInfoID);
      else next.add(fileInfoID);
      return next;
    });
  }

  function toggleSelectAll(reports: ReportFile[]) {
    setSelectedFileInfoIds((prev) => (prev.size === reports.length ? new Set() : new Set(reports.map((r) => r.fileInfoID))));
  }

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
          ...(effectiveMode === 'hours'
            ? { hoursWindow }
            : effectiveMode === 'select'
              ? { selectedFileInfoIds: Array.from(selectedFileInfoIds) }
              : { reportLimit }),
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

  // O so h/so bao cao + nut "Tai BCTC" chi mo khi danh muc that cua ky dang
  // chon da tai xong (previewStatus === 'ready') - tranh nguoi dung bam "Tai
  // BCTC" truoc khi thay dung danh muc that (yeu cau user).
  const inputsDisabled = busy || !selectedTerm || previewStatus !== 'ready';
  // Mode 'select' can it nhat 1 bao cao duoc tick - khong cho bam "Tai BCTC"
  // voi danh sach rong (se tai ve... khong gi ca).
  const triggerDisabled = inputsDisabled || (effectiveMode === 'select' && selectedFileInfoIds.size === 0);

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

        <div className="mode-toggle" role="group" aria-label="Cách lấy BCTC">
          {isCurrentQuarter && (
            <button
              type="button"
              className={`mode-toggle-btn ${filterMode === 'hours' ? 'active' : ''}`}
              onClick={() => setFilterMode('hours')}
              disabled={inputsDisabled}
            >
              Theo giờ
            </button>
          )}
          <button
            type="button"
            className={`mode-toggle-btn ${filterMode === 'count' ? 'active' : ''}`}
            onClick={() => setFilterMode('count')}
            disabled={inputsDisabled}
          >
            Theo số báo cáo
          </button>
          <button
            type="button"
            className={`mode-toggle-btn ${filterMode === 'select' ? 'active' : ''}`}
            onClick={() => setFilterMode('select')}
            disabled={inputsDisabled}
          >
            Lựa chọn báo cáo
          </button>
        </div>

        {effectiveMode === 'hours' && (
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
        )}
        {effectiveMode === 'count' && (
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
        {effectiveMode === 'select' && (
          <span className="trigger-message">{selectedFileInfoIds.size} báo cáo đã chọn</span>
        )}

        <button className="trigger-button" onClick={runFetch} disabled={triggerDisabled}>
          {busy ? 'Đang chạy...' : 'Tải BCTC'}
        </button>
      </div>

      {selectedTerm && (
        <div className="preview-panel">
          {previewStatus === 'loading' && <span className="trigger-message">Đang tải danh mục báo cáo thật của {periodDisplayLabel(selectedTerm)}...</span>}
          {previewStatus === 'error' && (
            <div className="trigger-row">
              <span className="trigger-message trigger-message-error">{previewError}</span>
              <button className="secondary-button" onClick={() => loadPreview(selectedTerm)}>
                Thử lại
              </button>
            </div>
          )}
          {previewStatus === 'ready' && previewReports && (
            <div className="report-table-wrapper preview-table-wrapper">
              <div className="summary-actions">
                <span className="muted-note">
                  {previewReports.length} báo cáo trong danh mục {periodDisplayLabel(selectedTerm)} (theo Vietstock)
                </span>
              </div>
              <table className="report-table">
                <thead>
                  <tr>
                    {effectiveMode === 'select' && (
                      <th>
                        <input
                          type="checkbox"
                          checked={previewReports.length > 0 && selectedFileInfoIds.size === previewReports.length}
                          onChange={() => toggleSelectAll(previewReports)}
                          aria-label="Chọn tất cả"
                        />
                      </th>
                    )}
                    <th>STT</th>
                    <th>Mã CK</th>
                    <th>Tên công ty</th>
                    <th>Sàn giao dịch</th>
                    <th>Tên tài liệu</th>
                    <th>Ngày cập nhật</th>
                  </tr>
                </thead>
                <tbody>
                  {previewReports.map((report, index) => (
                    <tr key={report.fileInfoID}>
                      {effectiveMode === 'select' && (
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedFileInfoIds.has(report.fileInfoID)}
                            onChange={() => toggleSelectedReport(report.fileInfoID)}
                            aria-label={`Chọn báo cáo ${report.stockCode}`}
                          />
                        </td>
                      )}
                      <td>{index + 1}</td>
                      <td>{report.stockCode || '—'}</td>
                      <td>{report.companyName}</td>
                      <td>
                        <span className="exchange-tag">{report.exchange}</span>
                      </td>
                      <td>{report.title}</td>
                      <td>{formatTimestamp(String(report.lastUpdate))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
