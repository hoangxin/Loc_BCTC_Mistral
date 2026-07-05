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
                  {/* Tro thang vao file 3 bang BCTC (Can doi ke toan/KQKD/Luu
                  chuyen tien te) da duoc Mistral OCR trich va ghi san luc chay
                  pipeline (report.excelPath/cleanPdfPath, xem lib/export/index.ts)
                  - KHONG phai bang tong hop % (xem lib/export/summary-excel.ts,
                  hien chua co UI nao goi toi, cho tieu chi that + quyet dinh
                  lai cach dung). */}
                  <div className="row-export-actions">
                    {report.excelPath ? (
                      <a className="secondary-button" href={reportFileHref(report.filePath, 'excel')}>
                        Excel
                      </a>
                    ) : (
                      <button className="secondary-button" disabled title="Chưa có file Excel cho báo cáo này">
                        Excel
                      </button>
                    )}
                    {report.cleanPdfPath ? (
                      <a className="secondary-button" href={reportFileHref(report.filePath, 'pdf')}>
                        PDF
                      </a>
                    ) : (
                      <button className="secondary-button" disabled title="Chưa có file PDF cho báo cáo này">
                        PDF
                      </button>
                    )}
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
