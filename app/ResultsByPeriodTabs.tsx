'use client';

import { useMemo, useState } from 'react';
import type { DownloadedReport } from '@/lib/status';
import { comparePeriodDesc, periodSlugDisplayLabel } from '@/lib/period-label';
import PeriodResultsPanel from './PeriodResultsPanel';

interface PeriodGroup {
  key: string;
  periodYear: number;
  periodSlug: string;
  label: string;
  reports: DownloadedReport[];
}

// Tach tab "Ket qua" lam N tab con, MOI KY BAO CAO 1 tab rieng (vd "Ket qua
// Quy 2/2026", "Ket qua Quy 1/2026") - yeu cau nguoi dung 2026-07-17: truoc
// day gop chung TAT CA cac ky da tai vao 1 bang duy nhat (BusinessTypeTabs
// nhan thang status.reports), kho phan biet dang xem ky nao khi da tich luy
// nhieu ky. Ky moi nhat hien truoc (comparePeriodDesc).
export default function ResultsByPeriodTabs({
  reports,
  currentGeneratedAt,
}: {
  reports: DownloadedReport[];
  currentGeneratedAt: string;
}) {
  const groups = useMemo<PeriodGroup[]>(() => {
    const map = new Map<string, PeriodGroup>();
    for (const report of reports) {
      const key = `${report.periodYear}-${report.periodSlug}`;
      const existing = map.get(key);
      if (existing) {
        existing.reports.push(report);
      } else {
        map.set(key, {
          key,
          periodYear: report.periodYear,
          periodSlug: report.periodSlug,
          label: periodSlugDisplayLabel(report.periodYear, report.periodSlug),
          reports: [report],
        });
      }
    }
    // Trong TUNG ky, xep ma nao TAI/CAP NHAT GAN NHAT len tren cung (yeu cau
    // nguoi dung 2026-07-17) - status.reports luon noi bao cao MOI vao CUOI
    // mang (khong ghi de tai cho cu - xem [...keptReports, ...newReports] o
    // lib/pipeline.ts runFetchPipeline va [...status.reports, report] o
    // addCustomReport), nen dao nguoc thu tu trong 1 nhom = moi nhat truoc.
    for (const group of map.values()) group.reports.reverse();
    return Array.from(map.values()).sort(comparePeriodDesc);
  }, [reports]);

  const [active, setActive] = useState<string | null>(null);
  const activeKey = active && groups.some((g) => g.key === active) ? active : (groups[0]?.key ?? null);
  const activeGroup = groups.find((g) => g.key === activeKey) ?? null;

  if (groups.length === 0) return null;

  return (
    <div className="flex-col-fill" style={{ display: 'flex' }}>
      <div className="tabs" role="tablist">
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            role="tab"
            aria-selected={activeKey === group.key}
            className={`tab-button ${activeKey === group.key ? 'active' : ''}`}
            onClick={() => setActive(group.key)}
          >
            Kết quả {group.label} ({group.reports.length})
          </button>
        ))}
      </div>

      {activeGroup && <PeriodResultsPanel reports={activeGroup.reports} currentGeneratedAt={currentGeneratedAt} />}
    </div>
  );
}
