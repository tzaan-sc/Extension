# 🤖 Side-by-Side Dual AI Chat & Prompt Library

> **SidePanel đa nhiệm: Hỏi 1 lần nhận 2 câu trả lời song song từ nhiều mô hình AI (ChatGPT, Claude, Gemini, Perplexity) kèm kho Prompt cá nhân.**

---

## 🎯 1. Vấn đề giải quyết (Problem Statement)
Người dùng thường xuyên sử dụng AI trong công việc gặp phải:
- Muốn so sánh câu trả lời giữa các mô hình (ví dụ: ChatGPT viết văn hay hơn nhưng Claude viết code chắc chắn hơn, hoặc Gemini tìm kiếm thông tin mới hơn).
- Phải mở 2-3 tab trình duyệt khác nhau, copy-paste cùng một câu hỏi qua từng tab rất mất thời gian.
- Các câu Prompt hay dùng (dịch thuật ngữ cảnh, viết email chuyên nghiệp, tối ưu code, giải thích cho người mới) thường bị thất lạc hoặc phải tìm lại trong ghi chú.

---

## 🌟 2. Tính năng nổi bật (Core Features)

### Phase 1: MVP (Tính năng cốt lõi)
1. **Giao diện Split-View SidePanel (Chia đôi màn hình):**
   - SidePanel hiển thị song song 2 cột hoặc cho phép chuyển tab nhanh giữa 2 AI đang kết nối.
   - Không cần mở tab trình duyệt riêng biệt, có thể vừa làm việc vừa chat với AI ngay cạnh màn hình.
2. **1-Input Multi-Send (Hỏi một - Gửi hai):**
   - Chỉ cần nhập câu hỏi vào 1 ô input chung duy nhất ở chân SidePanel.
   - Nhấn `Enter` -> Tiện ích tự động đồng thời gửi câu hỏi đó đến cả 2 AI và hiển thị câu trả lời cạnh nhau để dễ dàng đối chiếu.
3. **Kho Prompt cá nhân (Quick Prompt Snippets):**
   - Lưu trữ các câu Prompt mẫu theo từng nhóm: *Lập trình*, *Học ngoại ngữ*, *Viết lách*, *Tóm tắt*.
   - Hỗ trợ biến số động (Template variables, ví dụ: `"Dịch đoạn sau sang [Ngôn ngữ]: {{text}}"`).
   - Phím tắt gọi nhanh Prompt mẫu (`/` hoặc nút bấm 1-click).
4. **1-Click Copy & So sánh:**
   - Nút copy nhanh câu trả lời của AI ưng ý nhất vào Clipboard.

### Phase 2: Nâng cao (V2)
- **Hỗ trợ cả Web Session lẫn Custom API Key:** Người dùng có thể chọn dùng phiên web miễn phí đang đăng nhập hoặc điền API Key riêng của mình để tốc độ phản hồi nhanh hơn.
- **Merge Response (Tổng hợp câu trả lời):** Tự động gộp những ý hay nhất của cả 2 bên thành một câu trả lời hoàn chỉnh.

---

## 🏗️ 3. Kiến trúc kỹ thuật (Manifest V3)

### Cấu trúc thư mục dự kiến:
```text
Dual_AI_SidePanel/
├── manifest.json
├── background/
│   └── background.js        # Quản lý SidePanel behavior & Message router
├── content/
│   ├── chatgpt_bridge.js    # Tương tác với giao diện web ChatGPT
│   ├── claude_bridge.js     # Tương tác với giao diện web Claude
│   └── gemini_bridge.js     # Tương tác với giao diện web Gemini
├── sidepanel/
│   ├── sidepanel.html       # Giao diện Dual-column chat & prompt bar
│   ├── sidepanel.css        # Responsive chia cột mượt mà
│   └── sidepanel.js         # Xử lý input chung, hiển thị tin nhắn song song
├── utils/
│   ├── prompt_manager.js    # Quản lý kho prompt mẫu trong chrome.storage
│   └── api_client.js        # Fallback gọi trực tiếp API nếu người dùng có key
└── icons/
```

### Các quyền cần thiết (`manifest.json`):
- `permissions`: `["sidePanel", "activeTab", "storage", "tabs", "scripting"]`
- `host_permissions`: `["https://chatgpt.com/*", "https://claude.ai/*", "https://gemini.google.com/*"]`

---

## 🚀 4. Lộ trình triển khai (Next Steps)
1. Xây dựng giao diện SidePanel chia 2 cột responsive (`sidepanel.html` & `sidepanel.css`).
2. Xây dựng module quản lý kho prompt mẫu với khả năng thêm/sửa/xóa và phân loại danh mục.
3. Cài đặt cơ chế gửi câu hỏi đồng thời và nhận luồng phản hồi về SidePanel.

