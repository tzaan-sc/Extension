// OmniLoader - Persistent & Thread-Safe Sniffer Module

export class MediaSniffer {
  // Bộ nhớ đệm RAM tức thì (tránh Race Condition)
  static memoryCache = new Map();

  static async initTab(tabId) {
    if (!tabId || tabId < 0) return;
    if (!this.memoryCache.has(tabId)) {
      const key = `media_tab_${tabId}`;
      const data = await chrome.storage.session.get(key).catch(() => ({}));
      this.memoryCache.set(tabId, data[key] || []);
    }
  }

  static async getMedia(tabId) {
    if (!tabId || tabId < 0) return [];
    if (!this.memoryCache.has(tabId)) {
      await this.initTab(tabId);
    }
    return this.memoryCache.get(tabId) || [];
  }

  // Thêm hàng loạt Media Item trong 1 thao tác duy nhất (Atomic Batch)
  static async addMediaBatch(tabId, items) {
    if (!tabId || tabId < 0 || !items || items.length === 0) return;
    await this.initTab(tabId);

    const existing = this.memoryCache.get(tabId) || [];
    const existingMap = new Map();
    existing.forEach(item => {
      const k = item.id || (item.url + (item.quality || '') + (item.ext || ''));
      existingMap.set(k, item);
    });

    items.forEach(item => {
      if (!item.url) return;
      const k = item.id || (item.url + (item.quality || '') + (item.ext || ''));
      if (!existingMap.has(k)) {
        existingMap.set(k, {
          ...item,
          id: item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          tabId: tabId,
          sizeFormatted: item.sizeFormatted || this.formatSize(item.size || 0),
          timestamp: Date.now()
        });
      }
    });

    const updatedList = Array.from(existingMap.values());
    this.memoryCache.set(tabId, updatedList);

    const key = `media_tab_${tabId}`;
    await chrome.storage.session.set({ [key]: updatedList }).catch(() => {});
    return updatedList;
  }

  static async addMedia(tabId, item) {
    return this.addMediaBatch(tabId, [item]);
  }

  static async clearTab(tabId) {
    if (!tabId || tabId < 0) return;
    this.memoryCache.delete(tabId);
    const key = `media_tab_${tabId}`;
    await chrome.storage.session.remove(key).catch(() => {});
  }

  static detectType(url, mimeType = '', responseHeaders = []) {
    if (!url) return null;
    const cleanUrl = url.split('?')[0].toLowerCase();
    const mime = (mimeType || '').toLowerCase();

    // 1. Âm thanh
    if (cleanUrl.endsWith('.mp3') || mime.includes('audio/mpeg') || mime.includes('audio/mp3') || url.includes('.mp3')) {
      return { type: 'audio', category: 'audio', ext: 'mp3', format: 'MP3 Audio' };
    }
    if (cleanUrl.endsWith('.m4a') || mime.includes('audio/mp4') || mime.includes('audio/m4a') || url.includes('.m4a')) {
      return { type: 'audio', category: 'audio', ext: 'm4a', format: 'M4A Audio' };
    }
    if (cleanUrl.endsWith('.wav') || mime.includes('audio/wav') || url.includes('.wav')) {
      return { type: 'audio', category: 'audio', ext: 'wav', format: 'WAV Audio' };
    }
    if (cleanUrl.endsWith('.aac') || mime.includes('audio/aac')) {
      return { type: 'audio', category: 'audio', ext: 'aac', format: 'AAC Audio' };
    }
    if (mime.startsWith('audio/')) {
      return { type: 'audio', category: 'audio', ext: 'mp3', format: 'Audio' };
    }

    // 2. Video HLS / DASH
    if (cleanUrl.endsWith('.m3u8') || mime.includes('application/x-mpegurl') || mime.includes('application/vnd.apple.mpegurl') || url.includes('.m3u8')) {
      return { type: 'hls', category: 'video', ext: 'm3u8', format: 'HLS Stream (m3u8)' };
    }
    if (cleanUrl.endsWith('.mpd') || mime.includes('application/dash+xml')) {
      return { type: 'dash', category: 'video', ext: 'mpd', format: 'DASH Stream' };
    }

    // 3. Video Trực tiếp
    if (cleanUrl.endsWith('.mp4') || mime.includes('video/mp4') || url.includes('.mp4')) {
      return { type: 'video', category: 'video', ext: 'mp4', format: 'MP4 Video' };
    }
    if (cleanUrl.endsWith('.webm') || mime.includes('video/webm') || url.includes('.webm')) {
      return { type: 'video', category: 'video', ext: 'webm', format: 'WebM Video' };
    }
    if (mime.startsWith('video/')) {
      return { type: 'video', category: 'video', ext: 'mp4', format: 'Video' };
    }

    // 4. Tài liệu
    if (cleanUrl.endsWith('.pdf') || mime.includes('application/pdf')) {
      return { type: 'document', category: 'document', ext: 'pdf', format: 'PDF Document' };
    }

    return null;
  }

  static extractFilename(url, headers = [], fallbackExt = 'mp4') {
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

    return `Media_${Date.now()}.${fallbackExt}`;
  }

  static formatSize(bytes) {
    if (!bytes || isNaN(bytes) || bytes <= 0) return 'Tối ưu';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }
}
