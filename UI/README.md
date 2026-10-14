# ✨ OmniUI - Soi Phần Tử Web, Xuất Sang Figma & Trích Xuất Code Siêu Tốc

**OmniUI** là tiện ích mở rộng (Browser Extension - Manifest V3) giúp bạn truy cập bất kỳ trang web nào, soi trực quan từng phần tử (nút bấm, card, navbar, form, banner...) và:
1. 🎨 **Chuyển thành Figma (2 cách cực nhanh)**:
   - **Cách 1 (Nhanh nhất - 1 giây)**: Bấm **"Copy SVG cho Figma"** -> Vào Figma nhấn **`Ctrl + V`** là dán trực tiếp phần tử thành vector/layer trên Canvas.
   - **Cách 2 (Chuẩn Auto-Layout & Text Layer)**: Bấm **"Figma Script"** -> Mở Console trong Figma (`Ctrl + Shift + I`) dán vào là Figma tự sinh ra toàn bộ Frame, Auto Layout, Padding, Gap và Text layers nguyên bản.
   - **Cách 3**: Tải file **`.figma.json`** trọn gói của phần tử hoặc toàn bộ trang web.
2. 💻 **Chuyển thành Code để copy theo xài**:
   - 🌊 **Tailwind CSS HTML**: Tự động dịch toàn bộ cây thẻ con thành mã HTML với class Tailwind chuẩn đẹp.
   - ⚛️ **React JSX**: Tạo sẵn React Component với đầy đủ cấu trúc và style.
   - 💚 **Vue 3 SFC**: Template và Script setup cho Vue/Nuxt.
   - 💻 **HTML & CSS Độc Lập**: HTML kèm theo Computed CSS đóng gói, không sợ xung đột class.
3. 🎯 **Trình Soi Trực Quan Thông Minh**:
   - Khung phát sáng bám theo con trỏ chuột.
   - **Thanh Breadcrumb điều hướng**: Dễ dàng click chuyển từ nút bấm con sang cả Card hoặc cả Section lớn.
   - **Phím tắt nhanh**: Nhấn `↑` (Arrow Up) để chọn thẻ cha, `↓` (Arrow Down) để chọn thẻ con, `ESC` để thoát.
   - **Bảng Drawer nổi**: Kéo thả di chuyển tự do trên màn hình, không che khuất trang web.
4. 🎨 **Quét Bảng Màu & Typography Toàn Trang**:
   - Lọc toàn bộ mã màu Hex/RGB và Font chữ đang dùng trên website, click 1 chạm để sao chép.

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT TRONG 1 PHÚT

### Bước 1: Nạp tiện ích vào trình duyệt (Edge / Chrome)
1. Mở trình duyệt và truy cập:
   - Microsoft Edge: `edge://extensions`
   - Google Chrome: `chrome://extensions`
2. Bật công tắc **"Chế độ dành cho nhà phát triển" (Developer mode)** ở góc trên hoặc góc trái dưới.
3. Bấm nút **"Tải tiện ích đã giải nén" (Load unpacked)**.
4. Chọn thư mục: **`D:\GIT\Extension\UI`**.

---

## 💡 HƯỚNG DẪN SỬ DỤNG CHI TIẾT

### 1. Thử nghiệm ngay trên trang demo
- Bạn có thể kéo thả trực tiếp file test [test_ui.html](file:///d:/GIT/Extension/UI/test_ui.html) vào Edge/Chrome (hoặc mở bất kỳ website nào như YouTube, Shopee, Apple, Github...).

### 2. Soi phần tử & Lấy Code / Figma
1. Bấm vào icon **OmniUI** trên thanh công cụ trình duyệt.
2. Bấm nút **"🎯 Bắt Đầu Soi Phần Tử Trên Trang"**:
   - Rê chuột trên web: Khung viền xanh phát sáng kèm thông số kích thước thẻ sẽ bám theo chuột.
   - **Phím mũi tên `↑`**: Chọn nhanh thẻ cha bọc ngoài (ví dụ từ Text lên Card).
   - **Click chuột vào phần tử**: Bảng điều khiển nổi (Floating Drawer) sẽ xuất hiện ngay góc màn hình.
3. Trong bảng điều khiển:
   - **Để dán vào Figma**:
     - Bấm **"⚡ Copy SVG (Dán vào Figma Ctrl+V)"** -> Mở Figma và nhấn `Ctrl + V`!
     - Hoặc bấm **"💻 Figma Script"** -> Mở Console Figma (`Ctrl + Shift + I`), dán mã và Enter để dựng Auto Layout.
   - **Để lấy Code**:
     - Chọn tab **Tailwind HTML**, **React JSX**, **Vue 3** hoặc **HTML+CSS** -> Bấm **"📋 Sao Chép Mã Nguồn"** để paste vào project của bạn.

### 3. Quét Bảng Màu & Font Chữ
- Mở Popup OmniUI -> Chọn tab **🎨 Bảng Màu & Font**.
- Click vào bất kỳ ô màu nào để copy mã Hex/RGB tức thì.

### 4. Xuất Toàn Bộ Trang Web
- Mở Popup OmniUI -> Chọn tab **📦 Xuất Toàn Trang** để tải file Figma JSON hoặc trọn gói HTML+CSS cả website.

---

## 📁 CẤU TRÚC THƯ MỤC DỰ ÁN

```
D:\GIT\Extension\UI\
├── manifest.json            # Cấu hình Chrome Extension Manifest V3
├── README.md                # Hướng dẫn chi tiết sử dụng
├── test_ui.html             # Trang web demo để thử nghiệm
├── background\
│   └── background.js        # Service Worker nền
├── content\
│   ├── figma_parser.js      # Bộ máy chuyển đổi DOM sang Figma, SVG, Tailwind, React, Vue
│   └── inspector.js         # Trình soi trực quan HUD, Breadcrumb & Floating Studio
└── ui\
    ├── popup.html           # Giao diện Popup điều khiển
    ├── popup.css            # Thiết kế Dark Glassmorphism
    └── popup.js             # Logic xử lý sao chép & xuất dữ liệu
```
