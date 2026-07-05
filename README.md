# Lọc BCTC (bản Mistral OCR)

Clone từ project `Loc_BCTC` gốc (2026-07-05), thay thế bước đọc/tách 3 bảng tài chính từ Qwen vision
(qua OpenRouter) sang **Mistral OCR API** (gọi trực tiếp `api.mistral.ai`, không qua OpenRouter) - độ
chính xác cao hơn, rẻ hơn, xem chi tiết lý do trong lịch sử trao đổi lúc quyết định.

Tải báo cáo tài chính theo quý từ Vietstock (`finance.vietstock.vn/tai-lieu/bao-cao-tai-chinh.htm`)
**hoặc từ 1 link web công ty tự paste vào (AI duyệt trang tự tìm)**, chấp nhận cả PDF/DOCX/DOC/ZIP/RAR,
lọc theo tiêu chí riêng, rồi ra 1 bảng tổng hợp % thay đổi để xuất Excel/PDF theo lựa chọn. Chạy bằng
giao diện web hoặc bằng lệnh `npm run fetch`.

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
- `lib/quarter.ts` - chỉ còn tính "quý vừa qua" theo giờ Việt Nam (`getPreviousQuarter`/`isSameQuarter`) -
  dùng để xác định mặc định dropdown + bật ô "giờ gần nhất" đúng lúc.
- `lib/filter.ts` - lọc sơ bộ theo **metadata** (mã CK, tên công ty, tiêu đề...) trước khi tải - hiện
  đang pass-through (giữ nguyên toàn bộ), chờ chốt tiêu chí thật.
- `lib/download.ts` - tải file báo cáo về `data/reports/<năm>-Q<quý>/` (bất kể định dạng gì - việc nhận
  diện/giải nén là của `lib/report-source.ts`).
- `lib/report-source.ts` (`resolveReportSourceFiles`) - chuẩn hoá MỌI định dạng tải về thành 1 hoặc
  nhiều file PDF/DOCX/DOC đọc được: PDF/DOCX/DOC giữ nguyên 1-1; ZIP (`adm-zip`)/RAR (`node-unrar-js`,
  chạy WASM, không cần cài `unrar`) giải nén ra, giữ lại các entry PDF/DOCX/DOC (bỏ qua ảnh/readme...) -
  **1 lần tải có thể ra NHIỀU dòng** nếu zip/rar chứa nhiều file (vd vừa có bản Hợp nhất vừa Riêng lẻ).
  Trước đây các file `.zip` (VD `CAP_...zip`, `KTS_...zip` ở Q2/2026) bị bỏ qua hoàn toàn - đã test lại
  bằng zip thật, ra đúng các PDF bên trong.
- `lib/report-extract.ts` (`extractReportContentForResolvedFiles`) - điểm nối DUY NHẤT rẽ nhánh theo
  định dạng để trích 3 bảng: PDF qua `determineStatementPageScope` + Mistral OCR (`extractFinancialStatements`);
  DOCX qua `lib/export/docx-statements.ts` (mammoth, đọc bảng HTML thật, chuyển sang cú pháp markdown
  của Mistral rồi tái dùng `parseStatementsFromMarkdown`); DOC (Word 97-2003 nhị phân cũ) qua
  `lib/export/doc-statements.ts` (`word-extractor` lấy text thuần, tự dò ranh giới cột bằng
  `lib/text-columnarize.ts` - độ tin cậy thấp hơn docx/pdf vì không có ranh giới cột gốc). DOCX/DOC
  **KHÔNG gọi AI/OCR nào** (đọc trực tiếp), khác PDF phải OCR.
- `lib/statement-scope.ts` (`classifyStatementScope`) - phân loại "Hợp nhất/Riêng lẻ/Chung" cho cột
  "Loại BCTC": ưu tiên dò từ khoá trong tên file/tiêu đề Vietstock, fallback dò trong chính nội dung tài
  liệu, và trả "Chung" (KHÔNG đoán bừa Hợp nhất hay Riêng lẻ) nếu không thấy dấu hiệu gì - đúng cho công
  ty không có công ty con, chỉ có 1 báo cáo duy nhất.
