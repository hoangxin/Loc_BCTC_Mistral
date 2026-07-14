# Lọc BCTC (bản Mistral OCR)

Clone từ project `Loc_BCTC` gốc (2026-07-05), thay thế bước đọc/tách 3 bảng tài chính từ Qwen vision
(qua OpenRouter) sang **Mistral OCR API** (gọi trực tiếp `api.mistral.ai`, không qua OpenRouter) - độ
chính xác cao hơn, rẻ hơn, xem chi tiết lý do trong lịch sử trao đổi lúc quyết định.

Tải báo cáo tài chính theo kỳ (Quý/6 tháng/9 tháng/Cả năm) từ Vietstock
(`finance.vietstock.vn/tai-lieu/bao-cao-tai-chinh.htm`) **hoặc từ 1 link web công ty tự paste vào (AI
duyệt trang tự tìm)**, chấp nhận cả PDF/DOCX/DOC/ZIP/RAR, tính % thay đổi theo tiêu chí riêng ra 1 bảng
kết quả, rồi cho xuất Excel (3 bảng BCTC đã trích) hoặc mở file PDF gốc trên Vietstock cho TỪNG báo cáo
cụ thể. Chạy bằng giao diện web hoặc bằng lệnh `npm run fetch`.

## Cấu trúc

- `lib/vietstock-reports.ts` - gọi thẳng 3 API JSON nội bộ của Vietstock (`getrptterm`, `getrptfile`)
  để lấy danh sách kỳ báo cáo/báo cáo của 1 kỳ, không cần trình duyệt headless. Vietstock có **7 loại kỳ
  mỗi năm** (đã xác nhận qua gọi API thật 2026-07-05): Quý 1-4, "6T" (6 tháng đầu năm - báo cáo soát xét
  bán niên, hồ sơ RIÊNG với Quý 2 dù cùng hạn cuối kỳ 30/6), "9T" (9 tháng, cùng hạn Quý 3), "Năm" (báo
  cáo kiểm toán cả năm, cùng hạn Quý 4) - `fetchReportTerms()` lấy danh sách kỳ THẬT này (dropdown UI tự
  "tịnh tiến" theo ngày hiện tại vì là dữ liệu sống, không cần tự tính lịch); `fetchReportFilesForTerm()`
  lấy danh mục báo cáo thật của 1 kỳ (dùng cho xem trước lẫn tải thật).
- `lib/period-label.ts` - suy ra nhãn hiển thị ("Quý 2/2026", "6 tháng đầu năm 2026"...) và tên thư mục
  từ 1 `ReportTerm`.
- `lib/quarter.ts` (`getPreviousQuarter`) - chỉ còn tính "quý vừa qua" theo giờ Việt Nam, dùng để xác
  định mặc định dropdown. Lựa chọn "Từ lần tải cuối" tự tính qua `termLastFetch`/`sinceLastHoursForTerm`
  (`app/FetchControls.tsx`) theo `ReportTerm`, không còn dùng `QuarterPeriod` để so sánh.
- `lib/filter.ts` (`filterReports`) - lọc theo **sàn giao dịch** (yêu cầu người dùng 2026-07-12: bỏ
  "OTC"/"Khác", không thuộc phạm vi phân tích) trước khi tải - lọc AI theo nội dung/tiêu chí khác vẫn
  chưa wire vào (xem `lib/ai/qwen.ts`), chờ chốt tiêu chí thật.
- `lib/download.ts` - tải file báo cáo về `data/reports/<năm>-Q<quý>/` (bất kể định dạng gì - việc nhận
  diện/giải nén là của `lib/report-source.ts`).
- `lib/report-source.ts` (`resolveReportSourceFiles`) - chuẩn hoá MỌI định dạng tải về thành 1 hoặc
  nhiều file PDF/DOCX/DOC đọc được: PDF/DOCX/DOC giữ nguyên 1-1; ZIP (`adm-zip`)/RAR (`node-unrar-js`,
  chạy WASM, không cần cài `unrar`) giải nén ra, giữ lại các entry PDF/DOCX/DOC (bỏ qua ảnh/readme...) -
  **1 lần tải có thể ra NHIỀU dòng** nếu zip/rar chứa nhiều file (vd vừa có bản Hợp nhất vừa Riêng lẻ).
  Trước đây các file `.zip` (VD `CAP_...zip`, `KTS_...zip` ở Q2/2026) bị bỏ qua hoàn toàn - đã test lại
  bằng zip thật, ra đúng các PDF bên trong.
