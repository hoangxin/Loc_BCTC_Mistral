'use client';

import { useMemo } from 'react';
import type { DownloadedReport } from '@/lib/status';

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

function reportFileHref(filePath: string, kind: 'excel' | 'pdf'): string {
  return `/api/report-file?filePath=${encodeURIComponent(filePath)}&kind=${kind}`;
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
            <th>Tên công ty</th>
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
                  <a href={report.financeUrl} target="_blank" rel="noreferrer">
                    {report.stockCode || '—'}
                  </a>
                </td>
                <td>{report.companyName}</td>
                <td>
                  <span className="exchange-tag">{report.exchange}</span>
                </td>
                <td>{report.title}</td>
                <td>{report.statementScope}</td>
                {labels.map((label) => (
                  <td key={label}>{formatPercent(byLabel.get(label))}</td>
                ))}
                <td>
                  {/* Xuat THEO YEU CAU (app/api/report-file) - tai lai file goc
                  tu fileUrl + OCR toan van tu dau moi lan bam, KHONG doc file
                  co san (khong con file nao duoc tao san luc "Tai BCTC" nua -
                  xem lib/pipeline.ts). Luon bat, khong can kiem tra dieu kien. */}
                  <div className="row-export-actions">
                    <a className="secondary-button" href={reportFileHref(report.filePath, 'excel')}>
                      Excel
                    </a>
                    <a className="secondary-button" href={reportFileHref(report.filePath, 'pdf')}>
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