- `lib/analysis.ts` (`computeAnalysisRows`) - áp tiêu chí đọc BCTC để ra % thay đổi mỗi chỉ tiêu (CĐKT so
  đầu kỳ, KQKD so cùng kỳ - đã có sẵn 2 cột đó ngay trong 1 báo cáo). **TODO: đang pass-through (trả
  rỗng), chờ tiêu chí thật của user** - khi có, chỉ cần sửa file này, không đụng UI/pipeline/export.
- `lib/custom-source.ts` (`fetchCustomSourceReport`) - nút "Thêm nguồn riêng": dùng Mistral chat
  (`lib/ai/mistral-chat.ts`, cùng `MISTRAL_API_KEY`) duyệt trang tối đa 4 bước nhảy (VD trang chủ ->
  "Quan hệ cổ đông" -> "Báo cáo tài chính") để tự tìm link BCTC quý vừa kết thúc; không thấy trả
  `{found: false, message: 'Chưa có'}`. Tìm được thì tải + xử lý y hệt luồng Vietstock (coi như luôn
  "được chọn", không qua `content-filter`).
- `lib/summary-row.ts` - kiểu `SummaryRow` + gom union nhãn `analysis` (cột % động) dùng chung cho UI
  (`app/ReportsSummaryTable.tsx`) và export (`lib/export/summary-excel.ts`/`summary-pdf.ts`).
- `lib/pdf-text.ts` (`determineStatementPageScope`) - dùng Tesseract.js (local, không tốn token) **CHỈ
  để xác định phạm vi trang** trước điểm "Thuyết minh báo cáo tài chính" (fuzzy match, chịu được lỗi
  OCR) - không dùng để đọc nội dung số liệu, việc đó do Mistral OCR đảm nhiệm (xem dưới).
- `lib/ai/mistral-ocr.ts` (`callMistralOcr`) - gọi Mistral OCR API (`api.mistral.ai/v1/ocr`, model
  `MISTRAL_OCR_MODEL`, mặc định `mistral-ocr-latest`) trên chính file PDF gốc, trả về markdown từng
  trang. Tự động retry khi gặp lỗi mạng/tạm thời (429, 5xx, kết nối bị cắt giữa chừng) - tối đa 3 lần,
  cách nhau 2s, không retry lỗi request/key sai (4xx khác).
- `lib/export/markdown-tables.ts` (`parseStatementsFromMarkdown`) - parse markdown Mistral trả về
  thành 3 bảng (`FinancialStatements`) **hoàn toàn local, không gọi AI thêm**: nhận diện 3 mục theo tiêu
  đề (bỏ qua mục lục trang bìa liệt kê cả 4 tên bảng cùng lúc), gộp các bảng con trong 1 mục (VD bảng
  cân đối kế toán thường tách "Tài sản" + "Nguồn vốn" thành 2 bảng markdown riêng), và canh lại các dòng
  bị lệch cột (theo nội dung - tìm ô nhãn/mã số/giá trị bằng hình dạng, không theo vị trí cố định).
- `lib/export/financial-statements.ts` (`extractFinancialStatements`) - gọi `callMistralOcr` cho phạm
  vi trang đã xác định, parse qua `markdown-tables.ts`, rồi kiểm tra chéo (`validate-statements.ts`).
  Không còn vòng lặp "gọi lại AI sửa lỗi" như bản Qwen vision cũ (khái niệm đó dựa trên việc yêu cầu
  model đọc lại ảnh kỹ hơn, không áp dụng được với OCR thuần) - nếu kiểm tra chéo phát hiện lệch, báo
  qua `warnings`, không tự "sửa".
