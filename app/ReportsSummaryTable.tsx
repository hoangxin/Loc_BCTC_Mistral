'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DownloadedReport } from '@/lib/status';
import { buildOriginalFileUrl } from '@/lib/original-file-url';
import WarningBadge from './WarningBadge';
import ExportSummaryButton from './ExportSummaryButton';
import ClearResultsButton from './ClearResultsButton';
import WatchlistButton from './WatchlistButton';
import { useWatchlist, type HighlightState } from './WatchlistContext';

// Key trang thai highlight cho 1 o chi tieu (yeu cau nguoi dung 2026-07-18) -
// theo filePath (khong phai stockCode) vi 1 ma CK co the co nhieu bao cao
// (nhieu ky/loai BCTC) voi trang thai doc lap nhau.
function highlightKey(filePath: string, label: string): string {
  return `${filePath}::${label}`;
}

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

// Sap xep theo cot chi tieu (yeu cau nguoi dung 2026-07-20) - bam vao tieu de
// cot % de sap theo GIA TRI (percentChange) thay vi chi xem duoc tung dong
// rieng le. Chu trinh 3 trang thai/lan bam CUNG 1 cot: null (mac dinh) ->
// 'desc' (lon nhat truoc) -> 'asc' (nho nhat truoc) -> null. Bam sang COT
// KHAC luon bat dau lai o 'desc'. null = quay ve sap xep MAC DINH theo thoi
// gian tai gan nhat (report.lastUpdate giam dan) - CHU DONG sap lai theo
// truong nay thay vi chi dua vao thu tu mang truyen vao, vi thu tu do KHONG
// dam bao la theo lastUpdate (status.reports gop bao cao MOI vao CUOI mang,
// xem lib/pipeline.ts).
type SortState = { label: string; direction: 'desc' | 'asc' } | null;

function getPercentValue(report: DownloadedReport, label: string): number | null {
  const item = (report.analysis ?? []).find((i) => i.label === label);
  return item?.unreliable ? null : (item?.percentChange ?? null);
}

function sortReports(reports: DownloadedReport[], sortState: SortState): DownloadedReport[] {
  if (!sortState) {
    return [...reports].sort((a, b) => new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime());
  }
  const { label, direction } = sortState;
  return [...reports].sort((a, b) => {
    const av = getPercentValue(a, label);
    const bv = getPercentValue(b, label);
    // Gia tri thieu (—/can xem tay) luon xuong CUOI bat ke chieu sap xep -
    // khong nen xen giua cac gia tri that, du dang sap tang hay giam dan.
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return direction === 'desc' ? bv - av : av - bv;
  });
}

const MUTE_CONFIRM_TIMEOUT_MS = 5000;
const HIGHLIGHT_STATES: HighlightState[] = ['blink', 'light', 'off'];

// Nhan nut cho 1 lua chon xac nhan, tuy vao dang chuyen TU dau SANG dau (yeu
// cau nguoi dung 2026-07-18): sang 'blink' luon la "Nhấp nháy"; sang 'off'
// luon la "Tắt"; sang 'light' la "Ngừng nhấp nháy" (neu dang tu 'blink') hoac
// "Bật" (neu dang tu 'off' - khong co truong hop light->light vi target khac
// current).
function labelForTransition(current: HighlightState, target: HighlightState): string {
  if (target === 'blink') return 'Nhấp nháy';
  if (target === 'off') return 'Tắt';
  return current === 'blink' ? 'Ngừng nhấp nháy' : 'Bật';
}

function tierClassForState(state: HighlightState): string {
  if (state === 'blink') return 'pct-level2';
  if (state === 'light') return 'pct-level1';
  return '';
}

