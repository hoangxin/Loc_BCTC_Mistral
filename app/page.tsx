import statusJson from '@/data/latest-fetch.json';
import type { FetchStatus } from '@/lib/status';
import { formatTimestamp } from '@/lib/format';
import { getPreviousQuarter, listRecentQuarters } from '@/lib/quarter';
import FetchControls from './FetchControls';
import CustomSourceForm from './CustomSourceForm';
import ReportsSummaryTable from './ReportsSummaryTable';

const status = statusJson as unknown as FetchStatus;

export default function HomePage() {
  const previousQuarter = getPreviousQuarter();
  const quarterOptions = listRecentQuarters(8);

  return (
    <main className="page">
      <header className="site-header">
        <h1>Lọc BCTC</h1>
        <span className="updated-at">
          {status.generatedAt ? `Cập nhật lúc ${formatTimestamp(status.generatedAt)}` : 'Chưa có dữ liệu'}
        </span>
      </header>

      <div className="controls-bar">
        <FetchControls currentGeneratedAt={status.generatedAt} quarterOptions={quarterOptions} previousQuarter={previousQuarter} />
        <CustomSourceForm />
      </div>

      {status.quarter && status.year && (
        <div className="summary-bar">
          <div className="summary-item">
            <strong>
              Quý {status.quarter}/{status.year}
            </strong>
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
        <div className="empty-state">Chưa có báo cáo nào - chọn quý và bấm "Tải BCTC" phía trên, hoặc thêm nguồn riêng.</div>
      ) : (
        <ReportsSummaryTable reports={status.reports} />
      )}
    </main>
  );
}
