'use client';

import { useState } from 'react';
import type { DownloadedReport } from '@/lib/status';
import BusinessTypeTabs from './BusinessTypeTabs';
import ExportSummaryButton from './ExportSummaryButton';
import ClearResultsButton from './ClearResultsButton';

// Noi dung 1 tab "Ket qua {ky}" (xem ResultsByPeriodTabs) - giu state chon
// bao cao (checkbox) O DAY, khong o ReportsSummaryTable, de lua chon SONG khi
// nguoi dung chuyen qua lai giua cac tab loai hinh DN (BusinessTypeTabs) ben
// trong CUNG 1 ky - moi tab loai hinh chi hien 1 phan reports nhung phai dung
// chung 1 Set filePath (yeu cau nguoi dung 2026-07-17: nut Xuat/Xoa "theo lua
// chon" phai ap dung dung nhung gi da tick, bat ke dang o tab loai hinh nao).
export default function PeriodResultsPanel({
  reports,
  currentGeneratedAt,
}: {
  reports: DownloadedReport[];
  currentGeneratedAt: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(filePath: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  }

  function toggleAll(filePaths: string[]) {
    setSelected((prev) => {
      const allChecked = filePaths.every((p) => prev.has(p));
      const next = new Set(prev);
      if (allChecked) filePaths.forEach((p) => next.delete(p));
      else filePaths.forEach((p) => next.add(p));
      return next;
    });
  }

  const allFilePaths = reports.map((r) => r.filePath);
  const selectedFilePaths = allFilePaths.filter((p) => selected.has(p));

  return (
    <div>
      <div className="summary-actions summary-actions-end">
        <ExportSummaryButton allFilePaths={allFilePaths} selectedFilePaths={selectedFilePaths} />
        <ClearResultsButton
          allFilePaths={allFilePaths}
          selectedFilePaths={selectedFilePaths}
          currentGeneratedAt={currentGeneratedAt}
        />
      </div>
      <BusinessTypeTabs reports={reports} selected={selected} onToggle={toggle} onToggleAll={toggleAll} />
    </div>
  );
}