- `lib/report-extract.ts` (`extractReportContent`) - điểm nối DUY NHẤT rẽ nhánh theo
  định dạng để trích 3 bảng (CHỈ 3 bảng - KHÔNG còn toàn văn ở bước này nữa, xem `lib/export/full-document.ts`
  dưới): PDF qua `determineStatementPageScope` (xác định tổng số trang) rồi
  `extractFinancialStatementsWithOcrProbe` (`lib/export/financial-statements.ts`, OCR theo lô qua Batch
  API, chỉ phạm vi trước "Thuyết minh", rẻ); DOCX qua `lib/export/docx-statements.ts`
  (mammoth, đọc bảng HTML thật, chuyển sang cú pháp markdown của Mistral rồi tái dùng
  `parseStatementsFromMarkdown`); DOC (Word 97-2003 nhị
  phân cũ) qua `lib/export/doc-statements.ts` (`word-extractor` lấy text thuần, tự dò ranh giới cột bằng
  `lib/text-columnarize.ts` - độ tin cậy thấp hơn docx/pdf vì không có ranh giới cột gốc). DOCX/DOC
  **KHÔNG gọi AI/OCR nào** (đọc trực tiếp), khác PDF phải OCR.
- `lib/statement-scope.ts` (`classifyStatementScope`) - phân loại "Hợp nhất/Riêng lẻ/Chung" cho cột
  "Loại BCTC": ưu tiên dò từ khoá trong tên file/tiêu đề Vietstock, fallback dò trong chính nội dung tài
  liệu, và trả "Chung" (KHÔNG đoán bừa Hợp nhất hay Riêng lẻ) nếu không thấy dấu hiệu gì - đúng cho công
  ty không có công ty con, chỉ có 1 báo cáo duy nhất.
- `lib/analysis.ts` (`computeAnalysisRows`) - áp tiêu chí đọc BCTC để ra % thay đổi mỗi chỉ tiêu (CĐKT so
  đầu kỳ, KQKD so cùng kỳ - đã có sẵn 2 cột đó ngay trong 1 báo cáo). **TODO: đang pass-through (trả
  rỗng), chờ tiêu chí thật của user** - khi có, chỉ cần sửa file này, không đụng UI/pipeline/export.
- `lib/custom-source.ts` (`runCustomSourceCheck`) - nút "Thêm nguồn riêng": dùng Mistral chat
  (`lib/ai/mistral-chat.ts`, cùng `MISTRAL_API_KEY`) duyệt trang tối đa 4 bước nhảy (VD trang chủ ->
  "Quan hệ cổ đông" -> "Báo cáo tài chính") để tự tìm link BCTC quý vừa kết thúc, rồi CHỈ trích 3 bảng
  (không toàn văn, giống luồng Vietstock) - chạy trên GitHub Actions runner (xem mục dispatch dưới), LUÔN
  ghi `FetchStatus.lastCustomSourceCheck` (kể cả không tìm thấy) qua `writeCustomSourceCheck` để
  `app/CustomSourceForm.tsx` (polling) phân biệt được "chưa xong" với "xong nhưng không thấy".
- `lib/summary-row.ts`, `lib/export/summary-excel.ts`/`summary-pdf.ts`, `app/api/export-summary` - bảng
  tổng hợp % nhiều công ty (build buffer, không ghi đĩa) từ đợt làm trước - vẫn giữ code, nhưng **hiện
  không còn nút nào trên UI gọi tới** (nút "Excel" mỗi dòng trỏ vào `app/api/report-file`, xem dưới; nút
  "PDF" mở thẳng file gốc trên Vietstock, không qua route nào của app) - để đó chờ quyết định lại cách
  dùng khi có tiêu chí % thật.
