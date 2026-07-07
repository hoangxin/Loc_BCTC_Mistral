import { readStatus } from '@/lib/pipeline';
import { formatTimestamp } from '@/lib/format';
import { getPreviousQuarter } from '@/lib/quarter';
import FetchControls from './FetchControls';
import CustomSourceForm from './CustomSourceForm';
import BusinessTypeTabs from './BusinessTypeTabs';
import ClearResultsButton from './ClearResultsButton';
import Tabs from './Tabs';

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
        fetchTab={
          <div className="controls-bar">
            <FetchControls currentGeneratedAt={status.generatedAt} previousQuarter={previousQuarter} />
            <CustomSourceForm />
          </div>
        }
        resultsTab={
          <>
            {status.reports.length > 0 && (
              <div className="summary-actions">
                <ClearResultsButton currentGeneratedAt={status.generatedAt} />
              </div>
            )}

            {status.periodLabel && (
              <div className="summary-bar">
                <div className="summary-item">
                  <strong>{status.periodLabel}</strong>
                  <span>Kỳ báo cáo</span>
                </div>
                <div className="summary-item">
                  <strong>{status.totalFound}</strong>
                  <span>Báo cáo tìm thấy</span>
                </div>
                <div className="summary-item">
                  <strong>{status.totalMatched}</strong>
                  <span>Sau khi lọc</span>
                </div>
                <div className="summary-item">
                  <strong>{status.downloaded}</strong>
                  <span>Tải thành công</span>
                </div>
                {status.failed.length > 0 && (
                  <div className="summary-item">
                    <strong>{status.failed.length}</strong>
                    <span>Lỗi</span>
                  </div>
                )}
              </div>
            )}

            {status.reports.length === 0 ? (
              <div className="empty-state">Chưa có báo cáo nào - chọn quý và bấm "Tải BCTC" ở tab "Chọn báo cáo lọc", hoặc thêm nguồn riêng.</div>
            ) : (
              <BusinessTypeTabs reports={status.reports} />
            )}
          </>
        }
      />
    </main>
  );
}
