# 🎧 Shadowing & Dictation - YouTube Chrome Extension

Tiện ích Chrome SidePanel thông minh hỗ trợ luyện nghe, chép chính tả (**Dictation**) và nhại giọng (**Shadowing**) trên mọi video YouTube có phụ đề.

---

## 📖 MỤC LỤC
1. [🌟 Tính năng nổi bật](#-tính-năng-nổi-bật)
2. [🚀 Hướng dẫn cài đặt vào trình duyệt](#-hướng-dẫn-cài-đặt-vào-trình-duyệt)
3. [🎯 Hướng dẫn sử dụng chi tiết](#-hướng-dẫn-sử-dụng-chi-tiết)
4. [⌨️ Bảng phím tắt (Hotkeys)](#️-bảng-phím-tắt-hotkeys)
5. [❓ Câu hỏi thường gặp & Khắc phục sự cố](#-câu-hỏi-thường-gặp--khắc-phục-sự-cố)

---

## 🌟 TÍNH NĂNG NỔI BẬT

- **Giao diện Chrome SidePanel**: Chạy dọc bên phải trình duyệt, không che mất khung hình video.
- **Tự động trích xuất phụ đề**: Bắt toàn bộ phụ đề gốc hoặc phụ đề tự động (Auto-generated ASR) của YouTube.
- **Chế độ Auto-Pause**: Tự động dừng video ở cuối mỗi câu để bạn tập trung gõ/nói.
- **Lặp câu (Loop)**: Tự động tua lại câu hiện tại cho tới khi bạn nghe rõ.
- **So khớp & Chấm điểm chính xác**:
  - 🟩 **Xanh lá**: Từ bạn gõ đúng.
  - 🟥 **Đỏ**: Từ bị bỏ sót / thiếu.
  - 🟨 **Vàng**: Từ gõ thừa hoặc sai chính tả.
- **Gợi ý (Hint)**: Hiển thị chữ cái đầu của mỗi từ khi gặp câu khó.
- **Xem toàn bộ phụ đề (Transcript List)**: Tìm kiếm và bấm chọn bất kỳ câu nào để tua video tới đó ngay.
- **Tùy chỉnh tốc độ**: `0.75x`, `0.9x`, `1.0x` phù hợp với độ khó của câu.

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT VÀO TRÌNH DUYỆT

> Áp dụng cho: **Google Chrome**, **Microsoft Edge**, **Brave**, **Cốc Cốc**, **Opera**.

1. Mở trình duyệt và truy cập vào đường dẫn:
   ```text
   chrome://extensions/
   ```
2. Bật công tắc **Chế độ dành cho nhà phát triển (Developer mode)** ở góc trên cùng bên phải.
3. Bấm vào nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trên bên trái.
4. Chọn thư mục tiện ích:
   ```text
   d:\GIT\Extension\YouTube Shadowing & Dictation
   ```
5. Tiện ích **Shadowing & Dictation** sẽ xuất hiện trên danh sách tiện ích của trình duyệt!

---

## 🎯 HƯỚNG DẪN SỬ DỤNG CHI TIẾT

### Bước 1: Mở video YouTube
- Mở bất kỳ video nào bạn muốn luyện tập trên [YouTube](https://www.youtube.com).
- **Lưu ý**: Đảm bảo video có phụ đề (biểu tượng `[CC]` trên thanh phát của YouTube).

### Bước 2: Mở SidePanel tiện ích
- Bấm vào icon **Shadowing & Dictation** trên thanh công cụ tiện ích của trình duyệt (hoặc icon SidePanel của Chrome).
- Tiện ích sẽ tự động nhận diện video và danh sách phụ đề có sẵn.

### Bước 3: Luyện chép chính tả & Shadowing
1. **Chọn phụ đề**: Chọn ngôn ngữ bạn muốn luyện (ví dụ: *Tiếng Anh (được tạo tự động)* hoặc *English*).
2. **Nghe câu phát**: Bấm **Phát câu này** (hoặc phím `Tab` / `Ctrl + Space`).
3. **Gõ lại nội dung**: Gõ những gì bạn nghe được vào ô nhập liệu.
4. **Kiểm tra kết quả**: Nhấn phím `Enter` (hoặc bấm nút **Kiểm tra**) để xem điểm số % và phân tích từng từ đúng/sai.
5. **Chuyển câu tiếp theo**: Nhấn `Alt + →` để qua câu tiếp theo.

---

## ⌨️ BẢNG PHÍM TẮT (HOTKEYS)

| Phím tắt | Tác vụ |
| :--- | :--- |
| `Tab` hoặc `Ctrl + Space` | **Phát / Nghe lại câu hiện tại** |
| `Enter` | **Kiểm tra kết quả** (khi đang ở ô gõ) |
| `Alt + →` | **Chuyển sang câu tiếp theo** |
| `Alt + ←` | **Lùi về câu trước đó** |
| `Alt + H` | **Xem gợi ý chữ cái đầu** |
| `Alt + R` | **Xem toàn bộ đáp án câu gốc** |

---

## ❓ CÂU HỎI THƯỜNG GẶP & KHẮC PHỤC SỰ CỐ

### 1. Hiện thông báo "Chưa mở video YouTube nào" hoặc "Chưa kết nối"?
- Hãy chuyển sang tab video YouTube và nhấn **F5** để tải lại trang 1 lần.
- Sau đó bấm nút **🔄 Quét lại video** trên SidePanel.

### 2. Hiện "Lỗi tải phụ đề"?
- Kiểm tra xem video YouTube đó có bật phụ đề `[CC]` hay không.
- Bấm vào danh sách chọn phụ đề và chọn lại một track phụ đề khác nếu có.

### 3. Cập nhật code mới nhất:
- Truy cập `chrome://extensions/` và bấm nút **🔄 Reload** tại tiện ích **Shadowing & Dictation**.