- `lib/export/transcribe.ts` (`transcribeFullDocument`) - chép toàn văn CẢ tài liệu (kể cả phần Thuyết
  minh) cho báo cáo đã qua bộ lọc nội dung - gọi Mistral OCR 1 lần cho toàn bộ file, đơn giản hơn nhiều
  so với bản cũ (phải chia lô 6 trang gọi vision model nhiều lần).
- `lib/export/validate-statements.ts` - kiểm tra cục bộ (không gọi AI) trên bảng đã cấu trúc hoá, theo
  nguyên tắc **fail-closed**: không kiểm tra được thì báo là lỗi, không được im lặng bỏ qua.
  - Tổng cộng tài sản = Tổng cộng nguồn vốn (theo mã số 100/200/270, 300/400/440).
  - Tổng các mục con cấp 2 (nhận diện qua mã số **và** ký hiệu La Mã ở cột STT hoặc tiền tố trong tên
    chỉ tiêu - không chỉ dựa "mã số chia hết cho 10", vì vài dòng chi tiết thường cũng tình cờ chia hết
    cho 10, vd mã 320/420) khớp với dòng tổng của nhóm.
  - Lợi nhuận gộp = Doanh thu thuần - Giá vốn hàng bán (dò theo tên, có fallback theo mã số 10 nếu tài
    liệu viết tắt "DT thuần" thay vì "Doanh thu thuần").
  - Lợi nhuận sau thuế = Lợi nhuận trước thuế - Chi phí thuế TNDN.
- `lib/export/excel.ts` - ghi 3 bảng ra 1 file `.xlsx`, mỗi bảng 1 sheet (chi tiết TỪNG báo cáo).
- `lib/export/pdf.ts` (`writeReportPdf`) - xuất PDF text sạch (không phải ảnh scan, chọn/copy/highlight
  được), gồm 3 bảng + toàn văn báo cáo (chi tiết TỪNG báo cáo).
- `lib/export/pdf-shared.ts` - phần "vẽ bảng PDF" thuần tuý (font, `PdfWriter`, `computeColumnLayout`,
  `drawTableRow`...) tách ra từ `pdf.ts` để dùng chung với `summary-pdf.ts`.
- `lib/export/summary-excel.ts`, `lib/export/summary-pdf.ts` - xuất bảng TỔNG HỢP nhiều công ty (các
  dòng được tick trên UI) ra 1 file `.xlsx`/`.pdf` DUY NHẤT, build buffer trong bộ nhớ (không ghi đĩa) -
  khác hẳn `excel.ts`/`pdf.ts` (chi tiết từng báo cáo riêng).
- `lib/export/index.ts` (`writeReportExports`) - ghi xlsx/pdf/txt đầy đủ cho báo cáo đã qua bộ lọc nội
  dung (bước trích 3 bảng giờ nằm ở `lib/report-extract.ts`, xem trên).
- `lib/content-filter.ts` - lọc theo **nội dung 3 bảng** (vd tăng trưởng doanh thu/lợi nhuận) - hiện
  đang pass-through, chờ chốt tiêu chí thật.
- `lib/ai/mistral-chat.ts` - client Mistral chat completions (khác `mistral-ocr.ts` - dùng để "suy luận"
  trên text, không phải OCR) - cho bước duyệt trang tìm nguồn riêng (`lib/custom-source.ts`).
- `lib/ai/qwen.ts` - client Qwen (qua OpenRouter) - **KHÔNG còn dùng cho bước trích 3 bảng nữa** (đã
  chuyển sang Mistral OCR). Giữ lại dự phòng cho bước lọc theo tiêu chí (`lib/content-filter.ts`) sau
  này nếu cần AI đọc/đánh giá nội dung - `OPENROUTER_API_KEY` đang bị comment trong `.env`, bỏ comment +
  điền lại key thật khi cần dùng.
- `lib/ai/claude.ts` - client Claude, viết sẵn nhưng chưa dùng ở đâu (dự phòng).
- `lib/pipeline.ts` - orchestrator dùng chung cho cả CLI và web; `runFetchPipeline(options)` nhận
  `{quarter, year, hoursWindow, reportLimit}` (xem `app/FetchControls.tsx`); `addCustomReport` để nguồn
  riêng (`lib/custom-source.ts`) ghi thêm vào cùng danh sách.
