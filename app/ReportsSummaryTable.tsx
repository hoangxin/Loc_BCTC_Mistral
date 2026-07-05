'use client';

import { useMemo, useState } from 'react';
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

async function downloadExport(filePaths: string[], format: 'xlsx' | 'pdf') {
  const response = await fetch('/api/export-summary', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filePaths, format }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    alert(data?.error || 'Xuất file thất bại.');
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = format === 'xlsx' ? 'bang-tong-hop.xlsx' : 'bang-tong-hop.pdf';
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function ReportsSummaryTable({ reports }: { reports: DownloadedReport[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const labels = useMemo(() => collectLabels(reports), [reports]);

  function toggle(filePath: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === reports.length ? new Set() : new Set(reports.map((r) => r.filePath))));
  }

  const selectedPaths = [...selected];

  return (
    <div className="report-table-wrapper">
      <div className="summary-actions">
        <button className="secondary-button" disabled={selectedPaths.length === 0} onClick={() => downloadExport(selectedPaths, 'xlsx')}>
          Xuất Excel
        </button>
        <button className="secondary-button" disabled={selectedPaths.length === 0} onClick={() => downloadExport(selectedPaths, 'pdf')}>
          Xuất PDF
        </button>
        {labels.length === 0 && <span className="muted-note">(Chưa có tiêu chí đọc BCTC - cột % sẽ hiện khi có tiêu chí)</span>}
      </div>
      <table className="report-table">
        <thead>
          <tr>
            <th>STT</th>
            <th>Mã CK</th>
            <th>Tên công ty</th>
            <th>Loại BCTC</th>
            {labels.map((label) => (
              <th key={label}>{label}</th>
            ))}
            <th>
              <input type="checkbox" checked={reports.length > 0 && selected.size === reports.length} onChange={toggleAll} />
            </th>
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
                <td>{report.statementScope}</td>
                {labels.map((label) => (
                  <td key={label}>{formatPercent(byLabel.get(label))}</td>
                ))}
                <td>
                  <input type="checkbox" checked={selected.has(report.filePath)} onChange={() => toggle(report.filePath)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
