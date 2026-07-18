'use client';

import { useState, type ReactNode } from 'react';
import { WatchlistProvider } from './WatchlistContext';

// 2 tab tach rieng "Tai bao cao" (chon ky + xem truoc danh muc that + Tai
// BCTC/Them nguon rieng) voi "Ket qua" (bang tong hop %/xuat Excel-PDF) - yeu
// cau user: gop lai lam 2 khu vuc doc lap thay vi xep chung 1 trang nhu truoc.
//
// SUA 2026-07-18 (yeu cau nguoi dung):
// 1. statsBar (tuy chon) - dong thong ke "Quy 2/2026 - 75 tim thay..." truoc
//    day nam RIENG 1 dong ben duoi (app/page.tsx), gio hien NGAY TRONG dong 2
//    nut tab nay (day sat phai qua margin-left: auto, xem .tabs-stats o
//    globals.css) de tiet kiem 1 dong chieu cao.
// 2. .flex-col-fill (ca goc lan panel active) - phoi hop voi cung 1 class o
//    ResultsByPeriodTabs/BusinessTypeTabs de bang Ket qua chiem HET chieu cao
//    con lai cua man hinh va tu cuon BEN TRONG no (xem .report-table-wrapper),
//    thay vi doan 1 con so px co dinh (max-height: calc(100vh - Npx)) de tru
//    khong gian header/tabs - con so co dinh do se sai ngay khi cac dong phia
//    tren doi chieu cao (dung y chinh ly do gay ra khoang trong lon nguoi dung
//    bao cao 2026-07-18).
export default function Tabs({
  fetchTab,
  resultsTab,
  statsBar,
}: {
  fetchTab: ReactNode;
  resultsTab: ReactNode;
  statsBar?: ReactNode;
}) {
  const [active, setActive] = useState<'fetch' | 'results'>('fetch');

  return (
    // WatchlistProvider dat O DAY (khong phai rieng trong ResultsByPeriodTabs
    // nhu truoc) - yeu cau nguoi dung 2026-07-18: watchlist phai dong bo SANG
    // CA tab "Chon bao cao loc" (fetchTab, xem FetchControls.tsx dung chung
    // useWatchlist de highlight bang preview), khong chi giua cac tab con cua
    // "Ket qua". Component nay la goc chung cua ca 2 nhanh fetchTab/resultsTab
    // va khong unmount khi doi tab (chi doi display:none/block) nen 1 Provider
    // duy nhat o day la du cho toan bo trang.
    <WatchlistProvider>
      <div className="flex-col-fill">
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={active === 'fetch'}
            className={`tab-button ${active === 'fetch' ? 'active' : ''}`}
            onClick={() => setActive('fetch')}
          >
            Chọn báo cáo lọc
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={active === 'results'}
            className={`tab-button ${active === 'results' ? 'active' : ''}`}
            onClick={() => setActive('results')}
          >
            Kết quả
          </button>
          {statsBar && <div className="tabs-stats">{statsBar}</div>}
        </div>

        {/* flex-col-fill CA 2 ben (yeu cau nguoi dung 2026-07-18 - truoc day
        fetchTab chi la div block thuong, khong chiem het chieu cao con lai
        nen bang preview Ma CK bi gioi han max-height co dinh + de lo khoang
        trong lon duoi day trang) - xem .controls-bar/.fetch-controls/
        .preview-panel o globals.css phoi hop cung chuoi flex nay. */}
        <div className="flex-col-fill" style={{ display: active === 'fetch' ? 'flex' : 'none' }}>
          {fetchTab}
        </div>
        <div className="flex-col-fill" style={{ display: active === 'results' ? 'flex' : 'none' }}>
          {resultsTab}
        </div>
      </div>
    </WatchlistProvider>
  );
}
