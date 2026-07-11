'use client';

import { useMemo, useState } from 'react';
import type { DownloadedReport } from '@/lib/status';
import { buildOriginalFileUrl } from '@/lib/original-file-url';

function collectLabels(reports: DownloadedReport[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const report of reports) {
    for (const item of report.analysis ?? []) {
      if (!seen.has(item.label)) {
        seen.add(item.label);
        labels.push(item.label);
      }
    }
  }
  return labels;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function excelFileHref(filePath: string): string {
  return `/api/report-file?filePath=${encodeURIComponent(filePath)}&kind=excel`;
}

export default function ReportsSummaryTable({ reports }: { reports: DownloadedReport[] }) {
  const labels = useMemo(() => collectLabels(reports), [reports]);
  const [stockCodeQuery, setStockCodeQuery] = useState('');

  // Tim theo Ma CK (yeu cau user 2026-07-08) - so sanh khong phan biet hoa
  // thuong, cho phep go tat/mot phan ma (vd "id" khop "IDV").
  const filteredReports = useMemo(() => {
    const query = stockCodeQuery.trim().toUpperCase();
    if (!query) return reports;
    return reports.filter((report) => (report.stockCode ?? '').toUpperCase().includes(query));
  }, [reports, stockCodeQuery]);

  return (
    <div className="report-table-wrapper">
      <div className="summary-actions">
        <label className="field">
          <span className="field-label">Tìm theo Mã CK</span>
          <input
            type="text"
            value={stockCodeQuery}
            onChange={(e) => setStockCodeQuery(e.target.value)}
            placeholder="VD: IDV"
          />
        </label>
        {labels.length === 0 && <span className="muted-note">(Chưa có tiêu chí đọc BCTC - cột % sẽ hiện khi có tiêu chí)</span>}
      </div>
      <table className="report-table">
        <thead>
          <tr>
            <th>STT</th>
            <th className="stockcode-col">Mã CK</th>
            <th className="exchange-col">Sàn GD</th>
            <th>Loại BCTC</th>
            {labels.map((label) => (
              <th key={label} className="pct-col-header">{label}</th>
            ))}
            <th>Xuất file</th>
          </tr>
        </thead>
        <tbody>
          {filteredReports.length === 0 && (
            <tr>
              <td colSpan={4 + labels.length + 1} className="empty-state">
                Không tìm thấy mã CK nào khớp "{stockCodeQuery}".
              </td>
            </tr>
          )}
          {filteredReports.map((report, index) => {
            const byLabel = new Map((report.analysis ?? []).map((item) => [item.label, item]));
            return (
              <tr key={report.filePath}>
                <td>{index + 1}</td>
                <td className="stockcode-col">
                  {/* Ten cong ty hien qua tooltip hover (title) thay vi cot rieng
                  (yeu cau user 2026-07-07) - do dai ten cong ty thuong lam bang
                  qua rong, trong khi Ma CK + San giao dich la du de nhan dien
                  nhanh, chi can xem ten day du khi thuc su can. */}
                  <a href={report.financeUrl} target="_blank" rel="noreferrer" title={report.companyName}>
                    {report.stockCode || '—'}
                  </a>
                </td>
                <td className="exchange-col">
                  <span className="exchange-tag">{report.exchange}</span>
                </td>
                <td>{report.statementScope}</td>
                {labels.map((label) => {
                  const item = byLabel.get(label);
                  // Uu tien canh bao "khong dang tin cay" (OCR co the da
                  // gop/bia dong, xem lib/analysis.ts) hon la mau tier binh
                  // thuong - percentChange da bi ep null cho truong hop nay
                  // nen tierClass tu nhien khong con ap dung (an toan).
                  if (item?.unreliable) {
                    return (
                      <td key={label} className="pct-col pct-unreliable" title="OCR có thể đã gộp/bịa dòng dữ liệu, đã thử đọc lại nhưng vẫn sai - cần xem tay trên PDF gốc">
                        ⚠ Cần xem tay
                      </td>
                    );
                  }
                  const tierClass = item?.tier === 'level1' ? 'pct-level1' : item?.tier === 'level2' ? 'pct-level2' : '';
                  return (
                    <td key={label} className={`pct-col ${tierClass}`}>
                      {formatPercent(item?.percentChange)}
                    </td>
                  );
                })}
                <td>
                  <div className="row-export-actions">
                    {/* Excel: khong doi - server dung THANG report.statements da
                    OCR san luc "Tai BCTC" (app/api/report-file), khong tai
                    lai/OCR lai gi ca. */}
                    <a className="secondary-button" href={excelFileHref(report.filePath)}>
                      Excel
                    </a>
                    {/* PDF: KHONG con OCR toan van (lib/export/full-document.ts,
                    da comment lai - xem app/api/report-file/route.ts) - mo
                    THANG file goc tren Vietstock o tab moi (yeu cau user
                    2026-07-07), trinh duyet tu tai/hien thi. */}
                    <a className="secondary-button" href={buildOriginalFileUrl(report)} target="_blank" rel="noreferrer">
                      PDF
                    </a>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
