# 🚀 Lộ Trình Phát Triển: Facebook Activity Scanner (Chrome Extension)

Tài liệu này chi tiết hóa toàn bộ các đầu việc (TODO) cần triển khai từ thiết kế kiến trúc, thu thập dữ liệu Facebook, lưu trữ cục bộ đến giao diện hiển thị cây phân cấp.

---

## 📁 Cấu Trúc Thư Mục Đề Xuất (Manifest V3)

```text
FB/
├── manifest.json            # Cấu hình Chrome Extension (MV3 + Side Panel)
├── icons/                   # Bộ icon kích thước 16, 48, 128
├── sidepanel/               # Giao diện chính (Side Panel)
│   ├── sidepanel.html       # Khung giao diện điều khiển & Timeline
│   ├── sidepanel.css        # Giao diện hiện đại (Dark/Light mode, Tree view)
│   └── sidepanel.js         # Logic render, bộ lọc tìm kiếm & xuất báo cáo
├── background/
│   └── service_worker.js    # Quản lý vòng đời extension & điều phối thông điệp
├── content/
│   ├── scraper.js           # Content Script tương tác với tab Facebook
│   └── injector.js          # Injected script vào main world để hook GraphQL/fetch
├── utils/
│   ├── fb_api.js            # Module xử lý lấy UID, gọi GraphQL/Search endpoint
│   ├── parser.js            # Chuẩn hóa dữ liệu thô thành format Profile Activity
│   └── storage.js           # Quản lý IndexedDB (Lưu trữ profile không giới hạn)
├── TODO.md                  # Danh sách công việc theo dõi tiến độ
└── readme.md                # Tài liệu mô tả ý tưởng
```

---

## 📋 Danh Sách Việc Cần Làm (Checklist)

### 🔹 Giai đoạn 1: Khởi tạo Kiến trúc & Nền tảng Extension
- [x] **1.1. Thiết lập `manifest.json` (Manifest V3)**
  - Khai báo quyền: `"sidePanel"`, `"storage"`, `"unlimitedStorage"`, `"cookies"`, `"activeTab"`.
  - Khai báo host permissions: `*://*.facebook.com/*`.
  - Cấu hình `side_panel` mở giao diện `sidepanel/sidepanel.html`.
- [x] **1.2. Xây dựng Module Lưu Trữ `utils/storage.js` (IndexedDB)**
  - Thiết kế Schema lưu trữ theo cấu trúc:
    - Table `profiles`: `{ uid, name, username, avatarUrl, lastScannedAt }`
    - Table `activities`: `{ id, targetUid, type, year, timestamp, postUrl, authorName, authorUrl, content, extraData }`
  - Các hàm tiện ích: `saveProfile()`, `saveActivities()`, `getActivitiesTree(uid)`, `deleteProfile(uid)`.

---

### 🔹 Giai đoạn 2: Lõi Thu Thập Dữ Liệu Facebook (Core Scraping Engine)
- [x] **2.1. Module Xác định Target & Lấy UID (`utils/fb_api.js`)**
  - Xử lý link nhập vào: `facebook.com/username`, `profile.php?id=123...`, hoặc link bài viết.
  - Cơ chế bóc tách UID từ HTML header/meta & URL parameters.
- [x] **2.2. Thu thập Ảnh & Video được gắn thẻ (Tagged Photos/Videos)**
  - Quét danh sách `facebook.com/{UID}/photos_of` và `facebook.com/{UID}/videos_of`.
  - Bóc tách: Thumbnail, ngày đăng, liên kết bài viết, người đăng.
- [x] **2.3. Thu thập Bài viết được gắn thẻ & Nhắc tên (Tagged Posts / Mentions)**
  - Sử dụng Search Filters query endpoint theo UID.
  - Phân trang tuần tự để lấy nội dung bài viết gốc, thời gian, caption.
- [x] **2.4. Thu thập Lịch sử Bình luận (Comments)**
  - Lọc các bài viết/bình luận công khai mà target UID đã tương tác.
  - Trích xuất: Nội dung bình luận, ngày giờ, bài viết đích, người tạo bài viết.
- [x] **2.5. Cơ chế An toàn & Kiểm soát tốc độ (Anti-Checkpoint / Rate Limiting)**
  - Tích hợp Human-like delay (ngẫu nhiên 1.5 - 3s giữa mỗi đợt fetch).
  - Nút **Tạm dừng (Pause)** / **Tiếp tục (Resume)** / **Dừng (Stop)** khi đang quét.

---

### 🔹 Giai đoạn 3: Xây dựng Giao diện Side Panel & Hiển thị Dữ liệu
- [ ] **3.1. Thiết kế Form Quét & Thanh Trạng Thái (`sidepanel.html` + `sidepanel.css`)**
  - Ô nhập Facebook Profile URL + Nút "Bắt đầu quét".
  - Hiển thị thông tin Target (Avatar, Tên, UID) sau khi nhận diện.
  - Thanh tiến trình (Progress Bar), bộ đếm số lượng hoạt động tìm thấy theo thời gian thực.
- [ ] **3.2. Xây dựng Cây Thư Mục Hoạt Động (Interactive Activity Tree View)**
  - Phân nhóm 1: **Loại hoạt động** (💬 Bình luận, 🏷️ Bài viết gắn thẻ, @ Nhắc tên, 📸 Ảnh, 🎥 Video).
  - Phân nhóm 2: **Năm** (2026, 2025, 2024...).
  - Thẻ hiển thị chi tiết (Card Item): Có preview nội dung, thời gian rõ ràng, nút click nhảy thẳng tới link gốc trên Facebook.
- [ ] **3.3. Tính năng Tìm kiếm & Lọc nội bộ (In-app Search & Filter)**
  - Tìm kiếm nhanh từ khóa trong các bình luận/bài viết đã quét.
  - Lọc theo khoảng năm hoặc theo loại hành động.

---

### 🔹 Giai đoạn 4: Tính năng Nâng cao & Xuất Dữ liệu (Export)
- [ ] **4.1. Xuất Dữ liệu Đa Định dạng**
  - Xuất file **JSON** (lưu trữ/sao lưu).
  - Xuất file **Excel/CSV** (phân tích bảng tính).
  - Xuất file **Báo cáo HTML tương tác offline** (xem lại cây hoạt động mà không cần mở extension).
- [ ] **4.2. Quản lý Lịch sử Quét (Multi-Profile Management)**
  - Lưu danh sách các Profile đã từng quét để mở xem lại bất kỳ lúc nào mà không cần quét lại từ đầu.
  - Nút "Quét cập nhật" (quét thêm dữ liệu mới phát sinh).

---

## 🛠️ Hướng Dẫn Bắt Đầu Từng Bước

1. **Bước 1:** Bắt đầu tạo khung sườn với `manifest.json` và giao diện Side Panel cơ bản.
2. **Bước 2:** Xây dựng hàm phân giải Facebook URL $\rightarrow$ UID và module lưu trữ IndexedDB.
3. **Bước 3:** Lần lượt kết nối các module quét (bắt đầu với Tagged Photos/Videos $\rightarrow$ Tagged Posts $\rightarrow$ Comments).
4. **Bước 4:** Load extension vào Chrome (`chrome://extensions` $\rightarrow$ bật *Developer mode* $\rightarrow$ *Load unpacked*) và tiến hành kiểm thử thực tế trên tab Facebook.
