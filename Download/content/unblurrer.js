// OmniLoader - Document Unblur & Paywall Remover
// Tự động gỡ bỏ lớp làm mờ, popup chặn đăng nhập và mở khóa nội dung ẩn trên web tài liệu

export class DocumentUnblurrer {
  // 1. Gỡ bỏ CSS làm mờ (Blur) và các thuộc tính ẩn nội dung
  static unblurAllElements() {
    let unblurredCount = 0;

    // Tìm tất cả các phần tử bị làm mờ bằng CSS Filter
    const allElements = document.querySelectorAll('*');
    allElements.forEach((el) => {
      const style = window.getComputedStyle(el);
      if (style.filter && style.filter.includes('blur')) {
        el.style.setProperty('filter', 'none', 'important');
        el.style.setProperty('-webkit-filter', 'none', 'important');
        unblurredCount++;
      }
      if (style.userSelect === 'none') {
        el.style.setProperty('user-select', 'text', 'important');
        el.style.setProperty('-webkit-user-select', 'text', 'important');
      }
    });

    // 2. Gỡ bỏ các popup / overlay che chắn màn hình yêu cầu đăng nhập
    const paywallSelectors = [
      '.paywall_overlay',
      '.blurred-page-overlay',
      '.paywall-wrapper',
      '.login-wall',
      '.modal-backdrop',
      '.premium-only-overlay',
      '.document-gater',
      '[class*="paywall"]',
      '[class*="gate-overlay"]',
      '[id*="paywall"]'
    ];

    paywallSelectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        unblurredCount++;
      });
    });

    // Khôi phục thanh cuộn nếu trang bị khóa cuộn
    document.body.style.setProperty('overflow', 'auto', 'important');
    document.documentElement.style.setProperty('overflow', 'auto', 'important');

    return unblurredCount;
  }
}
