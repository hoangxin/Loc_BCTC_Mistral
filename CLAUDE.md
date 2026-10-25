# Quy tắc bắt buộc khi làm việc trên Loc_BCTC_Mistral

## Trước khi gọi Mistral OCR thật (tốn phí)

Sự cố 2026-07-14: tự dựng lại vòng lặp OCR trong 1 script rời thay vì tái
dùng hàm production, chọn nhầm endpoint (sync thay vì batch) dựa trên 1
comment đã lỗi thời thay vì grep code thật, gây tốn phí OCR thật mà không
lấy được dữ liệu dùng được. Để không lặp lại:

1. **Không bao giờ tự viết lại vòng lặp gọi OCR** (chọn sync/batch, tự lặp
   probe theo trang) trong 1 script rời. Luôn tái dùng thẳng hàm production
   đang export sẵn (`extractFinancialStatementsWithOcrProbe` trong
   `lib/export/financial-statements.ts`, hoặc hàm cấp cao hơn
   `extractReportContent` trong `lib/report-extract.ts`) cho MỌI script re-fetch
   1 báo cáo cụ thể. Việc này tự động đảm bảo dùng đúng endpoint/logic y hệt
   production, loại bỏ hẳn lớp lỗi "chọn nhầm client OCR".
2. **Không bao giờ kết luận 1 hàm/đường code "đang dùng" hay "chưa dùng"
   trong production chỉ từ 1 dòng comment.** Comment mô tả trạng thái đó rất
   dễ lỗi thời khi code đổi sau đó mà không ai cập nhật lại comment. Luôn
   `grep` toàn bộ codebase tìm nơi THẬT SỰ import/gọi hàm đó trước khi hành
   động dựa trên kết luận này.
3. **Trước MỌI lần gọi OCR thật** (không chỉ lần đầu của cả nhiệm vụ): nói rõ
   chi phí dự kiến (số trang) và xin xác nhận - kể cả khi nhiệm vụ tổng thể
   đã được duyệt trước đó, nếu cơ chế gọi cụ thể thay đổi (vd đổi từ sync
   sang batch) hoặc đã phát sinh chi phí ngoài dự kiến, phải dừng lại hỏi lại,
   không tự ý tiếp tục.
4. **Lưu output thô ra đĩa NGAY sau mỗi lần gọi OCR thành công**, trước khi
   parse/xử lý tiếp - nếu bước sau lỗi, không cần gọi OCR lại (xem
   `feedback_never_reocr_when_cache_exists` trong bộ nhớ).
5. **Nếu gặp hiện tượng không giải thích được** (vd dữ liệu/job lạ không khớp
   với những gì mình vừa gọi): dừng lại hỏi người dùng ngay, không tiếp tục
   suy đoán/thử thêm lệnh gọi API thật để tự kiểm chứng giả thuyết.

## Cache kết quả (data/fetch-status/)

Từ 2026-10-25 cache KHÔNG còn là 1 file `data/latest-fetch.json` mà tách thành
`data/fetch-status/index.json` (phần dùng chung) + mỗi kỳ 1 file
`data/fetch-status/<năm>-<kỳ>.json` — xem `lib/status-store.ts`. Lý do: file đơn
đã 52MB, vượt mức GitHub khuyến nghị, và mỗi lần chạy fetch commit lại TOÀN BỘ
file nên repo phình hàng chục MB mỗi lần. Luôn đọc/ghi qua `readStatus()` /
`writeStatus()`, đừng mở thẳng file.

Cache là dữ liệu đã tính sẵn 1 lần, KHÔNG tự cập nhật khi
code đổi. Sau khi sửa code ở tầng validate/analysis (không đụng tới cách đọc
markdown), chạy `scripts/resync-cache.ts` để đồng bộ `warnings`/`analysis`
mà không cần OCR lại - xem comment đầu file đó. Nếu sửa ở tầng PARSER (cách
đọc bảng từ markdown), resync không đủ - cache cũ vẫn giữ dữ liệu parse sai,
cần re-fetch thật cho báo cáo bị ảnh hưởng (xin xác nhận trước, xem mục trên).

## Bắt buộc: chạy regression toàn corpus TRƯỚC khi push thay đổi parser/analysis

Mọi thay đổi trong `lib/export/markdown-tables.ts`, `lib/export/statement-shared.ts`,
`lib/export/validate-statements.ts` hay `lib/analysis.ts` đều có thể làm sai
hàng trăm báo cáo khác mà không ai thấy. Trước khi push:

1. Lấy bản `data/ocr-markdown` + `data/fetch-status/` đang chạy thật
   (tarball repo trên GitHub là đủ, không cần OCR lại).
2. Chạy `scripts/_debug-corpus-regression-2026-10-20.ts <thư-mục-đó>` - script
   parse lại toàn bộ ~1.200 markdown bằng parser hiện tại rồi so với cache.
3. **Luôn chạy 2 lần: một lần với code GỐC (chưa sửa) để lấy baseline.** Không
   có baseline thì không phân biệt được "lỗi sẵn có" với "lỗi mình vừa gây ra" -
   ART/MIG/QHD lệch sẵn so với cache, rất dễ bị đổ oan cho thay đổi mới.
4. Mở từng báo cáo có LNST đổi, đối chiếu với markdown gốc. Đừng cho rằng
   "ít dòng hơn = tệ hơn": phần lớn là rác bị loại đúng. Ngược lại, một con số
   nhìn hợp lý vẫn có thể SAI (bảng giải trình ghi bằng TRIỆU đồng).
5. Nếu một thay đổi làm đổi kết quả của hàng trăm báo cáo mà không kiểm chứng
   nổi, BỎ nó đi - ghi lại dưới dạng comment đã thử + lý do bỏ (xem
   `findLnstCongTyMe` trong `lib/analysis.ts`).

## Mọi request HTTP ra ngoài đi qua lib/http.ts

User-Agent, header trình duyệt và retry lỗi tạm thời được định nghĩa DUY NHẤT
ở `lib/http.ts`. Sự cố 2026-10-20 (6 báo cáo Q3/2026 lỗi 404 liên tiếp): bản
sửa UA ngày 2026-07-31 chỉ áp vào `lib/vietstock-reports.ts`, bỏ quên
`lib/download.ts` và `lib/custom-source.ts` - 2 file vẫn gửi UA ngắn
`'Mozilla/5.0'` và bị Cloudflare của static2.vietstock.vn chặn. Khi sửa bất
cứ thứ gì liên quan tới cách gọi mạng, sửa ở `lib/http.ts` chứ không sửa tại
chỗ, và `grep` lại toàn repo xem còn chỗ nào tự đặt header/retry riêng không.

## Không dùng số thứ tự/mã số để phân loại dòng BCTC

Luôn phân loại dòng theo TÊN chỉ tiêu + quy tắc kế toán (Thông tư), không bao
giờ dùng STT/mã số/vị trí trong bảng để quyết định 1 dòng LÀ gì hay cấp mấy.
Xem `feedback_no_numbering_classification` trong bộ nhớ để biết chi tiết và
lý do.
