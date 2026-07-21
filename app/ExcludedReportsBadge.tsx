'use client';

import { useEffect, useState } from 'react';
import type { ExcludedReport } from '@/lib/status';

// Badge "X bị loại" o thanh thong ke dau trang (app/page.tsx) - hien cac bao
// cao bi loai CO CHU DICH (khong phai loi, khac FailedReportsBadge; cung
// khong phai "chua xu ly xong" nhu InterruptedReportsBadge) o 1 trong 2 diem:
// truoc khi tai (loc theo san GD/Rieng le/ma dai, xem lib/filter.ts) hoac sau
// khi tai (toan bo file trong nhom bi coi khong phai tieng Viet). Them
// 2026-07-21 sau bug that: 50 bao cao chon tay ra 48 ket qua, KHONG CO CACH
// NAO biet duoc bao cao nao/vi sao bi thieu - truoc day 2 truong hop nay hoan
// toan im lang, khong o dau trong FetchStatus ca.
export default function ExcludedReportsBadge({ excluded }: { excluded: ExcludedReport[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (excluded.length === 0) return null;

  return (
    <>
      <span
        className="report-warning-badge"
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
        {excluded.length} bị loại
      </span>
      {open && (
        <div className="warning-modal-overlay" onClick={() => setOpen(false)}>
          <div className="warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="warning-modal-header">
              <strong>{excluded.length} báo cáo bị loại có chủ đích (không phải lỗi)</strong>
              <button type="button" className="warning-modal-close" onClick={() => setOpen(false)} aria-label="Đóng">
                ×
              </button>
            </div>
            <ul className="warning-modal-list">
              {excluded.map((r, index) => (
                <li key={index}>
                  <strong>{r.stockCode}</strong> - {r.title}
                  <br />
                  <span className="muted-note">{r.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
