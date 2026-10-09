// OmniLoader - Network & Media Sniffer Module

export class MediaSniffer {
  constructor() {
    // Map of tabId -> Map(url -> mediaItem)
    this.tabMedia = new Map();
  }

  // Phân loại định dạng file từ URL và MIME type
  detectType(url, mimeType = '', responseHeaders = []) {
    const cleanUrl = url.split('?')[0].toLowerCase();
    const mime = (mimeType || '').toLowerCase();

    // 1. Luồng phân mảnh (HLS / DASH)
    if (cleanUrl.endsWith('.m3u8') || mime.includes('application/x-mpegurl') || mime.includes('application/vnd.apple.mpegurl')) {
      return { type: 'hls', category: 'video', ext: 'm3u8', format: 'HLS Stream (m3u8)' };
    }
    if (cleanUrl.endsWith('.mpd') || mime.includes('application/dash+xml')) {
      return { type: 'dash', category: 'video', ext: 'mpd', format: 'DASH Stream (mpd)' };
    }

    // 2. Video trực tiếp
    if (cleanUrl.endsWith('.mp4') || mime.includes('video/mp4')) {
      return { type: 'video', category: 'video', ext: 'mp4', format: 'MP4 Video' };
    }
    if (cleanUrl.endsWith('.webm') || mime.includes('video/webm')) {
      return { type: 'video', category: 'video', ext: 'webm', format: 'WebM Video' };
    }
    if (cleanUrl.endsWith('.mkv') || mime.includes('video/x-matroska')) {
      return { type: 'video', category: 'video', ext: 'mkv', format: 'MKV Video' };
    }
    if (cleanUrl.endsWith('.ts') && !cleanUrl.includes('segment')) {
      return { type: 'video', category: 'video', ext: 'ts', format: 'MPEG-TS' };
    }
    if (cleanUrl.endsWith('.flv') || mime.includes('video/x-flv')) {
      return { type: 'video', category: 'video', ext: 'flv', format: 'FLV Video' };
    }
    if (mime.startsWith('video/')) {
      return { type: 'video', category: 'video', ext: 'mp4', format: 'Video' };
    }

    // 3. Âm thanh
    if (cleanUrl.endsWith('.mp3') || mime.includes('audio/mpeg') || mime.includes('audio/mp3')) {
      return { type: 'audio', category: 'audio', ext: 'mp3', format: 'MP3 Audio' };
    }
    if (cleanUrl.endsWith('.m4a') || mime.includes('audio/mp4') || mime.includes('audio/m4a')) {
      return { type: 'audio', category: 'audio', ext: 'm4a', format: 'M4A Audio' };
    }
    if (cleanUrl.endsWith('.wav') || mime.includes('audio/wav')) {
      return { type: 'audio', category: 'audio', ext: 'wav', format: 'WAV Audio' };
    }
    if (cleanUrl.endsWith('.ogg') || mime.includes('audio/ogg')) {
      return { type: 'audio', category: 'audio', ext: 'ogg', format: 'OGG Audio' };
    }
    if (cleanUrl.endsWith('.aac') || mime.includes('audio/aac')) {
      return { type: 'audio', category: 'audio', ext: 'aac', format: 'AAC Audio' };
    }
    if (mime.startsWith('audio/')) {
      return { type: 'audio', category: 'audio', ext: 'mp3', format: 'Audio' };
    }

    // 4. Tài liệu & Học liệu
    if (cleanUrl.endsWith('.pdf') || mime.includes('application/pdf')) {
      return { type: 'document', category: 'document', ext: 'pdf', format: 'PDF Document' };
    }
    if (cleanUrl.endsWith('.docx') || cleanUrl.endsWith('.doc') || mime.includes('msword')) {
      return { type: 'document', category: 'document', ext: 'docx', format: 'Word Document' };
    }
    if (cleanUrl.endsWith('.pptx') || cleanUrl.endsWith('.ppt') || mime.includes('powerpoint')) {
      return { type: 'document', category: 'document', ext: 'pptx', format: 'PowerPoint Slide' };
    }
    if (cleanUrl.endsWith('.xlsx') || cleanUrl.endsWith('.xls') || mime.includes('excel')) {
      return { type: 'document', category: 'document', ext: 'xlsx', format: 'Excel Spreadsheet' };
    }
    if (cleanUrl.endsWith('.epub')) {
      return { type: 'document', category: 'document', ext: 'epub', format: 'EPUB Ebook' };
    }

    // 5. Nén / File khác
    if (cleanUrl.endsWith('.zip') || mime.includes('application/zip')) {
      return { type: 'archive', category: 'document', ext: 'zip', format: 'ZIP Archive' };
    }

    return null;
  }

  // Trích xuất tên file từ URL hoặc Header
  extractFilename(url, headers = [], fallbackExt = 'mp4') {
    // 1. Kiểm tra header Content-Disposition
    const contentDisposition = headers.find(h => h.name.toLowerCase() === 'content-disposition');
    if (contentDisposition && contentDisposition.value) {
      const match = contentDisposition.value.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
      if (match && match[1]) {
        try {
          return decodeURIComponent(match[1].trim());
        } catch (e) {
          return match[1].trim();
        }
      }
    }

    // 2. Lấy từ đường dẫn URL
    try {
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname;
      const parts = pathname.split('/').filter(p => p.trim() !== '');
      if (parts.length > 0) {
        let name = decodeURIComponent(parts[parts.length - 1]);
        if (name.includes('.')) {
          return name;
        }
      }
    } catch (e) {}

    // 3. Fallback
    return `media_${Date.now()}.${fallbackExt}`;
  }

  // Thêm mục media vào kho lưu trữ tab
  addMedia(tabId, item) {
    if (tabId < 0) return null;
    if (!this.tabMedia.has(tabId)) {
      this.tabMedia.set(tabId, new Map());
    }

    const map = this.tabMedia.get(tabId);
    
    // Tránh trùng lặp URL
    if (map.has(item.url)) {
      const existing = map.get(item.url);
      // Cập nhật thông tin nếu có thêm size
      if (!existing.size && item.size) {
        existing.size = item.size;
        existing.sizeFormatted = item.sizeFormatted;
      }
      return existing;
    }

    map.set(item.url, item);
    return item;
  }

  // Lấy toàn bộ media của một tab
  getMedia(tabId) {
    if (!this.tabMedia.has(tabId)) return [];
    return Array.from(this.tabMedia.get(tabId).values());
  }

  // Xóa media của tab khi đóng hoặc reload
  clearTab(tabId) {
    this.tabMedia.delete(tabId);
  }

  // Định dạng kích thước dung lượng (Bytes -> MB/GB)
  formatSize(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return 'Không rõ';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }
}
