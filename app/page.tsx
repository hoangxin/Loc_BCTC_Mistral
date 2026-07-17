import { readStatus } from '@/lib/pipeline';
import type { DownloadedReport } from '@/lib/status';
import { formatTimestamp } from '@/lib/format';
import { getPreviousQuarter } from '@/lib/quarter';
import FetchControls from './FetchControls';
import CustomSourceForm from './CustomSourceForm';
import ResultsByPeriodTabs from './ResultsByPeriodTabs';
import Tabs from './Tabs';

// "Tai moi tu lan tai cuoi" (app/FetchControls.tsx, mode 'sinceLast') can biet
// lan gan nhat DA tai ky dang chon la khi nao - status.reports gop chung tat
// ca cac ky da tai (xem comment runFetchPipeline o lib/pipeline.ts), nen o day
// chi can gom nhom theo periodYear+periodSlug va lay "lastUpdate" MOI NHAT
// trong nhom do lam moc so sanh.
function buildTermLastFetchMap(reports: DownloadedReport[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const report of reports) {
    const key = `${report.periodYear}-${report.periodSlug}`;
    const existing = map[key];
    if (!existing || new Date(report.lastUpdate).getTime() > new Date(existing).getTime()) {
      map[key] = report.lastUpdate;
    }
  }
  return map;
}

// Doc dong tu dia (khong import tinh JSON nua) - `data/latest-fetch.json`
// KHONG nam trong repo (gitignore, la du lieu sinh ra luc chay, xem
// README) nen import tinh se lam VO BUILD tren may khac/Vercel (da gap that
// khi test build production 2026-07-06: "Module not found: Can't resolve
// '@/data/latest-fetch.json'" tren 1 checkout moi khong co san file nay).
// readStatus() da tu xu ly truong hop file chua ton tai (tra ve trang thai
// rong), va force-dynamic de Next khong co gang prerender tinh trang nay.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  const status = readStatus();
  const previousQuarter = getPreviousQuarter();

  return (
    <main className="page">
      <header className="site-header">
        <h1>Lọc BCTC</h1>
        <span className="updated-at">
          {status.generatedAt ? `Cập nhật lúc ${formatTimestamp(status.generatedAt)}` : 'Chưa có dữ liệu'}
        </span>
      </header>

      <Tabs
        statsBar={
          status.periodLabel && (
            <>
              <strong>{status.periodLabel}</strong>
              {' · '}
              {status.totalFound} tìm thấy · {status.totalMatched} sau lọc · {status.downloaded} tải thành công
              {status.failed.length > 0 && ` · ${status.failed.length} lỗi`}
            </>
          )
        }
        fetchTab={
          <div className="controls-bar">
            <FetchControls
              currentGeneratedAt={status.generatedAt}
              previousQuarter={previousQuarter}
              termLastFetch={buildTermLastFetchMap(status.reports)}
            />
            <CustomSourceForm />
          </div>
        }
        resultsTab={
          status.reports.length === 0 ? (
            <div className="empty-state">Chưa có báo cáo nào - chọn quý và bấm "Tải BCTC" ở tab "Chọn báo cáo lọc", hoặc thêm nguồn riêng.</div>
          ) : (
            <ResultsByPeriodTabs reports={status.reports} currentGeneratedAt={status.generatedAt} />
          )
        }
      />
    </main>
  );
}
