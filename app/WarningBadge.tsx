'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Truoc day dung title="..." (native browser tooltip) - khi warnings dai
// (nhieu dong cross-check) tooltip bi TRAN KHOI MAN HINH, khong co scroll,
// nguoi dung khong xem het duoc (yeu cau nguoi dung 2026-07-14, xem anh chup
// man hinh). Doi sang popup rieng: bam vao badge (KHONG dieu huong trang, day
// chi la <span role="button">, khong phai <a>) mo modal giua man hinh, list
// warnings cuon duoc (max-height + overflow-y auto) - dong bang nut X, bam ra
// ngoai overlay, hoac phim Escape. Dung position: fixed.
//
// SUA 2026-07-22 (bug that: sau khi them "dong bang" dong tieu de bang
// - .report-table th { position: sticky; z-index: 2 }, commit 8d52563 - bam
// nut "Đóng"/click ra ngoai overlay o 1 so vi tri BI CHAN, khong dong duoc:
// <th> sticky (mac du z-index THAP HON HAN overlay, 2 vs 1000) van "chan"
// pointer event cua overlay ngay ben tren no theo hit-test cua trinh duyet -
// day la quirk da biet cua position:sticky trong bang HTML (dedicated
// compositing layer) khi phan tu position:fixed KHONG duoc portal ra NGOAI
// cay DOM cua bang, van con la CON CHAU sau trong cung <table>/<tbody>/<tr>/<td>.
// Dung LAI CHINH giai phap da dung cho MuteableHighlightCell (xem
// ReportsSummaryTable.tsx) - createPortal ra document.body, thoat han khoi
// stacking context cua bang thay vi chi dua vao position:fixed (truoc day
// tuong lam vay la du, chi giai quyet duoc van de OVERFLOW CAT MAT, khong
// giai quyet duoc van de STACKING/HIT-TEST voi sticky th).
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
      {open &&
        typeof document !== 'undefined' &&
        createPortal(
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
          </div>,
          document.body,
        )}
    </>
  );
}