- `lib/pdf-text.ts` (`determineStatementPageScope`) - **KHÔNG còn dùng Tesseract** (bỏ từ 2026-07-12 sau
  bug PVS - watermark eoffice làm sai điểm cắt "Thuyết minh" đoán từ text layer). Giờ chỉ dùng
  `pdf-parse` (đọc text layer thật, miễn phí) để đếm tổng số trang + kiểm tra ngôn ngữ (tiếng Việt hay
  bản dịch tiếng Anh) - KHÔNG còn cố đoán phạm vi trang trước "Thuyết minh" từ text layer nữa, việc đó
  giao thẳng cho `extractFinancialStatementsWithOcrProbe` (OCR theo lô tăng dần, xem dưới).
- `lib/ai/mistral-ocr-batch.ts` (`callMistralOcrBatch`) - gọi Mistral OCR qua Batch API (`/v1/files` upload
  + `/v1/batch/jobs`, model `MISTRAL_OCR_MODEL`, mặc định `mistral-ocr-latest`) trên phạm vi trang đã cắt
  sẵn (`lib/ai/pdf-slice.ts`), trả về markdown từng trang - đây là đường THẬT đang dùng trong pipeline
  chính (rẻ hơn 50% so với `lib/ai/mistral-ocr.ts` (`callMistralOcr`, endpoint đồng bộ `/v1/ocr`), hàm
  đó giờ chỉ còn dùng cho `lib/export/full-document.ts` đã dự phòng). Không tự retry lỗi mạng/tạm thời ở
  tầng này (mỗi bước tạo job/poll/tải file là 1 request riêng, lỗi ở bước nào ném lỗi ngay) - tầng gọi cao
  hơn (`extractWithGroupCheckRetry` trong `financial-statements.ts`) xử lý retry khi cần.
- `lib/export/markdown-tables.ts` (`parseStatementsFromMarkdown`) - parse markdown Mistral trả về
  thành 3 bảng (`FinancialStatements`) **hoàn toàn local, không gọi AI thêm**: nhận diện 3 mục theo tiêu
  đề (bỏ qua mục lục trang bìa liệt kê cả 4 tên bảng cùng lúc), gộp các bảng con trong 1 mục (VD bảng
  cân đối kế toán thường tách "Tài sản" + "Nguồn vốn" thành 2 bảng markdown riêng), và canh lại các dòng
  bị lệch cột (theo nội dung - tìm ô nhãn/mã số/giá trị bằng hình dạng, không theo vị trí cố định).
- `lib/export/financial-statements.ts` (`extractFinancialStatementsWithOcrProbe`) - gọi `callMistralOcrBatch`
  theo lô tăng dần (12 trang đầu + mở rộng 2 trang/lần tới khi thấy "Thuyết minh"), parse qua
  `markdown-tables.ts`, rồi kiểm tra chéo (`validate-statements.ts`).
  Không còn vòng lặp "gọi lại AI sửa lỗi" như bản Qwen vision cũ (khái niệm đó dựa trên việc yêu cầu
  model đọc lại ảnh kỹ hơn, không áp dụng được với OCR thuần) - nếu kiểm tra chéo phát hiện lệch, báo
  qua `warnings`, không tự "sửa".
- `lib/export/full-document.ts` (`extractFullReportFromPdf`) - **DỰ PHÒNG, không còn nơi nào gọi** (từ
  2026-07-07, xem `app/api/report-file/route.ts`): trước đây OCR TOÀN VĂN CẢ tài liệu (kể cả Thuyết
  minh) trong 1 lần gọi duy nhất cho nút "Xuất PDF"; nút đó giờ chỉ mở thẳng file gốc trên Vietstock,
  không OCR gì thêm. Giữ lại file này phòng khi cần dùng lại hướng "xuất PDF riêng của app". Nhân tiện,
  `lib/export/markdown-tables.ts` (`parseStatementsFromMarkdown`) vẫn có mốc chặn ở "Thuyết minh" cho
  mục "Lưu chuyển tiền tệ" (trước đây mặc định chạy tới hết văn bản - đúng khi đầu vào chỉ có phạm vi
  trước Thuyết minh, nhưng SAI khi đầu vào là toàn văn) - dùng chung cho cả nhánh OCR-theo-lô hiện tại.
