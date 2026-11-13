# 🎬 Smart Video Note & Anki/Notion Clipper

> **Tiện ích SidePanel ghi chú thông minh kèm mốc thời gian, chụp frame video 1-click và xuất sang Anki / Notion / Markdown.**

---

## 🎯 1. Vấn đề giải quyết (Problem Statement)
Khi học tập hoặc xem bài giảng chuyên sâu trên **YouTube, Coursera, Udemy, TED...**, người xem gặp rất nhiều bất tiện:
- Phải tạm dừng video liên tục, chuyển qua tab khác (Word, Notion, Obsidian) để chép bài.
- Ghi chú không có mốc thời gian (timestamp) hoặc phải tự gõ thủ công (`05:23`), rất mất thời gian khi muốn xem lại đúng đoạn cần học.
- Muốn lưu lại sơ đồ/code trên màn hình video phải chụp màn hình thủ công, lưu file rồi chèn ảnh vào ghi chú.
- Thiếu công cụ tạo nhanh thẻ nhớ ôn tập (Flashcard) dạng ngắt quãng (Spaced Repetition) cho Anki.

---

## 🌟 2. Tính năng nổi bật (Core Features)

### Phase 1: MVP (Tính năng cốt lõi)
1. **Quick Timestamp Note (Phím tắt `Alt + N`):**
   - Đang xem video, nhấn phím là SidePanel tự động thêm 1 dòng ghi chú gắn sẵn mốc thời gian chính xác của video.
   - Bấm vào mốc thời gian trên SidePanel -> Video tự động tua tới đúng giây đó.
2. **1-Click Video Frame Screenshot:**
   - Nhấn 1 nút (hoặc phím tắt) -> Tiện ích dùng Canvas API chụp nét khung hình hiện tại của `<video>` và chèn ảnh thu nhỏ vào dòng ghi chú.
3. **Capture Current Subtitle Sentence:**
   - Lấy câu phụ đề đang phát đưa vào ghi chú chỉ với 1 click (không cần gõ lại lời giảng viên).
4. **Trình soạn thảo Markdown tinh gọn:**
   - Hỗ trợ định dạng in đậm, in nghiêng, danh sách việc cần làm (Todo list), code block.
5. **Xuất file linh hoạt:**
   - Xuất toàn bộ buổi học thành file `.md` (Markdown) hoặc `.pdf`.
   - Xuất file `.csv` định dạng chuẩn Anki (Front: Câu hỏi / Timecode / Ảnh, Back: Nội dung ghi chú).

### Phase 2: Nâng cao (V2)
- **Tích hợp Notion API:** 1-Click đẩy ghi chú lên Database Notion của người dùng.
- **Tóm tắt đoạn video bằng AI (AI Video Chunk Summary):** Tóm tắt nội dung 5-10 phút bài giảng dựa trên phụ đề.

---

## 🏗️ 3. Kiến trúc kỹ thuật (Manifest V3)

### Cấu trúc thư mục dự kiến:
```text
Video_Note_Clipper/
├── manifest.json
├── background/
│   └── background.js        # Điều phối SidePanel & quản lý tab video
├── content/
│   ├── content.js           # Bắt video time, tua video, chụp canvas frame
│   └── injected.js          # Trích xuất caption / player info nếu cần
├── sidepanel/
│   ├── sidepanel.html       # Giao diện danh sách ghi chú & editor
│   ├── sidepanel.css        # Giao diện hiện đại, tối ưu màn hình hẹp
│   └── sidepanel.js         # Quản lý danh sách ghi chú, tìm kiếm, xuất file
├── utils/
│   ├── anki_exporter.js     # Chuyển đổi dữ liệu sang định dạng thẻ Anki
│   └── markdown_parser.js   # Hỗ trợ render và xuất Markdown
└── icons/
```

### Các quyền cần thiết (`manifest.json`):
- `permissions`: `["sidePanel", "activeTab", "storage", "tabs", "scripting"]`
- `host_permissions`: `["*://*.youtube.com/*", "*://*.coursera.org/*", "*://*.udemy.com/*"]`

---

## 🚀 4. Lộ trình triển khai (Next Steps)
1. Thiết kế `manifest.json` và giao diện SidePanel tối giản (input ghi chú + danh sách note theo timecode).
2. Viết Content Script tương tác với thẻ `<video>`: lấy `currentTime`, gọi `seek`, và chụp ảnh frame bằng `canvas.getContext('2d').drawImage(video, 0, 0)`.
3. Lưu trữ ghi chú theo từng Video ID vào `chrome.storage.local`.
4. Xây dựng chức năng xuất Markdown và CSV Anki.

