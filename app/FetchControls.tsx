'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportFile, ReportTerm } from '@/lib/vietstock-reports';
import type { QuarterPeriod } from '@/lib/quarter';
import { isRegularQuarterTerm, periodDisplayLabel, periodFolderSlug } from '@/lib/period-label';
import { formatTimestamp } from '@/lib/format';

type Status = 'idle' | 'loading' | 'waiting' | 'error';
type FilterMode = 'sinceLast' | 'count' | 'select';
type PreviewStatus = 'idle' | 'loading' | 'ready' | 'error';

const POLL_INTERVAL_MS = 5000;
// Tai + loc + download hang tram file co the mat vai phut - dung poll qua
// lau de tranh tab quen mat dang fetch mai.
const MAX_POLL_MS = 15 * 60 * 1000;

// Hien thi hoursValue (co the le, vd 4.0833h ~ 4h5p) kieu "4h5p" thay vi so
// thap phan xau - dung cung cach hien Loc_Tin_Deepseek (TriggerDigestButton.tsx).
function formatHoursLabel(hoursValue: number): string {
  const totalMinutes = Math.round(hoursValue * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (wholeHours === 0) return `${minutes}p`;
  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h${minutes}p`;
}

// Gio ke tu lan tai GAN NHAT cua DUNG ky dang chon (khong phai lan tai gan
// nhat noi chung - moi ky co moc rieng, xem buildTermLastFetchMap o
// app/page.tsx). Lam tron LEN theo PHUT (khong phai gio) roi quy doi ra phan
// so cua gio - lam tron len theo gio se doi khi cong du them toi 59 phut vo
// ly (yeu cau user 2026-07-10: "do chinh xac tinh den phut"). Tra ve 0 khi ky
// nay CHUA TUNG duoc tai (khong co moc so sanh) - runFetch se hieu 0 la
// "khong loc theo thoi gian", tuc lay TOAN BO danh muc.
function sinceLastHoursForTerm(term: ReportTerm, termLastFetch: Record<string, string>): number {
  const key = `${term.yearPeriod}-${periodFolderSlug(term)}`;
  const lastFetchIso = termLastFetch[key];
  if (!lastFetchIso) return 0;
  const lastFetchMs = new Date(lastFetchIso).getTime();
  if (!Number.isFinite(lastFetchMs)) return 0;
  const elapsedMinutes = Math.max(1, Math.ceil((Date.now() - lastFetchMs) / (60 * 1000)));
  return elapsedMinutes / 60;
}

function sinceLastLabel(term: ReportTerm, termLastFetch: Record<string, string>): string {
  const hoursValue = sinceLastHoursForTerm(term, termLastFetch);
  if (hoursValue === 0) return 'Từ lần tải cuối (chưa tải kỳ này lần nào - lấy toàn bộ danh mục)';
  return `Từ lần tải cuối (${formatHoursLabel(hoursValue)} trước)`;
}

// reportTermID KHONG duy nhat qua cac nam (vd "Quý 3" moi nam deu dung lai
// reportTermID=4 - da gap that qua debug that: dropdown bi trung value giua
// "Quý 3/2025" va "Quý 3/2026") - phai ghep them yearPeriod moi ra key duy nhat.
function termKey(term: ReportTerm): string {
  return `${term.reportTermID}-${term.yearPeriod}`;
}

export default function FetchControls({
  currentGeneratedAt,
  previousQuarter,
  termLastFetch,
}: {
  currentGeneratedAt: string;
  previousQuarter: QuarterPeriod;
  // Moc "lan tai gan nhat" cua TUNG ky (key `${yearPeriod}-${periodSlug}`,
  // xem buildTermLastFetchMap o app/page.tsx) - dung cho mode 'sinceLast'
  // duoi day.
  termLastFetch: Record<string, string>;
}) {
  const [terms, setTerms] = useState<ReportTerm[] | null>(null);
  const [termsError, setTermsError] = useState('');
  const [selectedKey, setSelectedKey] = useState('');

  // Mac dinh LUON la 'select' (tick chon tay tung bao cao) o MOI ky (yeu cau
  // user 2026-07-10) - 'sinceLast' CHI co y nghia khi isCurrentQuarter (Quy
  // "vua qua", xem effectiveMode/JSX duoi) va 'count' cho cac ky khac, nhung
  // ca 2 deu phai do NGUOI DUNG tu bam chuyen sang, khong con la mac dinh.
  const [filterMode, setFilterMode] = useState<FilterMode>('select');
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
  // Tim theo Ma CK trong danh muc preview (yeu cau user 2026-07-08) - reset
  // ve rong moi khi doi ky (giong selectedFileInfoIds, xem effect loadPreview
  // duoi).
  const [stockCodeQuery, setStockCodeQuery] = useState('');

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
  // Tim theo Ma CK (yeu cau user 2026-07-08) - so sanh khong phan biet hoa
  // thuong, cho phep go tat/mot phan ma (vd "id" khop "IDV").
  const filteredPreviewReports = useMemo(() => {
    const query = stockCodeQuery.trim().toUpperCase();
    if (!previewReports) return previewReports;
    if (!query) return previewReports;
    return previewReports.filter((report) => (report.stockCode ?? '').toUpperCase().includes(query));
  }, [previewReports, stockCodeQuery]);

  const busy = status === 'loading' || status === 'waiting';
  // Quy "vua qua" cho chon 1 trong 3 (sinceLast/count/select) - cac ky khac
  // chi cho count/select (khong co 'sinceLast', xem comment filterMode o
  // tren).
  const effectiveMode: FilterMode =
    filterMode === 'select' ? 'select' : isCurrentQuarter ? 'sinceLast' : 'count';

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
    setStockCodeQuery('');
    setFilterMode('select');
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

  // Chi bat/tat CAC BAO CAO DANG HIEN (sau khi loc theo Ma CK) - KHONG thay
  // the ca tap chon (yeu cau user 2026-07-08: them o tim Ma CK) - truoc do
  // luon goi voi toan bo previewReports nen thay the ca tap la an toan, gio
  // neu goi voi danh sach da loc se lam mat lua chon cua cac dong dang bi an
  // (ngoai bo loc) neu van thay the nguyen tap.
  function toggleSelectAll(visibleReports: ReportFile[]) {
    setSelectedFileInfoIds((prev) => {
      const allVisibleSelected = visibleReports.length > 0 && visibleReports.every((r) => prev.has(r.fileInfoID));
      const next = new Set(prev);
      for (const r of visibleReports) {
        if (allVisibleSelected) next.delete(r.fileInfoID);
        else next.add(r.fileInfoID);
      }
      return next;
    });
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
          ...(effectiveMode === 'sinceLast'
            ? { hoursWindow: sinceLastHoursForTerm(selectedTerm, termLastFetch) || undefined }
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
          {isCurrentQuarter ? (
            <button
              type="button"
              className={`mode-toggle-btn ${filterMode === 'sinceLast' ? 'active' : ''}`}
              onClick={() => setFilterMode('sinceLast')}
              disabled={inputsDisabled}
            >
              Từ lần tải cuối
            </button>
          ) : (
            <button
              type="button"
              className={`mode-toggle-btn ${filterMode === 'count' ? 'active' : ''}`}
              onClick={() => setFilterMode('count')}
              disabled={inputsDisabled}
            >
              Theo số báo cáo
            </button>
          )}
          <button
            type="button"
            className={`mode-toggle-btn ${filterMode === 'select' ? 'active' : ''}`}
            onClick={() => setFilterMode('select')}
            disabled={inputsDisabled}
          >
            Lựa chọn báo cáo
          </button>
        </div>

        {effectiveMode === 'sinceLast' && selectedTerm && (
          <span className="trigger-message">{sinceLastLabel(selectedTerm, termLastFetch)}</span>
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
          {previewStatus === 'ready' && previewReports && filteredPreviewReports && (
            <div className="report-table-wrapper preview-table-wrapper">
              <div className="summary-actions">
                <span className="muted-note">
                  {previewReports.length} báo cáo trong danh mục {periodDisplayLabel(selectedTerm)} (theo Vietstock)
                </span>
                <label className="field">
                  <span className="field-label">Tìm theo Mã CK</span>
                  <input
                    type="text"
                    value={stockCodeQuery}
                    onChange={(e) => setStockCodeQuery(e.target.value)}
                    placeholder="VD: IDV"
                  />
                </label>
              </div>
              <table className="report-table">
                <thead>
                  <tr>
                    {effectiveMode === 'select' && (
                      <th>
                        <input
                          type="checkbox"
                          checked={filteredPreviewReports.length > 0 && filteredPreviewReports.every((r) => selectedFileInfoIds.has(r.fileInfoID))}
                          onChange={() => toggleSelectAll(filteredPreviewReports)}
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
                  {filteredPreviewReports.length === 0 && (
                    <tr>
                      <td colSpan={effectiveMode === 'select' ? 7 : 6} className="empty-state">
                        Không tìm thấy mã CK nào khớp "{stockCodeQuery}".
                      </td>
                    </tr>
                  )}
                  {filteredPreviewReports.map((report, index) => (
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