- `lib/export/validate-statements.ts` - kiểm tra cục bộ (không gọi AI) trên bảng đã cấu trúc hoá, theo
  nguyên tắc **fail-closed**: không kiểm tra được thì báo là lỗi, không được im lặng bỏ qua.
  - Tổng cộng tài sản = Tổng cộng nguồn vốn (theo mã số 100/200/270, 300/400/440).
  - Tổng các mục con cấp 2 (nhận diện qua mã số **và** ký hiệu La Mã ở cột STT hoặc tiền tố trong tên
    chỉ tiêu - không chỉ dựa "mã số chia hết cho 10", vì vài dòng chi tiết thường cũng tình cờ chia hết
    cho 10, vd mã 320/420) khớp với dòng tổng của nhóm.
  - Lợi nhuận gộp = Doanh thu thuần - Giá vốn hàng bán (dò theo tên, có fallback theo mã số 10 nếu tài
    liệu viết tắt "DT thuần" thay vì "Doanh thu thuần").
  - Lợi nhuận sau thuế = Lợi nhuận trước thuế - Chi phí thuế TNDN (hiện hành + hoãn lại, cộng dồn 2 dòng
    chi tiết nếu tách riêng - ưu tiên dòng tổng đã cộng sẵn nếu báo cáo có in).
- `lib/export/excel.ts` - ghi 3 bảng ra 1 file `.xlsx`, mỗi bảng 1 sheet (chi tiết TỪNG báo cáo). Mỗi
  sheet có thêm 1 cột "% thay đổi" cuối bảng (so cột kỳ này/kỳ trước của chính bảng đó) - riêng KQKD chỉ
  so theo cặp cột Quý, không tính với Lũy kế từ đầu năm (yêu cầu user 2026-07-13).
- `lib/export/pdf.ts` (`writeReportPdf`) - xuất PDF text sạch (không phải ảnh scan, chọn/copy/highlight
  được), gồm 3 bảng + toàn văn báo cáo (chi tiết TỪNG báo cáo).
- `lib/export/pdf-shared.ts` - phần "vẽ bảng PDF" thuần tuý (font, `PdfWriter`, `computeColumnLayout`,
  `drawTableRow`...) tách ra từ `pdf.ts` để dùng chung với `summary-pdf.ts`.
- `lib/export/output-filename.ts` (`buildOutputFilename`) - đặt tên file xuất theo đúng quy ước user
  chốt (2026-07-06): `{Mã CK}_{2 số cuối năm}{hậu tố kỳ}_BCTC{hậu tố loại}` (VD `HSG_26Q2_BCTC_HN`,
  `HSG_26Q2_BCTC_M`, hoặc không hậu tố loại nếu "Chung") - dùng cho cả tên file lưu cục bộ lẫn
  `Content-Disposition` trả về trình duyệt.
- `lib/ai/mistral-chat.ts` - client Mistral chat completions (khác `mistral-ocr.ts` - dùng để "suy luận"
  trên text, không phải OCR) - cho bước duyệt trang tìm nguồn riêng (`lib/custom-source.ts`).
- `lib/ai/qwen.ts` - client Qwen (qua OpenRouter) - **KHÔNG còn dùng cho bước trích 3 bảng nữa** (đã
  chuyển sang Mistral OCR). Giữ lại dự phòng cho bước lọc theo tiêu chí (`lib/filter.ts` hiện chỉ lọc
  theo sàn giao dịch, chưa wire AI vào) sau này nếu cần AI đọc/đánh giá nội dung - `OPENROUTER_API_KEY`
  đang bị comment trong `.env`, bỏ comment + điền lại key thật khi cần dùng.
