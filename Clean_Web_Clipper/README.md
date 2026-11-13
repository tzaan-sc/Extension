# 🛡️ Clean Web Clipper & Universal Unblocker

> **Tiện ích mở khóa chuột phải, chống cấm Copy, loại bỏ văn bản rác bản quyền và xuất nội dung bài viết sang Markdown / PDF sạch.**

---

## 🎯 1. Vấn đề giải quyết (Problem Statement)
Người dùng duyệt web hàng ngày (đọc tin tức, nghiên cứu tài liệu, đọc blog kỹ thuật, Medium...) thường gặp phải:
- Các website chặn bôi đen văn bản (`user-select: none`), vô hiệu hóa chuột phải (`contextmenu`), chặn phím tắt `Ctrl + C`.
- Bị dính các đoạn text rác tự động chèn vào Clipboard khi copy (ví dụ: *"Nguồn: https://... vui lòng dẫn nguồn khi chia sẻ"*).
- Khi copy nội dung bảng biểu, công thức toán học hoặc bài viết kỹ thuật sang Notion/Obsidian, định dạng bị vỡ vụn hoặc dính nhiều mã HTML/CSS rác.
- Giao diện bài viết ngập tràn quảng cáo, video tự phát và banner che mờ nội dung (Paywall/Blur/Login popup).

---

## 🌟 2. Tính năng nổi bật (Core Features)

### Phase 1: MVP (Tính năng cốt lõi)
1. **Force Enable Copy & Context Menu (Bẻ khóa 1-Click):**
   - Tự động cưỡng chế mở lại chuột phải và tính năng bôi đen trên toàn bộ website.
   - Gỡ bỏ thuộc tính CSS `user-select: none`, `pointer-events: none` trên toàn trang.
   - Chặn đứng các hàm JavaScript bắt sự kiện `copy`, `cut`, `selectstart`, `contextmenu` có gọi `e.preventDefault()` hoặc `return false`.
2. **Clean Clipboard Guard (Lọc rác Clipboard):**
   - Tự động chặn và loại bỏ các đoạn text bản quyền được website lén nhét vào Clipboard qua sự kiện `copy`.
   - Giữ nguyên 100% nội dung thuần mà người dùng thật sự bôi đen.
3. **Copy as Clean Markdown (Copy dạng Markdown chuẩn):**
   - Click chuột phải chọn **"Copy as Markdown"**: tự động chuyển đổi tiêu đề H1-H6, danh sách, in đậm, bảng biểu HTML (`<table>`), khối mã code (`<pre><code>`) sang cú pháp Markdown tinh gọn.
4. **Quick Reader Mode (Chế độ đọc sạch):**
   - Lọc bỏ thanh bên, menu, banner quảng cáo, chỉ hiển thị bài đọc với phông chữ đẹp mắt.

### Phase 2: Nâng cao (V2)
- **Unblur Paywall Tool:** Gỡ bỏ các lớp phủ mờ (`backdrop-filter: blur`, `opacity: 0`, lớp overlay che bài viết) để đọc tiếp nội dung ẩn.
- **Export to Clean PDF:** Xuất bài viết sang file PDF chuẩn A4, loại bỏ toàn bộ khoảng trắng thừa và quảng cáo.

---

## 🏗️ 3. Kiến trúc kỹ thuật (Manifest V3)

### Cấu trúc thư mục dự kiến:
```text
Clean_Web_Clipper/
├── manifest.json
├── background/
│   └── background.js        # Context menu (Chuột phải -> Copy as Markdown)
├── content/
│   ├── injected.js          # Chạy world "MAIN" để can thiệp sâu Event Listener
│   ├── content.js           # Bắt sự kiện bàn phím, điều khiển DOM
│   └── reader.css           # Giao diện Reader Mode tinh gọn
├── popup/
│   ├── popup.html           # Toggle các chế độ: Bẻ khóa Copy, Lọc rác, Reader
│   ├── popup.css
│   └── popup.js
├── utils/
│   ├── turndown.js          # Thư viện chuyển HTML sang Markdown siêu nhẹ
│   └── text_cleaner.js      # Thuật toán lọc các đoạn text bản quyền rác
└── icons/
```

### Các quyền cần thiết (`manifest.json`):
- `permissions`: `["contextMenus", "activeTab", "scripting", "storage", "clipboardWrite"]`
- `host_permissions`: `["<all_urls>"]`
- `content_scripts`: Chạy ở `"world": "MAIN"` và `"run_at": "document_start"` để chặn script chống copy ngay trước khi website kịp kích hoạt.

---

## 🚀 4. Lộ trình triển khai (Next Steps)
1. Viết `injected.js` can thiệp vào `EventTarget.prototype.addEventListener` để vô hiệu hóa script chặn copy.
2. Thiết kế Popup đơn giản với công tắc: **Bật/Tắt chống chặn copy** và **Tự động làm sạch Clipboard**.
3. Tích hợp `turndown.js` để xử lý tính năng "Copy as Markdown" qua Context Menu.

