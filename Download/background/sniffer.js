// OmniLoader - Network & Media Sniffer Module (Persistent Storage)

export class MediaSniffer {
  // Lấy danh sách media của tab từ chrome.storage.session
  static async getMedia(tabId) {
    if (!tabId || tabId < 0) return [];
    const key = `media_tab_${tabId}`;
    const data = await chrome.storage.session.get(key).catch(() => ({}));
    return data[key] || [];
  }

  // Thêm mục media vào tab
  static async addMedia(tabId, item) {
    if (!tabId || tabId < 0 || !item.url) return null;
    const key = `media_tab_${tabId}`;
    const existing = await this.getMedia(tabId);

    // Kiểm tra trùng lặp URL
    const cleanUrl = item.url.split('?')[0];
    const itemIndex = existing.findIndex(m => m.url.split('?')[0] === cleanUrl && m.ext === item.ext);

    if (itemIndex >= 0) {
      // Cập nhật thông tin nếu có thêm size
      if (!existing[itemIndex].size && item.size) {
        existing[itemIndex].size = item.size;
        existing[itemIndex].sizeFormatted = item.sizeFormatted;
        await chrome.storage.session.set({ [key]: existing });
      }
      return existing[itemIndex];
    }

    existing.push(item);
    await chrome.storage.session.set({ [key]: existing });
    return item;
  }

  // Xóa dữ liệu của tab khi đóng hoặc reload
  static async clearTab(tabId) {
    if (!tabId || tabId < 0) return;
    const key = `media_tab_${tabId}`;
    await chrome.storage.session.remove(key).catch(() => {});
  }

  // Phân loại định dạng file
  static detectType(url, mimeType = '', responseHeaders = []) {
    if (!url) return null;
    const cleanUrl = url.split('?')[0].toLowerCase();
    const mime = (mimeType || '').toLowerCase();

    // 1. Âm thanh (Audio)
    if (cleanUrl.endsWith('.mp3') || mime.includes('audio/mpeg') || mime.includes('audio/mp3') || url.includes('.mp3')) {
      return { type: 'audio', category: 'audio', ext: 'mp3', format: 'MP3 Audio' };
    }
    if (cleanUrl.endsWith('.m4a') || mime.includes('audio/mp4') || mime.includes('audio/m4a') || url.includes('.m4a')) {
      return { type: 'audio', category: 'audio', ext: 'm4a', format: 'M4A Audio' };
    }
    if (cleanUrl.endsWith('.wav') || mime.includes('audio/wav') || url.includes('.wav')) {
      return { type: 'audio', category: 'audio', ext: 'wav', format: 'WAV Audio' };
    }
    if (cleanUrl.endsWith('.ogg') || mime.includes('audio/ogg') || mime.includes('application/ogg')) {
      return { type: 'audio', category: 'audio', ext: 'ogg', format: 'OGG Audio' };
    }
    if (cleanUrl.endsWith('.aac') || mime.includes('audio/aac') || url.includes('.aac')) {
      return { type: 'audio', category: 'audio', ext: 'aac', format: 'AAC Audio' };
    }
    if (cleanUrl.endsWith('.flac') || mime.includes('audio/flac')) {
      return { type: 'audio', category: 'audio', ext: 'flac', format: 'FLAC Audio' };
    }
    if (mime.startsWith('audio/')) {
      return { type: 'audio', category: 'audio', ext: 'mp3', format: 'Audio Stream' };
    }

    // 2. Luồng phân mảnh HLS / DASH
    if (cleanUrl.endsWith('.m3u8') || mime.includes('application/x-mpegurl') || mime.includes('application/vnd.apple.mpegurl') || url.includes('.m3u8')) {
      return { type: 'hls', category: 'video', ext: 'm3u8', format: 'HLS Stream (m3u8)' };
    }
    if (cleanUrl.endsWith('.mpd') || mime.includes('application/dash+xml')) {
      return { type: 'dash', category: 'video', ext: 'mpd', format: 'DASH Stream (mpd)' };
    }

    // 3. Video trực tiếp
    if (cleanUrl.endsWith('.mp4') || mime.includes('video/mp4') || url.includes('.mp4')) {
      return { type: 'video', category: 'video', ext: 'mp4', format: 'MP4 Video' };
    }
    if (cleanUrl.endsWith('.webm') || mime.includes('video/webm') || url.includes('.webm')) {
      return { type: 'video', category: 'video', ext: 'webm', format: 'WebM Video' };
    }
    if (cleanUrl.endsWith('.mkv') || mime.includes('video/x-matroska')) {
      return { type: 'video', category: 'video', ext: 'mkv', format: 'MKV Video' };
    }
    if (mime.startsWith('video/')) {
      return { type: 'video', category: 'video', ext: 'mp4', format: 'Video Stream' };
    }

    // 4. Tài liệu
    if (cleanUrl.endsWith('.pdf') || mime.includes('application/pdf')) {
      return { type: 'document', category: 'document', ext: 'pdf', format: 'PDF Document' };
    }
    if (cleanUrl.endsWith('.docx') || cleanUrl.endsWith('.doc')) {
      return { type: 'document', category: 'document', ext: 'docx', format: 'Word Document' };
    }

    return null;
  }

  static extractFilename(url, headers = [], fallbackExt = 'mp3') {
    const contentDisposition = headers.find(h => h.name.toLowerCase() === 'content-disposition');
    if (contentDisposition && contentDisposition.value) {
      const match = contentDisposition.value.match(/filename\*?=['"]?(?:UTF-\d['"]*)?([^;\r\n"']*)['"]?/i);
      if (match && match[1]) {
        try {
          return decodeURIComponent(match[1].trim()).replace(/[\\/:*?"<>|]/g, '_');
        } catch (e) {
          return match[1].trim().replace(/[\\/:*?"<>|]/g, '_');
        }
      }
    }

    try {
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname;
      const parts = pathname.split('/').filter(p => p.trim() !== '');
      if (parts.length > 0) {
        let name = decodeURIComponent(parts[parts.length - 1]);
        if (name.includes('.')) {
          return name.replace(/[\\/:*?"<>|]/g, '_').substring(0, 100);
        }
      }
    } catch (e) {}

    return `Audio_${Date.now()}.${fallbackExt}`;
  }

  static formatSize(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return 'Audio Stream';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }
}
