// OmniLoader - Advanced Document & PDF Extractor
// Quét, kích hoạt Lazy Load và đóng gói tài liệu thành file PDF hoàn chỉnh

import { createPdfFromImages } from './pdf_builder.js';

export class DocumentExtractor {
  // 1. Quét tìm tài liệu dạng file PDF gốc nhúng
  static findDirectPdf() {
    const embeds = document.querySelectorAll('embed[type="application/pdf"], iframe[src*=".pdf"], a[href$=".pdf"]');
    for (const el of embeds) {
      const src = el.src || el.href;
      if (src && !src.startsWith('blob:')) {
        return src;
      }
    }
    return null;
  }

  // 2. Tự động cuộn trang để kích hoạt Lazy-load tất cả các trang bị ẩn
  static async autoScrollToLoadAllPages(onProgress) {
    const scrollHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight,
      5000
    );

    const step = window.innerHeight * 0.7;
    let currentY = 0;

    while (currentY < scrollHeight) {
      window.scrollTo(0, currentY);
      currentY += step;

      if (onProgress) {
        onProgress(Math.min(90, Math.round((currentY / scrollHeight) * 100)));
      }
      await new Promise(r => setTimeout(r, 250)); // Đợi 250ms cho trang render
    }

    // Cuộn ngược lên đầu trang
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 400));
  }

  // 3. Trích xuất tất cả các trang tài liệu (Canvas & Images)
  static extractAllPages() {
    const pages = [];
    const seen = new Set();

    // A. Quét các thẻ Canvas (Scribd, Studocu, PDF.js...)
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach((canvas, idx) => {
      if (canvas.width < 250 || canvas.height < 250) return;
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        if (!seen.has(dataUrl)) {
          seen.add(dataUrl);
          pages.push({
            pageNumber: idx + 1,
            width: canvas.width,
            height: canvas.height,
            dataUrl: dataUrl
          });
        }
      } catch (e) {
        // Bị dính CORS canvas
      }
    });

    // B. Quét các thẻ Image của trang tài liệu (SlideShare, Google Doc Pages...)
    if (pages.length === 0) {
      const pageImages = document.querySelectorAll('.page img, .page-container img, .doc-page img, img[class*="page"], img[id*="page"]');
      pageImages.forEach((img, idx) => {
        const src = img.currentSrc || img.src || img.dataset.src;
        if (src && (img.naturalWidth > 300 || img.width > 300)) {
          pages.push({
            pageNumber: idx + 1,
            width: img.naturalWidth || 800,
            height: img.naturalHeight || 1100,
            url: src
          });
        }
      });
    }

    return pages;
  }

  // 4. Toàn bộ quy trình: Cuộn -> Quét -> Tạo file PDF hoàn chỉnh
  static async exportToPdf(filename, onProgress) {
    // Nếu có file PDF gốc trực tiếp
    const directPdf = this.findDirectPdf();
    if (directPdf) {
      return { type: 'direct', url: directPdf };
    }

    // Cuộn trang
    await this.autoScrollToLoadAllPages(onProgress);

    // Trích xuất trang
    const pages = this.extractAllPages();
    if (pages.length === 0) {
      throw new Error('Không tìm thấy trang tài liệu nào trên trang hiện tại.');
    }

    // Đóng gói PDF
    if (onProgress) onProgress(95);
    const pdfBlob = createPdfFromImages(pages);
    if (!pdfBlob) throw new Error('Không thể tạo file PDF.');

    return { type: 'blob', blob: pdfBlob, pageCount: pages.length };
  }
}
