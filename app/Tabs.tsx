'use client';

import { useState, type ReactNode } from 'react';

// 2 tab tach rieng "Tai bao cao" (chon ky + xem truoc danh muc that + Tai
// BCTC/Them nguon rieng) voi "Ket qua" (bang tong hop %/xuat Excel-PDF) - yeu
// cau user: gop lai lam 2 khu vuc doc lap thay vi xep chung 1 trang nhu truoc.
export default function Tabs({ fetchTab, resultsTab }: { fetchTab: ReactNode; resultsTab: ReactNode }) {
  const [active, setActive] = useState<'fetch' | 'results'>('fetch');

  return (
    <div>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={active === 'fetch'}
          className={`tab-button ${active === 'fetch' ? 'active' : ''}`}
          onClick={() => setActive('fetch')}
        >
          Tải báo cáo
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
      </div>

      <div style={{ display: active === 'fetch' ? 'block' : 'none' }}>{fetchTab}</div>
      <div style={{ display: active === 'results' ? 'block' : 'none' }}>{resultsTab}</div>
    </div>
  );
}