- `lib/ai/claude.ts` - client Claude, viết sẵn nhưng chưa dùng ở đâu (dự phòng).
- `lib/pipeline.ts` - orchestrator dùng chung cho cả CLI (`scripts/run-fetch.ts`) và GitHub Actions
  (`.github/workflows/fetch-bctc.yml`); `runFetchPipeline(options)` nhận `{term|quarter+year, hoursWindow,
  reportLimit}` - CHỈ trích 3 bảng + tính % + phân loại cho MỌI báo cáo, ghi `data/latest-fetch.json` -
  KHÔNG còn tự OCR toàn văn/ghi `.xlsx`/`.clean.pdf` ở bước này nữa (dời sang lúc user bấm "Xuất", xem
  `app/api/report-file`); `addCustomReport`/`writeCustomSourceCheck` để `lib/custom-source.ts` ghi thêm.
- `.github/workflows/fetch-bctc.yml` - **CHẠY THẬT PIPELINE** trên GitHub Actions runner (không giới hạn
  vài giây như Vercel serverless) - nhận input qua `workflow_dispatch` (`mode: term|custom` + các tham
  số tương ứng), chạy `npx tsx scripts/run-fetch.ts`, rồi commit `data/latest-fetch.json` bằng
  `stefanzweifel/git-auto-commit-action@v5` - cú push đó tự khiến Vercel deploy lại (Git integration mặc
  định). Theo ĐÚNG khung `.github/workflows/news-digest.yml` của 3 project cũ cùng tác giả
  (`loc_tin`/`Loc_Tin_Mistral`/`loc_tin_qwen`) - đã xác nhận qua đọc code + git log thật là mô hình này
  chạy đúng trong thực tế.
- `app/api/trigger-fetch`, `app/api/custom-source` - KHÔNG còn chạy pipeline trực tiếp - chỉ
  `POST .../actions/workflows/fetch-bctc.yml/dispatches` (dùng PAT `GITHUB_DISPATCH_TOKEN`, raw `fetch`,
  không Octokit) để kích hoạt workflow trên, theo đúng `trigger-digest`/route tương tự của loc_tin.
- `app/FetchControls.tsx` - dropdown chọn kỳ (lấy trực tiếp từ `app/api/report-terms`, KHÔNG tự sinh) +
  lựa chọn "Từ lần tải cuối" (đúng Quý vừa qua - tự tính số giờ trôi qua kể từ lần tải GẦN NHẤT của
  chính kỳ đó, chính xác tới phút, xem `sinceLastHoursForTerm`/`termLastFetch` từ `app/page.tsx`
  `buildTermLastFetchMap`) hoặc "số BCTC gần nhất" (kỳ khác), nút "Tải BCTC" - polling
  `app/api/fetch-status` (đổi `generatedAt` = xong, tự reload).
- `app/CustomSourceForm.tsx` - nút "Thêm nguồn riêng" -> input link + Enter -> dispatch (không trả kết
  quả ngay nữa) -> polling `app/api/fetch-status`, đối chiếu `lastCustomSourceCheck.requestId` (tự sinh
  lúc gửi) để phân biệt "chưa xong" với "xong nhưng không thấy" (hiện "Chưa có").
- `app/ReportsSummaryTable.tsx` - bảng STT/Mã CK/Sàn giao dịch/Tên tài liệu/Ngày cập nhật/Tên công
  ty/Loại BCTC/cột % động (theo tiêu chí thật từ `lib/analysis.ts`, số cột tự theo UNION nhãn xuất
  hiện - xem `lib/summary-row.ts`) + 2 nút Excel/PDF mỗi dòng, LUÔN bật (không còn kiểm tra file có sẵn
  hay không - xem `app/api/report-file` dưới).
