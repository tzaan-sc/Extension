## Facebook Activity Scanner

Đây là một Chrome Extension tập trung vào việc **thu thập và tổng hợp hoạt động công khai của một tài khoản Facebook**.

Người dùng bắt đầu bằng cách **nhập đường dẫn (URL) của một tài khoản Facebook**. Extension sẽ xác định tài khoản tương ứng và lấy **Facebook User ID** làm thông tin định danh chính. Sau khi xác định được User ID, hệ thống bắt đầu quá trình quét các nội dung công khai có liên quan đến tài khoản đó.

Điểm quan trọng là extension **không chỉ quét những nội dung nằm trực tiếp trên trang cá nhân của người đó**. Nếu một bài viết ở trang cá nhân khác, Page hoặc khu vực Facebook khác là nội dung công khai và có hoạt động liên quan đến tài khoản cần quét, hệ thống sẽ cố gắng thu thập nội dung đó trong phạm vi dữ liệu mà người dùng có quyền truy cập.

Các hoạt động được phân loại thành từng nhóm riêng, chẳng hạn:

* **Bình luận:** toàn bộ bình luận của tài khoản được tìm thấy trong các nội dung công khai.
* **Bài viết được gắn thẻ:** các bài viết mà tài khoản được tag.
* **Được nhắc tên:** các nội dung có mention tài khoản.
* **Ảnh được gắn thẻ:** các hình ảnh công khai có tài khoản được tag.
* **Video được gắn thẻ:** các video công khai có tài khoản được tag.
* **Các loại hoạt động công khai khác** có thể được bổ sung về sau.

Dữ liệu sau khi thu thập sẽ được **phân loại theo loại hoạt động trước**, sau đó mới **sắp xếp theo thời gian**. Ví dụ:

```text
Nguyễn A
│
├── 💬 Bình luận
│   ├── 2026
│   ├── 2025
│   ├── 2024
│   └── ...
│
├── 🏷️ Bài viết được gắn thẻ
│   ├── 2026
│   ├── 2025
│   └── ...
│
├── @ Được nhắc tên
│   ├── 2026
│   ├── 2025
│   └── ...
│
├── 📸 Ảnh được gắn thẻ
│   ├── 2026
│   ├── 2025
│   └── ...
│
└── 🎥 Video được gắn thẻ
    ├── 2026
    └── ...
```

Ví dụ, nếu tài khoản Nguyễn A từng bình luận vào một bài viết công khai của Nguyễn B từ năm 2022, dù bài viết đó **không nằm trên trang cá nhân của Nguyễn A**, hệ thống vẫn hướng tới việc tìm và lưu lại hoạt động đó:

```text
💬 BÌNH LUẬN CỦA NGUYỄN A

15/08/2022
Bài viết của Nguyễn B
"Nội dung bài viết..."

Bình luận:
"......"

🔗 Link bài viết
```

Mục tiêu của extension là biến những hoạt động công khai liên quan đến một tài khoản thành một **hồ sơ hoạt động có cấu trúc**, giúp người dùng dễ dàng xem lại lịch sử theo từng loại hoạt động và theo thời gian, thay vì phải tự tìm kiếm thủ công trên Facebook.

### Luồng hoạt động tổng quát

```text
Nhập Facebook Profile URL
          ↓
Xác định tài khoản
          ↓
Lấy / xác định Facebook User ID
          ↓
Bắt đầu quét
          ↓
Tìm các nội dung công khai liên quan
          ↓
Thu thập hoạt động
          ↓
Phân loại hoạt động
          ↓
Sắp xếp theo thời gian
          ↓
Lưu dữ liệu
          ↓
Hiển thị thành hồ sơ hoạt động
```

Extension chỉ nên thu thập **dữ liệu mà Facebook đang hiển thị và tài khoản người dùng có quyền truy cập**, không vượt qua quyền riêng tư hoặc các cơ chế bảo vệ của Facebook. Vì Facebook có thể giới hạn khả năng tìm kiếm, phân trang hoặc hiển thị dữ liệu, hệ thống nên được hiểu là công cụ **thu thập tối đa dữ liệu công khai có thể truy cập**, thay vì cam kết có thể lấy tuyệt đối mọi dữ liệu từng tồn tại trên Facebook.
