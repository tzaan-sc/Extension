# 🔍 Lens OCR - Quét Ảnh Sang Chữ (Google Lens Style)

Extension Google Chrome thông minh cho phép bạn **chụp màn hình, khoanh vùng văn bản bất kỳ, hoặc tải/dán ảnh** để trích xuất văn bản và tương tác như **Google Lens**.

---

## 🌟 Điểm nổi bật & Tính năng

1. **Giao diện trực quan chuẩn phong cách Google Lens**:
   - Tự động phát hiện vị trí các từ/dòng chữ trong ảnh và **vẽ các khối hộp tương tác đè lên ảnh** (Overlay Bounding Boxes).
   - Cho phép nhấp chọn/bôi đen từng từ, cụm từ hoặc quét toàn bộ chữ.
   - Thanh công cụ nổi thông minh (Floating Bar) khi chọn từ: **Copy nhanh, Dịch (Google Translate), Nghe đọc (Text-to-Speech), Tìm kiếm trên Google**.

2. **Chụp quét linh hoạt (Snipping Area)**:
   - Khoanh vùng chụp bất kỳ khu vực nào trên trang web hiện tại (kéo thả chuột trực tiếp trên màn hình).
   - Tự động bù trừ độ phân giải màn hình Retina/High-DPI để cho ra ảnh rõ nét nhất.

3. **Hỗ trợ Dán ảnh (Ctrl + V) & Tải file ảnh**:
   - Hỗ trợ dán trực tiếp ảnh từ bộ nhớ tạm (Clipboard `Ctrl + V`).
   - Kéo thả file ảnh hoặc tải ảnh từ máy tính lên.
   - Menu chuột phải tiện lợi: Nhấp chuột phải vào bất kỳ ảnh nào trên mạng -> Chọn **"🔍 Quét chữ từ hình ảnh này"**.

4. **Hỗ trợ 2 chế độ nhận diện (Kép)**:
   - **Mặc định / 100% Offline**: Sử dụng **Tesseract.js** chạy trực tiếp trong trình duyệt, bảo mật thông tin, không cần API Key, hỗ trợ song ngữ **Tiếng Việt + Tiếng Anh**.
   - **Tích hợp Cloud AI**: Tùy chọn cấu hình nhập API Key trong phần cài đặt nếu muốn độ chuẩn xác siêu cao:
     - *Google Cloud Vision API*
     - *Gemini 1.5 Flash Vision (Google AI Studio)*
     - *OCR.Space API*

---

## 🛠️ Hướng dẫn cài đặt vào trình duyệt Chrome / Cốc Cốc / Edge

1. Mở trình duyệt Chrome và truy cập: `chrome://extensions/`
2. Bật công tắc **"Chế độ dành cho nhà phát triển" (Developer mode)** ở góc trên bên phải.
3. Bấm vào nút **"Tải tiện ích đã giải nén" (Load unpacked)**.
4. Chọn thư mục:
   ```
   D:\GIT\Extension\Parse_Image_to_Text
   ```
5. Tiện ích **Lens OCR** sẽ xuất hiện trên thanh công cụ của bạn. Bạn nên ghim (Pin 📌) biểu tượng ra ngoài để sử dụng nhanh bất kỳ lúc nào!

---

## 🚀 Cách sử dụng

### Cách 1: Khoanh vùng chụp quét trên màn hình
1. Bấm vào biểu tượng extension trên thanh công cụ.
2. Bấm nút **"🎯 Khoanh vùng quét chữ"**.
3. Kéo chuột khoanh vùng có chứa chữ trên màn hình rồi thả tay ra.
4. Giao diện **Lens OCR Studio** sẽ mở ra, quét chữ và hiển thị các hộp từ đè lên ảnh kèm văn bản bên thanh điều khiển phải.

### Cách 2: Quét từ ảnh trên mạng
- Nhấp chuột phải vào bất kỳ hình ảnh nào trên trang web -> Chọn **"🔍 Quét chữ từ hình ảnh này"**.

### Cách 3: Dán ảnh hoặc kéo thả file
- Bấm vào biểu tượng extension -> Nhấn `Ctrl + V` để dán ảnh vừa chụp hoặc kéo thả ảnh vào khung.

---

## ⚙️ Cấu hình API Nâng cao (Tùy chọn)
- Bấm vào biểu tượng bánh răng **⚙️** ở góc trên Popup.
- Chọn bộ nhận diện mong muốn (Tesseract.js Offline, Google Vision, Gemini 1.5 Flash hoặc OCR.Space) và điền API Key tương ứng.
- Bấm **"Lưu cấu hình"**.
