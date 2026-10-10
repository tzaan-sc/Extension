# ✨ OmniUI - Tiện Ích Soi Phần Tử Web, Lấy Code CSS/Tailwind & Chuyển Thành Figma

**OmniUI** là tiện ích mở rộng (Browser Extension - Manifest V3) hoàn chỉnh cho phép bạn mở trực tiếp trên bất kỳ trang web nào để:
1. 🎯 **Soi & Bắt Phần Tử Trực Quan (Interactive Element Inspector)**: Rê chuột và click vào bất kỳ nút, thẻ, bảng, form hay menu nào trên web để trích xuất ngay lập tức.
2. 💻 **Trích Xuất Đa Định Dạng**:
   - **HTML Gốc & Clean HTML**.
   - **Computed CSS hoàn chỉnh** (Màu sắc, Font chữ, Flexbox/Grid layout, Box-shadow, Padding, Border...).
   - **Tự động dịch sang Tailwind CSS classes**.
   - **Component React JSX**.
3. 🎨 **Chuyển Đổi Sang Figma JSON**:
   - Chuyển đổi phần tử hoặc toàn bộ trang thành cây Node chuẩn Figma (`FRAME`, `TEXT`, `fills`, `strokes`, `layoutMode`, `cornerRadius`, `effects`).
   - Có thể dán trực tiếp vào Figma qua Plugin hoặc lưu thành file `.json`.
4. 🎨 **Quét Bảng Màu & Typography Toàn Trang**:
   - Tự động lọc tất cả mã màu (Color Palette) và Font chữ đang dùng trên website, click 1 nút để copy mã Hex.
5. 📦 **Xuất Toàn Bộ Trang (Full Page Export)**:
   - Tải file Figma JSON toàn trang.
   - Tải file HTML + CSS đóng gói hoàn chỉnh.

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT & SỬ DỤNG TRONG 1 PHÚT

### Bước 1: Nạp tiện ích vào Microsoft Edge / Chrome
1. Mở trình duyệt Edge và truy cập: `edge://extensions` (hoặc Chrome: `chrome://extensions`).
2. Bật công tắc **"Chế độ dành cho nhà phát triển" (Developer mode)** ở góc trái dưới/phía trên.
3. Bấm vào nút **"Tải tiện ích đã giải nén" (Load unpacked)**.
4. Chọn thư mục: **`D:\GIT\Extension\UI`**.

---

### Bước 2: Trải nghiệm thực tế
1. Kéo thả file test [test_ui.html](file:///d:/GIT/Extension/UI/test_ui.html) vào trình duyệt Edge (hoặc mở bất kỳ trang web nào bạn thích như YouTube, Shopee, Apple, Github...).
2. Bấm vào icon **OmniUI** trên thanh công cụ -> Chọn tab **🎯 Soi Phần Tử**.
3. Bấm **"Bắt Đầu Soi Phần Tử Trên Trang"**:
   - Rê chuột trên web: Khung viền xanh phát sáng sẽ bắt chuẩn xác từng thẻ HTML.
   - **Click vào một nút bấm hoặc Card**: Một bảng mã nguồn nổi (Floating Drawer) sẽ xuất hiện ngay lập tức với đủ các tab **Figma JSON**, **CSS**, **HTML**, **React JSX** để bạn Copy hoặc Tải về!
4. Mở lại Popup -> Chọn tab **🎨 Màu & Font** để xem trọn bộ bảng màu và font chữ của trang web.

---

## 📁 CẤU TRÚC DỰ ÁN

```
D:\GIT\Extension\UI\
├── manifest.json            # Cấu hình Manifest V3
├── README.md                # Tài liệu hướng dẫn sử dụng
├── test_ui.html             # Trang web demo để thử nghiệm tính năng
├── background\
│   └── background.js        # Background Service Worker
├── content\
│   ├── inspector.js         # Trình soi phần tử trực quan & thanh HUD
│   └── figma_parser.js      # Bộ máy chuyển đổi DOM sang Figma Node JSON & Tailwind
└── ui\
    ├── popup.html           # Giao diện Popup điều khiển
    ├── popup.css            # Thiết kế Dark Glassmorphism hiện đại
    └── popup.js             # Bộ xử lý logic popup & xuất file
```
