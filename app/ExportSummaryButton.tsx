'use client';

import { useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'loading' | 'error';

// Nut xuat file tong hop (nhieu ma CK, 1 file .xlsx duy nhat) - goi
// app/api/export-summary (co san tu truoc, xem lib/export/summary-excel.ts).
//
// SUA 2026-07-17 (yeu cau nguoi dung - moi tab "Ket qua {ky}" can nut nay voi
// 2 lua chon thay vi luon xuat CA ky): bam nut mo menu 2 dong "Xuat tat ca (N
// bao cao)" / "Xuat bao cao da chon (N)" - dong sau bi vo hieu neu chua tick
// dong nao (selectedFilePaths rong). allFilePaths = toan bo bao cao trong KY
// dang mo (khong phai toan bo he thong - moi tab da tu loc theo ky, xem
// PeriodResultsPanel).
export default function ExportSummaryButton({
  allFilePaths,
  selectedFilePaths,
}: {
  allFilePaths: string[];
  selectedFilePaths: string[];
}) {
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [menuOpen]);

  async function doExport(filePaths: string[]) {
    setMenuOpen(false);
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
      <div className="split-button" ref={wrapperRef}>
        <button
          className="secondary-button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={busy || allFilePaths.length === 0}
        >
          {busy ? 'Đang xuất...' : 'Xuất Excel tổng hợp ▾'}
        </button>
        {menuOpen && (
          <div className="split-button-menu">
            <button className="split-button-menu-item" onClick={() => doExport(allFilePaths)}>
              Xuất tất cả ({allFilePaths.length} báo cáo)
            </button>
            <button
              className="split-button-menu-item"
              onClick={() => doExport(selectedFilePaths)}
              disabled={selectedFilePaths.length === 0}
            >
              Xuất báo cáo đã chọn ({selectedFilePaths.length})
            </button>
          </div>
        )}
      </div>
      {message && <span className="trigger-message trigger-message-error">{message}</span>}
    </div>
  );
}
