'use client';

import { useEffect, useState } from 'react';
import type { InterruptedReport } from '@/lib/status';

// Badge "X dở dang" o thanh thong ke dau trang (app/page.tsx) - phat hien bao
// cao NAM TRONG danh sach da loc nhung tien trinh bi GitHub Actions giet giua
// chung (cham timeout-minutes) TRUOC KHI kip xu ly xong - khac FailedReportsBadge
// (loi CO thong bao ro rang), day la truong hop KHONG co loi nao ca, chi don
// gian la chua chay toi. Truoc khi co badge nay, cac bao cao dang bi coi la
// "da tai thanh cong" (dem trong `downloaded`) nhung roi bien mat im lang
// khoi ca "reports" lan "failed" - nguoi dung khong co cach nao biet chinh
// xac ma nao can tai lai (xem PHN 2026-07-20, su co bao cao KHP/AAS/HAR/SBS).
export default function InterruptedReportsBadge({ interrupted }: { interrupted: InterruptedReport[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (interrupted.length === 0) return null;

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
        {interrupted.length} dở dang
      </span>
      {open && (
        <div className="warning-modal-overlay" onClick={() => setOpen(false)}>
          <div className="warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="warning-modal-header">
              <strong>{interrupted.length} báo cáo chưa xử lý xong (lần chạy trước bị ngắt giữa chừng)</strong>
              <button type="button" className="warning-modal-close" onClick={() => setOpen(false)} aria-label="Đóng">
                ×
              </button>
            </div>
            <ul className="warning-modal-list">
              {interrupted.map((r, index) => (
                <li key={index}>
                  <strong>{r.stockCode}</strong> - {r.title}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
