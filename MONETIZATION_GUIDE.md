# 💰 HƯỚNG DẪN KIẾM TIỀN & ĐẶT QUẢNG CÁO TRÊN CHROME EXTENSION

Tài liệu này tổng hợp chi tiết **cơ chế, các hình thức quảng cáo, cách thức tích hợp và cách rút tiền về tài khoản ngân hàng** dành cho tiện ích mở rộng **Shadowing & Dictation**.

---

## 📌 MỤC LỤC
1. [Bản chất & Cơ chế hoạt động](#1-bản-chất--cơ-chế-hoạt-động)
2. [3 Hình thức quảng cáo kiếm tiền thực tế](#2-3-hình-thức-quảng-cáo-kiếm-tiền-thực-tế)
   - [Cách 1: Mạng quảng cáo tự động (Ad Networks)](#cách-1-mạng-quảng-cáo-tự-động-ad-networks)
   - [Cách 2: Tiếp thị liên kết (Affiliate Marketing)](#cách-2-tiếp-thị-liên-kết-affiliate-marketing)
   - [Cách 3: Bán vị trí tài trợ trực tiếp (Direct Sponsorship)](#cách-3-bán-vị-trí-tài-trợ-trực-tiếp-direct-sponsorship)
3. [Mã nguồn mẫu chèn Banner vào SidePanel](#3-mã-nguồn-mẫu-chèn-banner-vào-sidepanel)
4. [Các mạng quảng cáo & Nền tảng Affiliate uy tín](#4-các-mạng-quảng-cáo--nền-tảng-affiliate-uy-tín)
5. [Quy định của Google Chrome Web Store cần tuân thủ](#5-quy-định-của-google-chrome-web-store-cần-tuân-thủ)
6. [Lộ trình triển khai tối ưu thu nhập](#6-lộ-trình-triển-khai-tối-ưu-thu-nhập)

---

## 1. BẢN CHẤT & CƠ CHẾ HOẠT ĐỘNG

- Giao diện **SidePanel** (`sidepanel.html`) của tiện ích thực chất là một **Trang Web thu nhỏ** chạy dọc bên phải trình duyệt.
- Mọi công nghệ hiển thị trên web (HTML, CSS, JavaScript, hình ảnh, iframe quảng cáo) đều hoạt động được trên SidePanel.
- **Dòng tiền sinh ra từ đâu?**
  - **Lượt hiển thị (CPM - Cost Per Mille)**: Mỗi khi người dùng mở SidePanel lên học, banner quảng cáo được tải ➜ Bạn nhận tiền tính trên mỗi 1.000 lượt xem.
  - **Lượt nhấp (CPC - Cost Per Click)**: Khi người dùng bấm vào banner xem sản phẩm.
  - **Lượt mua hàng (CPA - Cost Per Action / Affiliate)**: Khi người dùng bấm qua banner và mua tài khoản học tiếng Anh / sách.
  - **Hợp đồng cố định theo tháng (Sponsorship)**: Trung tâm tiếng Anh trả tiền định kỳ để hiển thị logo.

---

## 2. 3 HÌNH THỨC QUẢNG CÁO KIẾM TIỀN THỰC TẾ

### CÁCH 1: Mạng quảng cáo tự động (Ad Networks)
- **Cách hoạt động**:
  1. Bạn đăng ký tài khoản tại mạng quảng cáo (như *EthicalAds, Carbon Ads, Monetag, Adsterra*).
  2. Họ cấp cho bạn một đoạn mã HTML/Iframe (kích thước chuẩn `300x100` hoặc `300x50` pixel).
  3. Bạn dán đoạn mã này vào chân trang `sidepanel.html`.
  4. Mạng quảng cáo sẽ tự động phân phối các nhãn hàng phù hợp hiển thị lên tiện ích.
- **Hình thức thanh toán**:
  - Tiền được cộng dồn theo ngày/tháng trên bảng điều khiển (Dashboard).
  - Rút tiền qua **Chuyển khoản Ngân hàng (Bank Wire Transfer)** hoặc **PayPal / USDT**.

---

### CÁCH 2: Tiếp thị liên kết (Affiliate Marketing) - *Phù hợp nhất với app học tiếng Anh*
- **Cách hoạt động**:
  1. Bạn đăng ký làm đại lý tiếp thị liên kết cho các sản phẩm giáo dục:
     - Ứng dụng luyện phát âm AI: **ELSA Speak** (Hoa hồng ~20% - 35% / đơn).
     - Nền tảng học 1-kèm-1 với người bản xứ: **Cambly** (Hoa hồng ~$15 - $25 / lượt đăng ký).
     - Khóa học IELTS/TOEIC online: **Prep, Unica, Zim**.
     - Sách học tiếng Anh trên **Shopee / Tiki / Ecomobi**.
  2. Bạn tự thiết kế 1 hình ảnh banner bắt mắt đặt dưới chân SidePanel:
     > *"🔥 Ưu đãi độc quyền: Giảm 85% tài khoản ELSA Pro trọn đời cho người dùng Shadow & Dictate"*
  3. Gắn đường link tiếp thị (Affiliate Link) vào banner.
- **Tiềm năng thu nhập**:
  - Chỉ cần mỗi ngày có 1 – 3 người mua qua link của bạn, bạn đã có thể tạo thu nhập **từ 100.000đ đến 500.000đ / ngày** hoàn toàn thụ động.

---

### CÁCH 3: Bán vị trí tài trợ trực tiếp (Direct Sponsorship) - *Thu nhập cao nhất*
- **Cách hoạt động**:
  - Khi tiện ích của bạn đạt từ **2.000 đến 10.000 người dùng thường xuyên (DAU)**.
  - Bạn gửi email / nhắn tin ngỏ lời hợp tác tới các **Trung tâm tiếng Anh, CLB luyện thi IELTS, các giáo viên dạy tiếng Anh online**:
    > *"Chào bạn, tiện ích Shadow & Dictate hiện có hơn 5.000 học viên luyện nghe tiếng Anh mỗi ngày. Bên mình có vị trí banner tài trợ độc quyền dưới chân thanh học bài với chi phí 2.000.000đ – 4.000.000đ / tháng."*
- **Hình thức thanh toán**:
  - Đối tác chuyển khoản trực tiếp vào tài khoản ngân hàng của bạn mỗi đầu tháng. Bạn chỉ cần gắn ảnh logo và link website của họ vào SidePanel.

---

## 3. MÃ NGUỒN MẪU CHÈN BANNER VÀO SIDEPANEL

Dưới đây là đoạn code chuẩn giao diện Dark Mode để bạn chèn banner vào `sidepanel.html` và `sidepanel.css`:

### 📄 Chèn vào [sidepanel/sidepanel.html](file:///d:/GIT/Extension/YouTube%20Shadowing%20&%20Dictation/sidepanel/sidepanel.html) (Đặt trước thẻ `</main>`):

```html
<!-- Khung Banner Quảng Cáo / Tài Trợ -->
<div class="sponsor-banner-card">
  <div class="sponsor-badge">
    <span>Tài trợ</span>
  </div>
  <a href="https://your-affiliate-link-here.com" target="_blank" class="sponsor-link" rel="noopener noreferrer">
    <div class="sponsor-content">
      <div class="sponsor-icon">🎁</div>
      <div class="sponsor-info">
        <div class="sponsor-title">Giảm 85% ELSA Pro Trọn Đời</div>
        <div class="sponsor-desc">Luyện phát âm AI chuẩn bản xứ cùng video</div>
      </div>
      <button class="sponsor-btn">Nhận ngay</button>
    </div>
  </a>
</div>
```

### 🎨 Chèn vào [sidepanel/sidepanel.css](file:///d:/GIT/Extension/YouTube%20Shadowing%20&%20Dictation/sidepanel/sidepanel.css):

```css
/* Khung Banner Quảng cáo / Tài trợ */
.sponsor-banner-card {
  position: relative;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(236, 72, 153, 0.12) 100%);
  border: 1px dashed rgba(99, 102, 241, 0.4);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  margin-top: 8px;
  transition: all 0.2s ease;
}

.sponsor-banner-card:hover {
  border-color: var(--primary);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%);
}

.sponsor-badge {
  position: absolute;
  top: -8px;
  right: 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 9px;
  color: var(--text-muted);
  text-transform: uppercase;
}

.sponsor-link {
  text-decoration: none;
  display: block;
}

.sponsor-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sponsor-icon {
  font-size: 20px;
}

.sponsor-info {
  flex: 1;
}

.sponsor-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
}

.sponsor-desc {
  font-size: 10.5px;
  color: var(--text-secondary);
  line-height: 1.3;
}

.sponsor-btn {
  background: var(--primary-gradient);
  border: none;
  color: white;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
```

---

## 4. CÁC MẠNG QUẢNG CÁO & NỀN TẢNG AFFILIATE UY TÍN

| Tên nền tảng | Loại hình | Ngưỡng thanh toán | Phù hợp |
| :--- | :--- | :--- | :--- |
| **EthicalAds** | Mạng quảng cáo chuyên lập trình & tiện ích | $50 qua PayPal/Bank | Banner sạch, không rác |
| **Carbon Ads** | Mạng quảng cáo chuyên ứng dụng & công cụ | $50 qua PayPal | Cao cấp, nhãn hàng lớn |
| **Accesstrade VN** | Nền tảng tiếp thị liên kết số 1 VN | 200.000đ về Bank | Khóa học ELSA, Unica, sách Shopee/Tiki |
| **Ecomobi / Shopee Affiliate** | Tiếp thị liên kết TMĐT | 200.000đ về Bank | Sách học từ vựng IELTS, tai nghe luyện nghe |

---

## 5. QUY ĐỊNH CỦA GOOGLE CHROME WEB STORE CẦN TUÂN THỦ

Google hoàn toàn cho phép bạn kiếm tiền từ quảng cáo trong tiện ích, nhưng bạn cần tuân theo **3 quy tắc vàng** sau để không bị gỡ tiện ích:

1. **Gắn nhãn rõ ràng**: Luôn có chữ *"Tài trợ" / "Ad" / "Quảng cáo"* ở góc banner.
2. **Không làm phiền trải nghiệm học**: Tuyệt đối không dùng popup tự động nhảy tab mới (pop-under) gây khó chịu cho người dùng.
3. **Không chèn quảng cáo đè lên video YouTube**: Chỉ hiển thị bên trong khung giao diện SidePanel của riêng bạn.

---

## 6. LỘ TRÌNH TRIỂN KHAI TỐI ƯU THU NHẬP

1. **Tháng đầu tiên (Giai đoạn tăng trưởng)**:
   - Đăng tiện ích lên Chrome Web Store.
   - Chia sẻ vào các group học tiếng Anh, IELTS, TOEIC.
   - Tập trung mang lại trải nghiệm học mượt mà để lấy đánh giá 5 sao ⭐⭐⭐⭐⭐.
2. **Khi đạt 1.000 người dùng**:
   - Gắn 1 banner Affiliate ưu đãi khóa học/app tiếng Anh (ELSA, Cambly, sách).
   - Thêm nút *"☕ Mua tặng tác giả ly cà phê"* (Ủng hộ MoMo / BuyMeACoffee).
3. **Khi đạt trên 5.000 người dùng**:
   - Chủ động liên hệ 2 – 3 trung tâm tiếng Anh để nhận tài trợ độc quyền theo tháng (tạo thu nhập cố định 3 – 8 triệu/tháng).
