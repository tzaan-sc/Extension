# 🎨 CẨM NANG TOÀN TẬP: TRÍCH XUẤT & TÁI TẠO CODE GIAO DIỆN (UI CLONING & GENERATION GUIDE)

Tài liệu này tổng hợp toàn bộ các phương pháp, công cụ, tiện ích mở rộng (Extensions), Plugin Figma và AI để chuyển đổi giao diện website hoặc hình ảnh chụp màn hình thành code **HTML/CSS, Tailwind CSS, React, Vue** nhanh chóng và chuẩn xác nhất.

---

## 📌 PHẦN 1: KHI BẠN ĐANG MỞ TRANG WEB ĐÓ TRÊN TRÌNH DUYỆT (Không Cần AI)

Nếu bạn có sẵn đường link website và muốn lấy code gốc sạch đẹp 100%:

### 1. Trích xuất nhanh từng khối / Nút bấm / Menu (Component Level)
* **[CSS Peeper](https://csspeeper.com/)** *(Extension Chrome/Edge)*:
  - Bấm vào bất kỳ thành phần nào trên trang để xem mã màu (Hex/RGB), font chữ, padding, kích thước, ảnh SVG và copy nhanh CSS.
* **[DivMagic](https://divmagic.com/)** *(Extension Chrome/Edge)*:
  - Công cụ mạnh mẽ nhất để copy component. Chỉ cần click chuột vào 1 thẻ/khối bất kỳ -> Chọn **"Copy as HTML / Tailwind CSS / React"**. Toàn bộ class và style sẽ được đóng gói sẵn sàng để dán vào code.
* **[SnappySnippet](https://chrome.google.com/webstore)** *(Extension Chrome/Edge)*:
  - Cho phép chọn 1 phần tử trên DevTools và xuất ra trọn gói HTML + CSS tương ứng của phần tử đó.

### 2. Clone trọn gói toàn bộ trang web thành 1 file HTML duy nhất
* **[SingleFile](https://github.com/gildas-lormeau/SingleFile)** *(Extension Chrome/Edge/Firefox)*:
  - Tự động quét toàn bộ DOM, nhúng toàn bộ CSS, font chữ, icon SVG và hình ảnh (Base64) vào đúng **1 file `.html` duy nhất**. Bạn có thể mở offline hoặc lấy code tùy chỉnh.
* **[Save Page WE](https://chrome.google.com/webstore)**:
  - Tương tự SingleFile, lưu trang hoàn chỉnh chỉ với 1 click.

### 3. Chuyển đổi Website thành File Thiết Kế Figma & Xuất Code
* **[html.to.design](https://www.html.to.design/)** *(Figma Plugin & Chrome Extension)*:
  - **Cách dùng**: Mở Figma -> Phím tắt `Ctrl + /` -> Tìm `html.to.design` -> Dán link website -> Bấm **Import**.
  - Toàn bộ website được phân rã thành các Layer, Auto-Layout, Style màu sắc chuẩn trong Figma.
* **[Builder.io - Figma to Code](https://www.builder.io/)** *(Figma Plugin)*:
  - **Cách dùng**: Tìm plugin `Builder.io` trong Figma -> Chọn tab **"Import from web"** -> Dán URL.
  - Sau khi có thiết kế trong Figma -> Bấm **"Generate Code"** -> Xuất ra code sạch: **HTML/CSS, Tailwind CSS, React, Vue, Svelte, Flutter**.

---

## 🤖 PHẦN 2: KHI BẠN CHỈ CÓ 1 TẤM ẢNH CHỤP MÀN HÌNH (BẮT BUỘC DÙNG AI VISION)

Khi chỉ có ảnh chụp màn hình (JPG/PNG), hệ thống máy tính truyền thống không nhận diện được thẻ DOM, bắt buộc phải dùng các mô hình AI thị giác đa phương thức (Multimodal AI) để phân tích bố cục và tự viết code:

### 1. Gửi trực tiếp ảnh cho AI (Nhanh & Tùy biến cao nhất)
Sử dụng các mô hình AI mạnh nhất hiện nay: **Claude 3.5 Sonnet**, **GPT-4o**, **Gemini 1.5 Pro / Antigravity**.

> 💬 **Mẫu câu lệnh (Prompt Template) chuẩn để AI viết code đẹp:**
> ```text
> Hãy quan sát kỹ bức ảnh chụp màn hình giao diện này và viết lại code HTML và CSS (hoặc Tailwind CSS) hoàn chỉnh giống hệt 100%:
> 1. Sử dụng đúng bố cục (Flexbox/Grid), tỷ lệ khoảng cách (margin, padding).
> 2. Sử dụng đúng bảng màu, độ đổ bóng (box-shadow), bo góc (border-radius) và font chữ hiện đại.
> 3. Tối ưu responsive và thêm hiệu ứng hover mượt mà cho các nút bấm / link.
> 4. Trả về toàn bộ code trong một file duy nhất để tôi có thể chạy thử nghiệm ngay.
> ```

### 2. Các công cụ AI chuyên dụng biến ảnh thành Code
* **[v0.dev](https://v0.dev/) (Của Vercel)**:
  - Tải ảnh chụp màn hình giao diện lên -> AI của Vercel sẽ tự động dựng lại giao diện bằng React + Tailwind CSS + Shadcn UI cực kỳ chuyên nghiệp.
* **[Screenshot-to-Code](https://github.com/abi/screenshot-to-code)** *(Mã nguồn mở GitHub)*:
  - Kéo thả ảnh chụp màn hình vào giao diện web -> Hệ thống AI sinh code trực tiếp (HTML/Tailwind/React/Vue) theo thời gian thực và cho xem trước kết quả bên cạnh.
* **[Locofy.ai](https://www.locofy.ai/) / [Anima](https://www.animaapp.com/)**:
  - Tự động chuyển đổi từ ảnh/file Figma thành ứng dụng Frontend production-ready.

---

## 📋 BẢNG TỔNG HỢP LỰA CHỌN CÔNG CỤ NHANH

| Mục đích nhu cầu | Công cụ khuyên dùng | Nền tảng |
| :--- | :--- | :--- |
| **Lấy nhanh 1 nút bấm / Card / Menu trên web** | `DivMagic` hoặc `CSS Peeper` | Chrome / Edge Extension |
| **Lưu trọn bộ cả trang web về máy** | `SingleFile` | Chrome / Edge Extension |
| **Biến website thành thiết kế Figma** | `html.to.design` | Figma Plugin |
| **Từ Figma xuất ra code React / Tailwind** | `Builder.io - Figma to Code` | Figma Plugin |
| **Từ 1 bức ảnh chụp màn hình -> Code** | `v0.dev` hoặc Gửi ảnh cho `Claude / GPT-4o` | Web / Chatbot AI |
| **Clone nhanh giao diện bằng mã nguồn mở** | `Screenshot-to-Code` | GitHub App |
