'use client';

import { useMemo, useState } from 'react';
import type { DownloadedReport } from '@/lib/status';
import { buildOriginalFileUrl } from '@/lib/original-file-url';
import WarningBadge from './WarningBadge';
import ExportSummaryButton from './ExportSummaryButton';
import ClearResultsButton from './ClearResultsButton';

function collectLabels(reports: DownloadedReport[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const report of reports) {
    for (const item of report.analysis ?? []) {
      if (!seen.has(item.label)) {
        seen.add(item.label);
        labels.push(item.label);
      }
    }
  }
  return labels;
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function excelFileHref(filePath: string): string {
  return `/api/report-file?filePath=${encodeURIComponent(filePath)}&kind=excel`;
}

// Checkbox chon bao cao (yeu cau nguoi dung 2026-07-17 - nut "Xuat Excel tong
// hop"/"Xoa ket qua" tren tung tab "Ket qua {ky}" can chon dung vai bao cao
// thay vi luon ap dung ca ky) - state SONG (Set<filePath>) song o component
// cha (PeriodResultsPanel) de giu nguyen lua chon khi chuyen qua lai giua cac
// tab loai hinh DN (BusinessTypeTabs), khong reset moi lan doi tab. selected/
// onToggle/onToggleAll deu TUY CHON - bo qua het (khong hien cot checkbox) o
// noi con dung bang nay ma chua can chon (hien khong con noi nao khac dung
// component nay ngoai PeriodResultsPanel, giu tuy chon de an toan/de tai su
// dung sau nay).
export default function ReportsSummaryTable({
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
  // Nut Xuat/Xoa (yeu cau nguoi dung 2026-07-18 - dua len CHUNG dong voi o tim
  // kiem thay vi 1 dong rieng phia tren, toi da khong gian doc cho bang) - mo
  // ta CA KY dang mo (khong phai chi cac dong dang hien trong bang nay sau khi
  // loc theo nhom loai hinh/Ma CK), truyen tu PeriodResultsPanel qua
  // BusinessTypeTabs xuong day nguyen ven. Bo qua ca 3 (khong hien nut) neu
  // khong truyen - giu component nay dung duoc o noi khac ma chua can nut.
  allFilePaths?: string[];
  selectedFilePaths?: string[];
  currentGeneratedAt?: string;
}) {
  const labels = useMemo(() => collectLabels(reports), [reports]);
  const [stockCodeQuery, setStockCodeQuery] = useState('');

  // Tim theo Ma CK (yeu cau user 2026-07-08) - so sanh khong phan biet hoa
  // thuong, cho phep go tat/mot phan ma (vd "id" khop "IDV").
  const filteredReports = useMemo(() => {
    const query = stockCodeQuery.trim().toUpperCase();
    if (!query) return reports;
    return reports.filter((report) => (report.stockCode ?? '').toUpperCase().includes(query));
  }, [reports, stockCodeQuery]);

  return (
    <div className="report-table-wrapper">
      <div className="summary-actions">
        <label className="field">
          <span className="field-label">Tìm theo Mã CK</span>
          <input
            type="text"
            value={stockCodeQuery}
            onChange={(e) => setStockCodeQuery(e.target.value)}
            placeholder="VD: IDV"
          />
        </label>
        {labels.length === 0 && <span className="muted-note">(Chưa có tiêu chí đọc BCTC - cột % sẽ hiện khi có tiêu chí)</span>}
        {allFilePaths && selectedFilePaths && currentGeneratedAt !== undefined && (
          <div className="summary-actions-buttons">
            <ExportSummaryButton allFilePaths={allFilePaths} selectedFilePaths={selectedFilePaths} />
            <ClearResultsButton
              allFilePaths={allFilePaths}
              selectedFilePaths={selectedFilePaths}
              currentGeneratedAt={currentGeneratedAt}
            />
          </div>
        )}
      </div>
      <table className="report-table">
        <thead>
          <tr>
            {onToggleAll && (
              <th>
                <input
                  type="checkbox"
                  checked={filteredReports.length > 0 && filteredReports.every((r) => selected?.has(r.filePath))}
                  onChange={() => onToggleAll(filteredReports.map((r) => r.filePath))}
                  aria-label="Chọn tất cả"
                />
              </th>
            )}
            <th>Xuất file</th>
            <th className="stockcode-col">Mã CK</th>
            <th className="exchange-col">Sàn GD</th>
            <th>Loại BCTC</th>
            {labels.map((label) => (
              <th key={label} className="pct-col-header">{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filteredReports.length === 0 && (
            <tr>
              <td colSpan={3 + labels.length + 1 + (onToggleAll ? 1 : 0)} className="empty-state">
                Không tìm thấy mã CK nào khớp "{stockCodeQuery}".
              </td>
            </tr>
          )}
          {filteredReports.map((report) => {
            const byLabel = new Map((report.analysis ?? []).map((item) => [item.label, item]));
            return (
              <tr key={report.filePath}>
                {onToggle && (
                  <td>
                    <input
                      type="checkbox"
                      checked={selected?.has(report.filePath) ?? false}
                      onChange={() => onToggle(report.filePath)}
                      aria-label={`Chọn báo cáo ${report.stockCode}`}
                    />
                  </td>
                )}
                <td>
                  <div className="row-export-actions">
                    {/* Excel: khong doi - server dung THANG report.statements da
                    OCR san luc "Tai BCTC" (app/api/report-file), khong tai
                    lai/OCR lai gi ca. */}
                    <a className="secondary-button" href={excelFileHref(report.filePath)}>
                      Excel
                    </a>
                    {/* PDF: KHONG con OCR toan van (lib/export/full-document.ts,
                    da comment lai - xem app/api/report-file/route.ts) - mo
                    THANG file goc tren Vietstock o tab moi (yeu cau user
                    2026-07-07), trinh duyet tu tai/hien thi. */}
                    <a className="secondary-button" href={buildOriginalFileUrl(report)} target="_blank" rel="noreferrer">
                      PDF
                    </a>
                  </div>
                </td>
                <td className="stockcode-col">
                  {/* Ten cong ty hien qua tooltip hover (title) thay vi cot rieng
                  (yeu cau user 2026-07-07) - do dai ten cong ty thuong lam bang
                  qua rong, trong khi Ma CK + San giao dich la du de nhan dien
                  nhanh, chi can xem ten day du khi thuc su can. */}
                  <a href={report.financeUrl} target="_blank" rel="noreferrer" title={report.companyName}>
                    {report.stockCode || '—'}
                  </a>
                  {/* Canh bao parse (validateFinancialStatements, xem
                  lib/export/financial-statements.ts) TRUOC DAY chi nam trong
                  data/latest-fetch.json, KHONG hien o dau trong UI ca - nguoi
                  dung phai tu mo Excel moi phat hien bang rong (yeu cau nguoi
                  dung 2026-07-12, sau bug SHS). Danh dau rieng biet (do dam
                  hon) cho truong hop CA 3 BANG deu rong (canh bao dau tien bat
                  dau bang "CANH BAO:", xem extractFinancialStatementsWithOcrProbe)
                  - khac han vai canh bao nho (vd thieu 1 dong phu). */}
                  {report.warnings.length > 0 && (() => {
                    // 3 muc do (yeu cau nguoi dung 2026-07-12): "CANH BAO:" (ca
                    // 3 bang rong) do dam nhat; canh bao THAT SU (phat hien so
                    // lieu lech nhau) mau vang binh thuong; "KHONG DU TIN HIEU:"
                    // (chi la thieu du lieu de xac minh sau hon, KHONG PHAI loi/
                    // sai lech - xem validateFinancialStatements) hien MO nhat,
                    // tranh gay hoang khi phan lon chi la "khong kiem tra duoc"
                    // chu khong phai "sai".
                    const isSevere = report.warnings[0].startsWith('CANH BAO:');
                    const isOnlyUnverifiable = !isSevere && report.warnings.every((w) => w.startsWith('KHONG DU TIN HIEU:'));
                    const severityClass = isSevere
                      ? 'report-warning-badge-severe'
                      : isOnlyUnverifiable
                        ? 'report-warning-badge-muted'
                        : '';
                    return <WarningBadge warnings={report.warnings} severityClass={severityClass} />;
                  })()}
                </td>
                <td className="exchange-col">
                  <span className="exchange-tag">{report.exchange}</span>
                </td>
                <td>{report.statementScope}</td>
                {labels.map((label) => {
                  const item = byLabel.get(label);
                  // Uu tien canh bao "khong dang tin cay" (OCR co the da
                  // gop/bia dong, xem lib/analysis.ts) hon la mau tier binh
                  // thuong - percentChange da bi ep null cho truong hop nay
                  // nen tierClass tu nhien khong con ap dung (an toan).
                  if (item?.unreliable) {
                    return (
                      <td key={label} className="pct-col pct-unreliable" title="OCR có thể đã gộp/bịa dòng dữ liệu, đã thử đọc lại nhưng vẫn sai - cần xem tay trên PDF gốc">
                        ⚠ Cần xem tay
                      </td>
                    );
                  }
                  const tierClass = item?.tier === 'level1' ? 'pct-level1' : item?.tier === 'level2' ? 'pct-level2' : '';
                  return (
                    <td key={label} className={`pct-col ${tierClass}`}>
                      {formatPercent(item?.percentChange)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
