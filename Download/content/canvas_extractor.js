// OmniLoader - Canvas & Study Materials Extractor
// Quét các web học liệu (Scribd, Studocu, Canvas LMS, SlideShare, PDF Viewer nhúng)

export class CanvasExtractor {
  // Quét toàn bộ thẻ canvas trên trang
  static scanCanvases() {
    const canvases = document.querySelectorAll('canvas');
    const results = [];

    canvases.forEach((canvas, index) => {
      // Bỏ qua canvas quá nhỏ (như icon hoặc hiệu ứng nền)
      if (canvas.width < 300 || canvas.height < 300) return;

      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        results.push({
          pageNumber: index + 1,
          width: canvas.width,
          height: canvas.height,
          dataUrl: dataUrl
        });
      } catch (e) {
        // Bị dính CORS canvas taint
      }
    });

    return results;
  }

  // Tự động cuộn trang để kích hoạt Lazy Load tất cả các trang tài liệu
  static async autoScrollAndCapture(progressCallback) {
    const scrollContainer = document.querySelector('.document-viewer') || 
                            document.querySelector('.viewer-container') || 
                            document.querySelector('.page-container') || 
                            document.documentElement;

    const totalHeight = scrollContainer.scrollHeight;
    const step = window.innerHeight * 0.8;
    let currentScroll = 0;

    while (currentScroll < totalHeight) {
      scrollContainer.scrollTop = currentScroll;
      window.scrollTo(0, currentScroll);
      await new Promise(r => setTimeout(r, 600)); // Đợi trang render
      currentScroll += step;
      if (progressCallback) {
        progressCallback(Math.min(100, Math.round((currentScroll / totalHeight) * 100)));
      }
    }

    // Sau khi scroll xong, chụp lại toàn bộ canvas
    return this.scanCanvases();
  }
}
