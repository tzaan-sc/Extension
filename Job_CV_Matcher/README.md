# 💼 Job Hunter & CV Keyword Matcher

> **Trợ lý SidePanel thông minh: Tự động so khớp hồ sơ CV với tin tuyển dụng (LinkedIn, TopCV, Upwork...), chấm điểm % độ khớp và chỉ ra từ khóa còn thiếu.**

---

## 🎯 1. Vấn đề giải quyết (Problem Statement)
Người tìm việc (Sinh viên, Lập trình viên, Freelancer...) khi nộp hồ sơ xin việc gặp khó khăn:
- Không biết CV hiện tại của mình có "qua cửa" hệ thống lọc tự động (ATS - Applicant Tracking System) hay không.
- Đọc Job Description (JD) dài dằng dặc, dễ bỏ sót các yêu cầu then chốt (kỹ năng bắt buộc, chứng chỉ, công nghệ).
- Phải tự sửa CV hoặc viết lại Cover Letter thủ công cho từng vị trí ứng tuyển rất tốn thời gian.

---

## 🌟 2. Tính năng nổi bật (Core Features)

### Phase 1: MVP (Tính năng cốt lõi)
1. **Lưu trữ hồ sơ CV cá nhân (Local CV Profile):**
   - Lưu trữ an toàn kỹ năng cứng, kỹ năng mềm, các công nghệ/ngôn ngữ lập trình, kinh nghiệm của bạn ngay trong bộ nhớ trình duyệt (`chrome.storage.local`).
   - Có thể dán nội dung CV dạng text hoặc tải file PDF lên để extension tự trích xuất từ khóa.
2. **1-Click Scan JD trên tab tuyển dụng:**
   - Hỗ trợ các nền tảng phổ biến: **LinkedIn, TopCV, VietnamWorks, Upwork, ITviec, Indeed...**
   - Tự động bóc tách các thông tin then chốt: Vị trí, Mức lương, Kỹ năng bắt buộc (Must-have), Kỹ năng ưu tiên (Nice-to-have), Năm kinh nghiệm.
3. **Chấm điểm độ khớp (% Match Score):**
   - 🟩 **Kỹ năng đã khớp:** Những điểm mạnh bạn đã ghi trong CV và JD cũng yêu cầu.
   - 🟥 **Kỹ năng còn thiếu (Missing Keywords):** Những từ khóa quan trọng trong JD mà CV của bạn chưa có (để bạn bổ sung kịp thời trước khi nộp).
   - 🟨 **Điểm cộng tiềm năng:** Các kỹ năng liên quan giúp nâng cao cơ hội phỏng vấn.
4. **Trình tạo dàn ý Cover Letter nhanh:**
   - Dựa trên tên công ty, vị trí ứng tuyển và kỹ năng bạn có, tiện ích tự động tạo 1 bức thư ứng tuyển (Cover Letter) chuẩn chỉnh, cá nhân hóa.

### Phase 2: Nâng cao (V2)
- **Job Application Tracker (Bảng theo dõi đơn tuyển dụng):** Lưu lại danh sách các công ty đã nộp đơn, ngày nộp, trạng thái (Chờ phản hồi / Phỏng vấn / Đậu).
- **AI Bullet Point Improver:** Gợi ý cách viết lại câu mô tả dự án trong CV sao cho ấn tượng hơn theo mô hình STAR (Situation - Task - Action - Result).

---

## 🏗️ 3. Kiến trúc kỹ thuật (Manifest V3)

### Cấu trúc thư mục dự kiến:
```text
Job_CV_Matcher/
├── manifest.json
├── background/
│   └── background.js        # Điều phối SidePanel khi mở trang tuyển dụng
├── content/
│   ├── content.js           # Bắt URL & điều phối parser
│   └── parsers/
│       ├── linkedin.js      # Parser trích xuất JD LinkedIn
│       ├── topcv.js         # Parser trích xuất JD TopCV
│       ├── upwork.js        # Parser trích xuất việc làm Upwork
│       └── generic.js       # Parser dự phòng cho mọi trang tuyển dụng
├── sidepanel/
│   ├── sidepanel.html       # Giao diện hồ sơ CV & kết quả so khớp
│   ├── sidepanel.css
│   └── sidepanel.js         # Tính toán % match score, render từ khóa
├── utils/
│   ├── keyword_extractor.js # Trích xuất kỹ năng công nghệ (Tech Stack, Tools)
│   └── diff_matcher.js      # Thuật toán so khớp từ khóa và n-gram
└── icons/
```

### Các quyền cần thiết (`manifest.json`):
- `permissions`: `["sidePanel", "activeTab", "storage", "tabs", "scripting"]`
- `host_permissions`: `["*://*.linkedin.com/*", "*://*.topcv.vn/*", "*://*.upwork.com/*", "*://*.itviec.com/*", "*://*.vietnamworks.com/*"]`

---

## 🚀 4. Lộ trình triển khai (Next Steps)
1. Xây dựng giao diện SidePanel lưu trữ hồ sơ CV dạng Tags (Kỹ năng: React, Node.js, Python, Docker...).
2. Viết parser DOM mẫu cho LinkedIn và TopCV để lấy khối văn bản Job Description.
3. Cài đặt thuật toán đối sánh từ khóa (`diff_matcher.js`) để tính toán % độ phù hợp.