- `app/api/report-file` - CHỈ còn 1 nhánh `kind=excel` (từ 2026-07-07, khi nút "PDF" đổi sang mở thẳng
  file gốc trên Vietstock - xem `lib/original-file-url.ts` - không qua route này nữa; route trả 400 nếu
  `kind` khác `excel`). Nhánh `kind=excel` dùng THẲNG `report.statements` đã OCR sẵn lúc "Tải BCTC"
  (`lib/pipeline.ts`) - KHÔNG tải lại file gốc, KHÔNG gọi AI gì thêm. Nhánh `kind=pdf` cũ (tải lại file
  gốc, OCR toàn văn qua `lib/export/full-document.ts`, ghép PDF bằng `lib/export/pdf.ts`) vẫn còn trong
  file dưới dạng comment (không xoá, phòng khi cần dùng lại hướng "xuất PDF riêng của app").
  - Vẫn lưu thêm 1 bản vào đĩa server (`EXPORT_SAVE_DIR`, mặc định `data/exports/`) TRƯỚC khi trả
    response - **lưu ý quan trọng**: đây KHÔNG PHẢI cách đưa file "vào máy người dùng" trên Vercel - máy
    chạy server (Vercel) và máy người dùng là 2 máy KHÁC NHAU, web app không có cách nào ghi file thẳng
    vào 1 thư mục tuỳ ý trên máy người dùng (giới hạn bảo mật trình duyệt, không phải hạn chế của code).
    Đường DUY NHẤT file "vào máy người dùng" là qua `Content-Disposition: attachment` + trình duyệt tự
    tải (đã có sẵn, luôn hoạt động cả local lẫn Vercel) - mặc định lưu vào thư mục Downloads của trình
    duyệt, đổi được trong cài đặt trình duyệt. Bước ghi đĩa server chỉ thực sự "vào máy người dùng" khi
    server VÀ trình duyệt là CÙNG 1 máy (`npm run dev` local) - set `EXPORT_SAVE_DIR` trong `.env` để đổi
    thư mục này sang đường dẫn tuỳ ý (VD `D:\Temporary FS`) khi chạy local. Trên Vercel, bước này ghi vào
    `/tmp` rồi mất ngay (đĩa ngoài `/tmp` read-only) - KHÔNG ảnh hưởng gì tới việc tải qua trình duyệt.

## Chạy

```bash
npm install
npm run dev        # mở http://localhost:3000
# hoặc
npm run fetch       # chạy thẳng từ terminal, không cần mở web (luôn lấy "quý vừa qua", không giới hạn)
```

Biến môi trường (`.env` cho local; xem mục dispatch dưới để biết biến nào cần set ở đâu khi deploy):

- `MISTRAL_API_KEY` - key riêng của Mistral (KHÔNG qua OpenRouter) - bắt buộc cho bước trích 3 bảng PDF
  (`lib/export/financial-statements.ts`, qua Batch API) và duyệt trang tìm nguồn riêng
  (`lib/ai/mistral-chat.ts`). KHÔNG cần cho `app/api/report-file` (Excel dùng lại kết quả OCR sẵn có,
  PDF không còn OCR gì - xem mục "Xuất Excel" ở trên).
- `MISTRAL_OCR_MODEL` - mặc định `mistral-ocr-latest`.
- `MISTRAL_CHAT_MODEL` - mặc định `mistral-large-latest` (dùng cho `lib/custom-source.ts`).
- `GITHUB_DISPATCH_TOKEN` - PAT GitHub (scope `Actions: Read and write` + `Contents: Read and write`,
  giới hạn đúng repo) - dùng để `app/api/trigger-fetch`/`app/api/custom-source` kích hoạt
  `.github/workflows/fetch-bctc.yml`. KHÔNG cần cho `npm run dev`/`npm run fetch` local (chỉ dùng khi
  chạy qua web thật) - **chỉ set trên Vercel**, KHÔNG set trong `.env`/GitHub repo secrets (chiều gọi
  ngược lại: Vercel gọi GitHub, không phải GitHub gọi Vercel).
- `EXPORT_SAVE_DIR` - tuỳ chọn, đổi thư mục lưu bản sao cục bộ của `app/api/report-file` (mặc định
  `data/exports/` trong project) - CHỈ có ý nghĩa khi chạy `npm run dev` local (xem giải thích ở
  `app/api/report-file` phía trên) - VD set `D:\Temporary FS` để file xuất ra nằm thẳng ở đó.
- `OPENROUTER_API_KEY` - đang comment, dự phòng cho bước lọc theo tiêu chí sau này (xem trên).
- `QWEN_MODEL` - dự phòng, đi cùng `OPENROUTER_API_KEY`.
- `CLAUDE_API_KEY` / `CLAUDE_MODEL` - dự phòng, chưa dùng.

