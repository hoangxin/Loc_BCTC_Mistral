'use client';

import { useState } from 'react';

type Status = 'idle' | 'loading' | 'error';

// Nut xuat file tong hop (nhieu ma CK, 1 file .xlsx duy nhat) - goi
// app/api/export-summary (co san tu truoc, xem lib/export/summary-excel.ts)
// nhung truoc gio chua co nut nao tren UI goi toi (xem README) vi chua co
// tieu chi % that. Gio da co 21 chi tieu (lib/analysis.ts) nen gan lai
// (yeu cau user 2026-07-08). Luon xuat CA report hien co trong tab Ket qua
// (khong phu thuoc dang o tab loai hinh DN nao), giong pham vi cua summary-bar
// o tren.
export default function ExportSummaryButton({ filePaths }: { filePaths: string[] }) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function doExport() {
    setStatus('loading');
    setMessage('');
    try {
      const response = await fetch('/api/export-summary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filePaths, format: 'xlsx' }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setMessage(data?.error || 'Có lỗi xảy ra.');
        setStatus('error');
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bang-tong-hop.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('idle');
    } catch {
      setMessage('Không kết nối được tới server.');
      setStatus('error');
    }
  }

  const busy = status === 'loading';

  return (
    <div className="trigger-row">
      <button className="secondary-button" onClick={doExport} disabled={busy || filePaths.length === 0}>
        {busy ? 'Đang xuất...' : 'Xuất Excel tổng hợp'}
      </button>
      {message && <span className="trigger-message trigger-message-error">{message}</span>}
    </div>
  );
}
