'use client';

import { useEffect, useState } from 'react';
import type { FailedReport } from '@/lib/status';

// Badge "X lỗi" o thanh thong ke dau trang (app/page.tsx) - truoc day CHI
// hien so luong, khong biet duoc bao cao nao bi loi/vi sao (yeu cau nguoi
// dung 2026-07-20, sau su co nghi timeout la "mat het" trong khi thuc ra chi
// mat vai bao cao cu the). Cung 1 kieu popup voi app/WarningBadge.tsx (bam mo
// modal giua man hinh, dong bang X/click ra ngoai/Escape) de dong bo giao
// dien, KHONG dung native title (tran man hinh khi dai - da rut kinh nghiem
// tu WarningBadge).
export default function FailedReportsBadge({ failed }: { failed: FailedReport[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (failed.length === 0) return null;

  return (
    <>
      <span
        className="report-warning-badge report-warning-badge-severe"
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {failed.length} lỗi
      </span>
      {open && (
        <div className="warning-modal-overlay" onClick={() => setOpen(false)}>
          <div className="warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="warning-modal-header">
              <strong>{failed.length} báo cáo bị lỗi</strong>
              <button type="button" className="warning-modal-close" onClick={() => setOpen(false)} aria-label="Đóng">
                ×
              </button>
            </div>
            <ul className="warning-modal-list">
              {failed.map((f, index) => (
                <li key={index}>
                  <strong>{f.stockCode}</strong> - {f.title}
                  {f.error ? `: ${f.error}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