// O chi tieu dang highlight (level1 "vang nhat" hoac level2 "vang dam + nhap
// nhay") kem tickbox + popup xac nhan (yeu cau nguoi dung 2026-07-18) - chu
// trinh 3 trang thai (HighlightState): 'blink' <-> 'light' <-> 'off', chuyen
// duoc QUA LAI ca 3 bat ke tier goc. Tickbox KHONG dai dien cho trang thai
// hien tai, no CHI la "dang cho xac nhan": mac dinh khong tick; bam vao tick
// hien ra + hien 2 nut lua chon (2 trang thai CON LAI, xem labelForTransition)
// trong MUTE_CONFIRM_TIMEOUT_MS; bam 1 trong 2 moi thuc su doi trang thai,
// tick+popup mat ngay; qua gio ma khong bam thi tu huy.
//
// Popup RENDER QUA PORTAL vao document.body (yeu cau nguoi dung 2026-07-18 -
// bug that: 2 o highlight dung lien tiep theo chieu doc, tick o TREN thi popup
// bi CHIM xuong duoi o o DUOI - td .pct-col-highlighted chi la position:
// relative voi z-index:auto nen KHONG tu lap 1 stacking context rieng, popup
// z-index:30 cua no bi so sanh lan voi o hang duoi o 1 stacking context xa
// hon to o - ket qua khong on dinh trong bang. Dung portal + position: fixed
// toa do tuyet doi (getBoundingClientRect) thi popup thoat han khoi cay DOM
// cua bang, khong con bi anh huong boi stacking/overflow cua table/tr/td nao
// nua.
function MuteableHighlightCell({
  label,
  currentState,
  onSetState,
  displayValue,
}: {
  label: string;
  currentState: HighlightState;
  onSetState: (state: HighlightState) => void;
  displayValue: string;
}) {
  const [armed, setArmed] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);
  // Ref toi CHINH popover cua component nay (khong phai truy DOM qua
  // querySelector([data-...=label]) - label la ten cot, LAP LAI o moi hang
  // nen 2 o khac hang cung cot se trung selector do, click-outside cua 1 o co
  // the vo tinh doc nham popover cua o kia). ref hoat dong binh thuong du
  // phan tu nam trong Portal - React gan ref theo VI TRI TRONG CAY REACT,
  // khong phai vi tri trong DOM thuc te.
  const popoverElRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!armed) return;
    // Bam ra ngoai popup (khong phai tickbox, tickbox tu xu ly rieng qua
    // onChange) thi huy - giong pattern click-outside o ExportSummaryButton.
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (checkboxRef.current?.contains(target)) return;
      if (popoverElRef.current?.contains(target)) return;
      clearArmTimeout();
      setArmed(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed]);

  function clearArmTimeout() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  function handleCheckboxChange() {
    if (armed) {
      clearArmTimeout();
      setArmed(false);
      return;
    }
    const rect = checkboxRef.current?.getBoundingClientRect();
    setPopoverPos(rect ? { top: rect.bottom + 4, left: rect.left } : null);
    setArmed(true);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      setArmed(false);
    }, MUTE_CONFIRM_TIMEOUT_MS);
  }

  function chooseState(state: HighlightState) {
    clearArmTimeout();
    setArmed(false);
    onSetState(state);
  }

  const otherStates = HIGHLIGHT_STATES.filter((s) => s !== currentState);
  const tierClass = tierClassForState(currentState);

  return (
    <td className={`pct-col pct-col-highlighted ${tierClass}`}>
      <input
        ref={checkboxRef}
        type="checkbox"
        className="pct-mute-checkbox"
        checked={armed}
        onChange={handleCheckboxChange}
        title={armed ? 'Chọn 1 trong 2 lựa chọn bên dưới (tự huỷ sau 5s)' : `Đổi trạng thái highlight cho ${label}`}
        aria-label={`Đổi trạng thái highlight cho ${label}`}
      />
      {displayValue}
      {armed &&
        popoverPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popoverElRef}
            className="mute-confirm-popover"
            style={{ top: popoverPos.top, left: popoverPos.left }}
          >
            {otherStates.map((state) => (
              <button key={state} type="button" className="mute-confirm-button" onClick={() => chooseState(state)}>
                {labelForTransition(currentState, state)}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </td>
  );
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
  const [sortState, setSortState] = useState<SortState>(null);
  const { isWatched, getHighlightOverride, setHighlightOverride } = useWatchlist();

  // Tim theo Ma CK (yeu cau user 2026-07-08) - so sanh khong phan biet hoa
  // thuong, cho phep go tat/mot phan ma (vd "id" khop "IDV").
  const filteredReports = useMemo(() => {
    const query = stockCodeQuery.trim().toUpperCase();
    if (!query) return reports;
    return reports.filter((report) => (report.stockCode ?? '').toUpperCase().includes(query));
  }, [reports, stockCodeQuery]);

  const sortedReports = useMemo(() => sortReports(filteredReports, sortState), [filteredReports, sortState]);

  function handleHeaderSortClick(label: string) {
    setSortState((prev) => {
      if (!prev || prev.label !== label) return { label, direction: 'desc' };
      if (prev.direction === 'desc') return { label, direction: 'asc' };
      return null;
    });
  }

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
        {/* Watchlist dat NGAY SAU o tim (yeu cau nguoi dung 2026-07-18) - rieng
        biet voi cum Xuat/Xoa (day sang phai qua margin-left: auto tren
        .summary-actions-buttons), khong phu thuoc allFilePaths/selectedFilePaths
        vi khong lien quan xuat/xoa bao cao. */}
        <WatchlistButton />
        {/* Nut reset nhanh ve sap xep mac dinh (yeu cau nguoi dung 2026-07-20) -
        CHI hien khi dang sap theo 1 cot chi tieu, tranh phai bam lai dung cot
        do 2 lan (desc -> asc -> mac dinh) de quay ve. */}
        {sortState && (
          <button type="button" className="secondary-button" onClick={() => setSortState(null)}>
            ↺ Sắp xếp mặc định
          </button>
        )}
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
            {labels.map((label) => {
              const active = sortState?.label === label;
              // Luon hien dau mui ten (yeu cau nguoi dung 2026-07-20) - mo
              // nhat/2 chieu (⇅) khi CHUA sap theo cot nay (goi y "bam duoc"),
              // dam mau + 1 chieu ro rang (▼/▲) khi DANG sap theo cot nay -
              // thay vi truoc day chi hien khi active (nguoi dung khong biet
              // cot nao bam duoc neu chua tung bam thu).
              const arrow = active ? (sortState!.direction === 'desc' ? '▼' : '▲') : '⇅';
              return (
                <th
                  key={label}
                  className={`pct-col-header pct-col-header-sortable ${active ? 'pct-col-header-sorted' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleHeaderSortClick(label)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleHeaderSortClick(label);
                    }
                  }}
                  title={
                    active
                      ? sortState!.direction === 'desc'
                        ? 'Đang sắp xếp: lớn nhất trước - bấm để đổi sang nhỏ nhất trước'
                        : 'Đang sắp xếp: nhỏ nhất trước - bấm để quay về mặc định'
                      : `Bấm để sắp xếp theo ${label}`
                  }
                >
                  {label}
                  <span className={`pct-col-sort-arrow ${active ? 'pct-col-sort-arrow-active' : ''}`}>{arrow}</span>
                </th>
              );
            })}
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
          {sortedReports.map((report) => {
            const byLabel = new Map((report.analysis ?? []).map((item) => [item.label, item]));
            // Watchlist (yeu cau nguoi dung 2026-07-18): ma trong watchlist in
            // dam + ca dong noi bat hon dong xung quanh (xem .watchlist-row/
            // .watchlist-code o globals.css).
            const watched = isWatched(report.stockCode);
            return (
              <tr key={report.filePath} className={watched ? 'watchlist-row' : ''}>
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
                  <a
                    href={report.financeUrl}
                    target="_blank"
                    rel="noreferrer"
                    title={report.companyName}
                    className={watched ? 'watchlist-code' : ''}
                  >
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
                  const tier = item?.tier === 'level1' ? 'level1' : item?.tier === 'level2' ? 'level2' : null;
                  if (!tier) {
                    return (
                      <td key={label} className="pct-col">
                        {formatPercent(item?.percentChange)}
                      </td>
                    );
                  }
                  // O co highlight (level1 hoac level2) - ca 2 deu dung chu
                  // trinh 3 trang thai qua MuteableHighlightCell o tren, trang
                  // thai TU NHIEN (chua tung doi) suy tu tier: level1 -> 'light',
                  // level2 -> 'blink'.
                  const key = highlightKey(report.filePath, label);
                  const naturalState: HighlightState = tier === 'level2' ? 'blink' : 'light';
                  const currentState = getHighlightOverride(key) ?? naturalState;
                  return (
                    <MuteableHighlightCell
                      key={label}
                      label={label}
                      currentState={currentState}
                      onSetState={(state) => setHighlightOverride(key, state)}
                      displayValue={formatPercent(item?.percentChange)}
                    />
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
