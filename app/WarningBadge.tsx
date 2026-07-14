'use client';

import { useEffect, useState } from 'react';

// Truoc day dung title="..." (native browser tooltip) - khi warnings dai
// (nhieu dong cross-check) tooltip bi TRAN KHOI MAN HINH, khong co scroll,
// nguoi dung khong xem het duoc (yeu cau nguoi dung 2026-07-14, xem anh chup
// man hinh). Doi sang popup rieng: bam vao badge (KHONG dieu huong trang, day
// chi la <span role="button">, khong phai <a>) mo modal giua man hinh, list
// warnings cuon duoc (max-height + overflow-y auto) - dong bang nut X, bam ra
// ngoai overlay, hoac phim Escape. Dung position: fixed (khong can React
// portal) de khong bi report-table-wrapper (overflow-x: auto) cat mat.
export default function WarningBadge({ warnings, severityClass }: { warnings: string[]; severityClass: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (warnings.length === 0) return null;

  return (
    <>
      <span
        className={`report-warning-badge ${severityClass}`}
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
        ⚠ {warnings.length}
      </span>
      {open && (
        <div className="warning-modal-overlay" onClick={() => setOpen(false)}>
          <div className="warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="warning-modal-header">
              <strong>{warnings.length} cảnh báo</strong>
              <button type="button" className="warning-modal-close" onClick={() => setOpen(false)} aria-label="Đóng">
                ×
              </button>
            </div>
            <ul className="warning-modal-list">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