Lưu ý: `npm run dev` (Next.js) tự nạp `.env`, nhưng `npm run fetch` (chạy thẳng bằng `tsx`) không tự
nạp - `scripts/run-fetch.ts` đã tự gọi `process.loadEnvFile('.env')` để bù việc này.

`next.config.js` có `experimental.serverComponentsExternalPackages` đánh dấu `pdf-parse`/`pdfjs-dist`
(và các package đọc file mới: `mammoth`, `word-extractor`, `adm-zip`, `node-unrar-js`, `tesseract.js`)
là package ngoài - THIẾU dòng này thì MỌI route API đụng tới `lib/pipeline.ts` sẽ lỗi 500 ngay
("Object.defineProperty called on non-object", do Next cố bundle `pdfjs-dist` qua webpack trong route
handler) - đã gặp và fix thật khi test lại giao diện lần này (2026-07-05).

## Triển khai lên web (Vercel) - ĐÃ CHỌN HƯỚNG, đang deploy tại `hoangxin/Loc_BCTC_Mistral`

**Đã chọn: dispatch GitHub Actions** (biến thể của "hướng 1" đã bàn trước đây - worker rời, nhưng dùng
GitHub Actions runner có sẵn thay vì phải tự vận hành máy/server riêng) - đúng theo mô hình 3 project cũ
cùng tác giả (`loc_tin`, `Loc_Tin_Mistral`, `loc_tin_qwen`) đã dùng thật:

1. **"Tải BCTC" / "Thêm nguồn riêng"** (nặng, hàng chục báo cáo/lần) - web (Vercel) chỉ dispatch
   `.github/workflows/fetch-bctc.yml`, pipeline thật chạy trên GitHub Actions runner (tối đa 60 phút,
   không giới hạn vài giây như serverless), rồi commit `data/latest-fetch.json` lại `main` - cú push đó
   tự khiến Vercel deploy lại. Web polling `generatedAt`/`lastCustomSourceCheck` rồi reload. **KHÔNG cần
   Vercel Blob/S3** - chỉ 1 file JSON nhẹ được commit, không phải file PDF/Excel.
2. **"Xuất Excel"** (nhẹ, xử lý ĐÚNG 1 báo cáo) - chạy THẲNG trong 1 API route Vercel bình thường
   (`app/api/report-file`), KHÔNG cần dispatch, KHÔNG OCR lại - dùng thẳng `report.statements` đã OCR
   sẵn lúc "Tải BCTC" (lưu trong `data/latest-fetch.json`). **"Xuất PDF"** (từ 2026-07-07) không còn
   qua route này nữa - chỉ mở thẳng file gốc trên Vietstock ở tab mới (xem `lib/original-file-url.ts`),
   không tốn OCR/token gì thêm.

Việc cần làm 1 lần (không tự động hoá được, cần đăng nhập tài khoản/tạo token):
- Tạo GitHub PAT (fine-grained, scope `Actions: Read and write` + `Contents: Read and write`, giới hạn
  đúng repo) → set làm biến môi trường **Vercel** `GITHUB_DISPATCH_TOKEN`.
- Set secret **GitHub repo** (Settings → Secrets and variables → Actions): `MISTRAL_API_KEY` (bắt buộc,
  workflow cần để OCR 3 bảng), `MISTRAL_OCR_MODEL`/`MISTRAL_CHAT_MODEL` (tuỳ chọn).
- `MISTRAL_API_KEY` set trên **Vercel** hiện KHÔNG cần cho `app/api/report-file` nữa (route này không
  còn OCR gì cả, xem mục 2 ở trên) - chỉ cần set trên **GitHub repo secret** cho workflow batch ở trên.

`lib/report-source.ts` giải nén RAR qua `node-unrar-js` (WASM) bằng đường dẫn `process.cwd()` tới
`node_modules` (tránh webpack/`@vercel/nft` cố bundle file `.wasm`) - chạy trên GitHub Actions runner
(luôn có `node_modules` từ `npm ci`) nên vẫn ổn, nhưng CHƯA kiểm chứng nếu sau này chuyển RAR-handling
sang chạy trực tiếp trên Vercel serverless.
