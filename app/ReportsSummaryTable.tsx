'use client';

import { useMemo } from 'react';
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

  return (
    <div className="report-table-wrapper">
      {labels.length === 0 && (
        <div className="summary-actions">
          <span className="muted-note">(Chưa có tiêu chí đọc BCTC - cột % sẽ hiện khi có tiêu chí)</span>
        </div>
      )}
      <table className="report-table">
        <thead>
          <tr>
            <th>STT</th>
            <th>Mã CK</th>
            <th>Sàn giao dịch</th>
            <th>Tên tài liệu</th>
            <th>Loại BCTC</th>
            {labels.map((label) => (
              <th key={label}>{label}</th>
            ))}
            <th>Xuất file</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report, index) => {
            const byLabel = new Map((report.analysis ?? []).map((item) => [item.label, item.percentChange]));
            return (
              <tr key={report.filePath}>
                <td>{index + 1}</td>
                <td>
                  {/* Ten cong ty hien qua tooltip hover (title) thay vi cot rieng
                  (yeu cau user 2026-07-07) - do dai ten cong ty thuong lam bang
                  qua rong, trong khi Ma CK + San giao dich la du de nhan dien
                  nhanh, chi can xem ten day du khi thuc su can. */}
                  <a href={report.financeUrl} target="_blank" rel="noreferrer" title={report.companyName}>
                    {report.stockCode || '—'}
                  </a>
                </td>
                <td>
                  <span className="exchange-tag">{report.exchange}</span>
                </td>
                <td>{report.title}</td>
                <td>{report.statementScope}</td>
                {labels.map((label) => (
                  <td key={label}>{formatPercent(byLabel.get(label))}</td>
                ))}
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