- `app/FetchControls.tsx` - dropdown chọn kỳ (lấy trực tiếp từ `app/api/report-terms`, KHÔNG tự sinh) +
  ô "giờ gần nhất" (đúng Quý vừa qua) hoặc "số BCTC gần nhất" (kỳ khác), nút "Tải BCTC" (giữ logic poll
  cũ) - đổi kỳ chỉ đổi ô input hiển thị, KHÔNG gọi API xem trước (đã bỏ theo yêu cầu user 2026-07-06,
  từng thử làm rồi revert).
- `app/CustomSourceForm.tsx` - nút "Thêm nguồn riêng" -> input link + Enter, hiện "Chưa có" nếu không
  tìm thấy.
- `app/ReportsSummaryTable.tsx` - bảng STT/Mã CK/Sàn giao dịch/Tên tài liệu/Ngày cập nhật/Tên công
  ty/Loại BCTC/cột % động (rỗng cho tới khi `lib/analysis.ts` có tiêu chí thật) + 2 nút xuất Excel/PDF
  RIÊNG cho từng dòng (không phải checkbox chọn nhiều dòng như bản đầu).

## Chạy

```bash
npm install
npm run dev        # mở http://localhost:3000
# hoặc
npm run fetch       # chạy thẳng từ terminal, không cần mở web (luôn lấy "quý vừa qua", không giới hạn)
```

Biến môi trường (`.env`):

- `MISTRAL_API_KEY` - key riêng của Mistral (KHÔNG qua OpenRouter) - bắt buộc cho bước trích 3 bảng PDF,
  chép toàn văn, và duyệt trang tìm nguồn riêng (`lib/ai/mistral-chat.ts`).
- `MISTRAL_OCR_MODEL` - mặc định `mistral-ocr-latest`.
- `MISTRAL_CHAT_MODEL` - mặc định `mistral-large-latest` (dùng cho `lib/custom-source.ts`).
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

## Triển khai lên web (vd Vercel) - CHƯA LÀM, mới bàn hướng

Nếu muốn có 1 trang web (Vercel...) với nút bấm để kích hoạt cả pipeline: **kiến trúc hiện tại (ghi file
trực tiếp ra đĩa) sẽ KHÔNG chạy được trên Vercel serverless** - vướng giới hạn thời gian chạy và không
có ổ đĩa lưu lâu dài giữa các lần gọi. 3 hướng đã bàn (chưa chọn hướng nào):
1. Web chỉ là giao diện; xử lý thật chạy trên máy/server riêng luôn bật (queue + worker), web chỉ hiển
   thị khi xong.
2. Chỉ chạy local, không có nút "bấm là chạy ngay" trên web.
3. Mistral OCR đã đủ nhanh cho serverless (vài giây/báo cáo) - nếu chọn hướng này, vướng mắc chính chỉ
   còn là lưu trữ file (cần S3/blob storage thay vì ghi thẳng ra đĩa cục bộ). Bảng tổng hợp (`summary-
   excel.ts`/`summary-pdf.ts`) đã đi theo hướng này (build buffer, trả thẳng qua response, không ghi
   đĩa) - phần còn lại (pipeline tải/OCR hàng loạt) vẫn ghi đĩa như cũ, chưa đổi.
4. `lib/report-source.ts` giải nén RAR qua `node-unrar-js` (WASM) bằng đường dẫn `process.cwd()` tới
   `node_modules` (tránh webpack/`@vercel/nft` cố bundle file `.wasm`) - CHỈ chắc chắn chạy đúng khi
   `node_modules` có sẵn trên đĩa như `npm run dev` hiện tại, CHƯA kiểm chứng trên Vercel serverless
   thật (nft trace file dựa trên phân tích tĩnh, đường dẫn build động ở đây có thể không được nhận diện).
