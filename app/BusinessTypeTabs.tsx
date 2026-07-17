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
}: {
  reports: DownloadedReport[];
  selected?: Set<string>;
  onToggle?: (filePath: string) => void;
  onToggleAll?: (filePaths: string[]) => void;
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

  return (
    <div>
      <div className="tabs sub-tabs" role="tablist">
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

      {activeReports.length === 0 ? (
        <div className="empty-state">Chưa có báo cáo nào thuộc nhóm "{BUSINESS_TYPE_LABELS[active]}".</div>
      ) : (
        <ReportsSummaryTable reports={activeReports} selected={selected} onToggle={onToggle} onToggleAll={onToggleAll} />
      )}
    </div>
  );
}
