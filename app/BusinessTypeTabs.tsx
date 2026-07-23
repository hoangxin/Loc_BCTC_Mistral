'use client';

import { useMemo, useState } from 'react';
import type { DownloadedReport } from '@/lib/status';
import { BUSINESS_TYPE_LABELS, BUSINESS_TYPE_ORDER, type BusinessType } from '@/lib/business-type';
import ReportsSummaryTable from './ReportsSummaryTable';

// Tach ket qua theo 4 nhom doanh nghiep (yeu cau user 2026-07-07) - moi nhom
// BCTC theo mau bieu phap ly khac nhau (xem lib/business-type.ts) nen sau nay
// se co tieu chi % rieng cho tung nhom, khong gop chung 1 bang duoc nua.
export default function BusinessTypeTabs({
  reports,
  selected,
  onToggle,
  onToggleAll,
  allFilePaths,
  selectedFilePaths,
  currentGeneratedAt,
}: {
  reports: DownloadedReport[];
  selected?: Set<string>;
  onToggle?: (filePath: string) => void;
  onToggleAll?: (filePaths: string[]) => void;
  // 3 truong duoi day mo ta CA KY (khong phai chi nhom loai hinh DN dang active)
  // - truyen thang xuong ReportsSummaryTable de nut Xuat/Xoa hien tren cung
  // dong voi o tim kiem (yeu cau nguoi dung 2026-07-18), KHONG suy tu `reports`
  // (da bi loc theo 1 nhom loai hinh) o day.
  allFilePaths?: string[];
  selectedFilePaths?: string[];
  currentGeneratedAt?: string;
}) {
  const grouped = useMemo(() => {
    const map = new Map<BusinessType, DownloadedReport[]>(BUSINESS_TYPE_ORDER.map((type) => [type, []]));
    for (const report of reports) {
      // Fallback 'other' cho du lieu cu tu truoc khi co truong nay (data/latest-fetch.json
      // da commit san khong co businessType) - tranh crash vi map.get(undefined).
      const type = (BUSINESS_TYPE_ORDER as string[]).includes(report.businessType) ? report.businessType : 'other';
      map.get(type)!.push(report);
    }
    return map;
  }, [reports]);

  const firstNonEmpty = BUSINESS_TYPE_ORDER.find((type) => (grouped.get(type)?.length ?? 0) > 0) ?? BUSINESS_TYPE_ORDER[0];
  const [active, setActive] = useState<BusinessType>(firstNonEmpty);
  const activeReports = grouped.get(active) ?? [];

  // SUA 2026-07-23 (yeu cau nguoi dung: ghep dong tab nhom loai hinh voi dong
  // Tim-Ma-CK/Watchlist/Xuat/Xoa thanh 1 dong de tiet kiem dien tich doc) -
  // JSX cac nut tab GIU NGUYEN, chi doi CACH RENDER: truyen vao ReportsSummaryTable
  // qua prop tabsSlot de no ve CHUNG trong .summary-actions (class
  // "sub-tabs-inline" bo border-bottom/margin-bottom rieng cua .sub-tabs, vi
  // gio dung border-bottom CHUNG cua .summary-actions). Van giu 1 ban RIENG o
  // nhanh "empty-state" (khi nhom dang chon khong co bao cao nao) - luc do
  // ReportsSummaryTable KHONG duoc render nen khong co .summary-actions nao de
  // ghep cung, tab van phai hien de nguoi dung chuyen sang nhom khac.
  const tabButtons = (
    <div className="tabs sub-tabs sub-tabs-inline" role="tablist">
      {BUSINESS_TYPE_ORDER.map((type) => {
        const count = grouped.get(type)?.length ?? 0;
        return (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={active === type}
            className={`tab-button ${active === type ? 'active' : ''}`}
            onClick={() => setActive(type)}
          >
            {BUSINESS_TYPE_LABELS[type]} ({count})
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex-col-fill" style={{ display: 'flex' }}>
      {activeReports.length === 0 ? (
        <>
          {tabButtons}
          <div className="empty-state">Chưa có báo cáo nào thuộc nhóm "{BUSINESS_TYPE_LABELS[active]}".</div>
        </>
      ) : (
        <ReportsSummaryTable
          reports={activeReports}
          selected={selected}
          onToggle={onToggle}
          onToggleAll={onToggleAll}
          allFilePaths={allFilePaths}
          selectedFilePaths={selectedFilePaths}
          currentGeneratedAt={currentGeneratedAt}
          tabsSlot={tabButtons}
        />
      )}
    </div>
  );
}
