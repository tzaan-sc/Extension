// OmniLoader - Background Document Resolver Service
// Tự động phân giải và tải ngầm file tài liệu gốc từ Scribd, Studocu, SlideShare, Issuu, Academia

export class DocResolverService {
  // Nhận diện nền tảng
  static detectPlatform(url) {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.includes('scribd.com/document') || lower.includes('scribd.com/doc') || lower.includes('scribd.com/presentation')) {
      return { platform: 'scribd', name: 'Scribd Document' };
    }
    if (lower.includes('studocu.com') && (lower.includes('/document/') || lower.includes('/vn/document/'))) {
      return { platform: 'studocu', name: 'Studocu Document' };
    }
    if (lower.includes('slideshare.net/')) {
      return { platform: 'slideshare', name: 'SlideShare Presentation' };
    }
    if (lower.includes('issuu.com/')) {
      return { platform: 'issuu', name: 'Issuu Publication' };
    }
    if (lower.includes('academia.edu/')) {
      return { platform: 'academia', name: 'Academia Paper' };
    }
    return null;
  }

  // Trích xuất Doc ID của Scribd
  static extractScribdId(url) {
    const match = url.match(/\/document\/(\d+)/) || url.match(/\/doc\/(\d+)/);
    return match ? match[1] : null;
  }

  // Tự động giải mã ngầm trong background không cần mở tab thứ 3
  static async resolveAndDownload(docUrl, tabId) {
    const platformInfo = this.detectPlatform(docUrl);
    if (!platformInfo) {
      throw new Error('Nền tảng tài liệu chưa được hỗ trợ giải mã tự động.');
    }

    // 1. Xử lý riêng cho SlideShare: Trích xuất trọn bộ ảnh slide gốc và đóng gói
    if (platformInfo.platform === 'slideshare') {
      return await this.resolveSlideShare(docUrl);
    }

    // 2. Thử giải mã qua các cổng Gateway ngầm
    try {
      const directUrl = await this.fetchGatewayDirectUrl(docUrl, platformInfo.platform);
      if (directUrl) {
        return {
          type: 'direct_download',
          url: directUrl,
          filename: `tai_lieu_${platformInfo.platform}_${Date.now()}.pdf`
        };
      }
    } catch (e) {
      console.warn('Gateway background bận, chuyển sang trích xuất DOM:', e);
    }

    // 3. Fallback: Báo cho Popup dùng In-Browser Harvester (Quét & Ghép Canvas tại chỗ)
    return {
      type: 'dom_harvest',
      message: 'Đang chuyển sang trích xuất trực tiếp tại chỗ từ DOM...'
    };
  }

  // Giải mã SlideShare trực tiếp từ CDN của LinkedIn / SlideShare
  static async resolveSlideShare(url) {
    try {
      const resp = await fetch(url);
      const html = await resp.text();

      // Tìm các ảnh slide từ HTML
      const slideMatches = html.match(/https:\/\/[^"'\s]+\/slide-\d+-[^"'\s]+\.jpg/g);
      if (slideMatches && slideMatches.length > 0) {
        const uniqueSlides = Array.from(new Set(slideMatches));
        return {
          type: 'slide_images',
          slides: uniqueSlides,
          filename: `SlideShare_${Date.now()}.pdf`
        };
      }
    } catch (e) {}

    return { type: 'dom_harvest' };
  }

  // Gọi API ngầm đến các dịch vụ resolver
  static async fetchGatewayDirectUrl(targetUrl, platform) {
    // Thử truy vấn các API resolver công khai
    const endpoints = [
      `https://docdownloader.com/api/get-link?url=${encodeURIComponent(targetUrl)}`,
      `https://downscribd.com/api/resolve?url=${encodeURIComponent(targetUrl)}`
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep, {
          method: 'GET',
          headers: {
            'Accept': 'application/json, text/plain, */*'
          }
        });
        if (res.ok) {
          const data = await res.json().catch(() => null);
          if (data && (data.downloadUrl || data.url || data.pdf)) {
            return data.downloadUrl || data.url || data.pdf;
          }
        }
      } catch (err) {}
    }

    return null;
  }
}
