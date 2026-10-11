# 🎧 Shadowing & Dictation - YouTube Chrome Extension

Tiện ích Chrome SidePanel thông minh hỗ trợ luyện nghe, chép chính tả (**Dictation**) và nhại giọng (**Shadowing**) trên mọi video YouTube có phụ đề. Hỗ trợ đa ngôn ngữ hoàn chỉnh (**Tiếng Anh, Tiếng Việt, Tiếng Nhật, Tiếng Hàn, Tiếng Trung...**) cùng cơ chế tối ưu cho cả các video dài hàng giờ liền.

---

## 📖 MỤC LỤC
1. [🌟 Tính năng nổi bật](#-tính-năng-nổi-bật)
2. [🌏 Hỗ trợ đa ngôn ngữ chuyên sâu (EN, VI, JA, KO, ZH...)](#-hỗ-trợ-đa-ngôn-ngữ-chuyên-sâu)
3. [⏱️ Tối ưu hóa cho video dài (1 - 3+ tiếng)](#️-tối-ưu-hóa-cho-video-dài-1---3-tiếng)
4. [🚀 Hướng dẫn cài đặt vào trình duyệt](#-hướng-dẫn-cài-đặt-vào-trình-duyệt)
5. [🎯 Hướng dẫn sử dụng chi tiết](#-hướng-dẫn-sử-dụng-chi-tiết)
6. [⌨️ Bảng phím tắt (Hotkeys)](#️-bảng-phím-tắt-hotkeys)
7. [🛠️ Trình chẩn đoán & Bắt bệnh tự động](#️-trình-chẩn-đoán--bắt-bệnh-tự-động)
8. [❓ Câu hỏi thường gặp & Khắc phục sự cố](#-câu-hỏi-thường-gặp--khắc-phục-sự-cố)

---

## 🌟 TÍNH NĂNG NỔI BẬT

- **Giao diện Chrome SidePanel hiện đại**: Chạy dọc cạnh bên trình duyệt, không che khung hình video và không làm ảnh hưởng trải nghiệm xem.
- **Tự động bắt phụ đề thông minh**: Trích xuất toàn bộ phụ đề gốc (Creator uploaded), phụ đề nhận diện giọng nói (ASR Auto-generated) và phụ đề Dịch tự động từ YouTube.
- **Cơ chế Auto-Fallback**: Nếu một track phụ đề bị rỗng (0 câu), tiện ích tự động dò tìm và chuyển sang track phụ đề có nội dung khả dụng.
- **Chế độ Auto-Pause**: Tự động dừng video ở cuối mỗi câu thoại để bạn tập trung gõ và nhại lại giọng đọc.
- **Lặp câu (Loop)**: Tự động tua lại câu hiện tại liên tục cho tới khi bạn nghe rõ từng âm tiết.
- **So khớp & Chấm điểm chính xác**:
  - 🟩 **Xanh lá**: Từ bạn gõ chính xác.
  - 🟥 **Đỏ**: Từ bị bỏ sót / thiếu.
  - 🟨 **Vàng**: Từ gõ thừa hoặc sai chính tả.
- **Gợi ý (Hint)**: Hiển thị chữ cái đầu của mỗi từ khi gặp câu khó (`Alt + H`).
- **Xem toàn bộ phụ đề (Transcript List)**: Tìm kiếm từ khóa và bấm chọn câu bất kỳ để tua video đến thời điểm đó ngay lập tức.
- **Tùy chỉnh tốc độ linh hoạt**: `0.75x`, `0.9x`, `1.0x` phù hợp với mọi trình độ luyện nghe.

---

## 🌏 HỖ TRỢ ĐA NGÔN NGỮ CHUYÊN SÂU

Extension được thiết kế riêng với các thuật toán ngôn ngữ học để hỗ trợ tối ưu cho các ngoại ngữ phổ biến:

| Ngôn ngữ | Đặc thù xử lý | Tính năng hỗ trợ |
| :--- | :--- | :--- |
| **Tiếng Anh (EN)** | Từ chuẩn cách nhau bởi dấu cách | So khớp từ theo LCS, chuẩn hóa chữ hoa/thường, loại bỏ dấu câu Latin |
| **Tiếng Việt (VI)** | Có thanh điệu & ký tự Unicode có dấu | Giải mã mã Hex (`&#x...;`), fix lỗi thời lượng 0s (`d="0"`) của YouTube ASR |
| **Tiếng Nhật (JA)** | Viết liền mạch, không có dấu cách | Tách từ thông minh bằng **`Intl.Segmenter`**, hỗ trợ Kanji/Kana, lọc dấu `。` `、` `「」` |
| **Tiếng Trung (ZH)** | Chữ Hán viết liền, không có dấu cách | Tách từ thông minh theo chuẩn ngữ pháp tiếng Trung, chấm điểm từng từ/ký tự |
| **Tiếng Hàn (KO)** | Hangul có dấu cách theo cụm từ (어절) | Nhận diện cụm từ Hangul, lọc dấu câu toàn phần phương Đông |
| **Dịch tự động** | Hơn 100+ ngôn ngữ từ YouTube | Hỗ trợ tham số `&tlang=` cho phép dịch bất kỳ video nào sang ngôn ngữ bạn muốn học |

---

## ⏱️ TỐI ƯU HÓA CHO VIDEO DÀI (1 - 3+ TIẾNG)

Không lo bị đứt quãng phụ đề đối với Podcast, Audiobook, Bài giảng TED hay Livestream:
1. **Ưu tiên Timedtext Full Payload**: Tải trọn vẹn 100% phụ đề của toàn bộ video dài trong 1 request duy nhất.
2. **Hỗ trợ Continuation Loop**: Tự động lặp phân trang qua Innertube API nếu video kích hoạt cơ chế chia nhỏ transcript.
3. **Lazy / Infinite Chunk Rendering**: Danh sách câu thoại tải theo cụm mượt mà (`CHUNK_SIZE = 80`), cuộn đến đâu tạo DOM đến đó, không làm đơ/lag trình duyệt khi video có từ 2.000 – 5.000 câu.

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT VÀO TRÌNH DUYỆT

> Áp dụng cho: **Google Chrome**, **Microsoft Edge**, **Brave**, **Cốc Cốc**, **Opera**.

1. Mở trình duyệt và truy cập:
   ```text
   chrome://extensions/
   ```
2. Bật công tắc **Chế độ dành cho nhà phát triển (Developer mode)** ở góc trên bên phải.
3. Bấm vào nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trên bên trái.
4. Chọn thư mục tiện ích:
   ```text
   d:\GIT\Extension\YouTube Shadowing & Dictation
   ```
5. Tiện ích **Shadowing & Dictation** sẽ xuất hiện trên thanh công cụ của trình duyệt!

---

## 🎯 HƯỚNG DẪN SỬ DỤNG CHI TIẾT

### Bước 1: Mở video YouTube
- Mở bất kỳ video nào bạn muốn học trên [YouTube](https://www.youtube.com).
- Đảm bảo video có phụ đề (nút `[CC]` trên thanh điều khiển của YouTube).

### Bước 2: Mở SidePanel tiện ích
- Bấm vào icon **Shadowing & Dictation** trên thanh tiện ích của trình duyệt.
- SidePanel sẽ tự động kết nối với tab video YouTube đang phát.

### Bước 3: Luyện chép chính tả & Shadowing
1. **Chọn phụ đề**: Chọn ngôn ngữ trong menu thả xuống (ví dụ: *English*, *Tiếng Nhật*, hoặc *Tiếng Việt (Dịch tự động)*).
2. **Nghe câu phát**: Bấm **Phát câu này** (hoặc nhấn phím `Tab` / `Ctrl + Space`).
3. **Gõ lại nội dung**: Nhập câu bạn nghe được vào ô nhập liệu.
4. **Kiểm tra kết quả**: Nhấn phím `Enter` để xem điểm số % và chi tiết từ đúng/sai.
5. **Chuyển câu tiếp theo**: Nhấn `Alt + →` để tiếp tục luyện câu tiếp theo.

---

## ⌨️ BẢNG PHÍM TẮT (HOTKEYS)

| Phím tắt | Tác vụ |
| :--- | :--- |
| `Tab` hoặc `Ctrl + Space` | **Phát / Nghe lại câu hiện tại** |
| `Enter` | **Kiểm tra kết quả** (khi đang ở ô nhập liệu) |
| `Alt + →` | **Chuyển sang câu tiếp theo** |
| `Alt + ←` | **Lùi về câu trước đó** |
| `Alt + H` | **Xem gợi ý chữ cái đầu** |
| `Alt + R` | **Hiện toàn bộ đáp án của câu** |

---

## 🛠️ TRÌNH CHẨN ĐOÁN & BẮT BỆNH TỰ ĐỘNG

Khi gặp bất kỳ vấn đề nào, bấm vào nút **🛠️ Kiểm tra** ở góc trên SidePanel:
- Tự động kiểm tra trạng thái tab YouTube.
- Quét và kiểm tra chất lượng của từng track phụ đề.
- Hiển thị báo cáo checklist ngắn gọn:
  ```text
  📋 KẾT QUẢ KIỂM TRA NHANH:
  1. Video: 🎬 "Tiêu đề video..."
  2. Kết nối: ✅ Sẵn sàng
  3. Phụ đề phát hiện: ✅ Có 2 track
     • [0] Tiếng Anh: ✅ Có 420 câu
  4. Tải nội dung: ✅ Đã nạp thành công!
  ```
- Nếu có lỗi, trình chẩn đoán sẽ chỉ rõ nguyên nhân và hướng dẫn bạn cách khắc phục ngay lập tức (1-Click F5, bật nút CC...).

---

## ❓ CÂU HỎI THƯỜNG GẶP & KHẮC PHỤC SỰ CỐ

### 1. Hiện thông báo "Chưa mở video YouTube nào" hoặc "Chưa kết nối"?
- Chuyển sang tab YouTube và nhấn **F5** để tải lại trang 1 lần.
- Bấm nút **🔄 Quét lại video** trên SidePanel.

### 2. Hiện "Lỗi tải phụ đề" trên video âm nhạc / playlist?
- Một số video âm nhạc hoặc lofi không có lời thoại thật sự, track phụ đề tự tạo của YouTube chỉ chứa tag `[Âm nhạc]` hoặc 0 từ.
- Hãy mở một video có người nói chuyện thật sự (như TED Talk, tin tức, phỏng vấn, bài giảng, podcast...).

### 3. Cách cập nhật tiện ích khi có bản sửa lỗi mới:
- Truy cập `chrome://extensions/` và bấm nút **🔄 Reload** tại tiện ích **Shadowing & Dictation**.
