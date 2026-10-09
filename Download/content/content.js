// OmniLoader - Content Script
// Quét sâu DOM, kết nối Injected Script và báo cáo Media về Background

(function () {
  'use strict';

  // 1. Inject script vào Main World
  function injectMainWorldScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('content/injected.js');
      script.onload = function () {
        this.remove();
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.warn('[OmniLoader] Cannot inject main script:', e);
    }
  }

  injectMainWorldScript();

  // 2. Lắng nghe thông điệp từ Injected Script
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || !event.data.type) return;

    // A. Bắt link mạng từ Fetch / XHR / Media Play
    if (event.data.type === 'OMNILOADER_SNIFFED_URL') {
      const { url, title } = event.data;
      const isM3u8 = url.includes('.m3u8');
      const isAudio = url.includes('.mp3') || url.includes('.m4a') || url.includes('.wav');

      reportMedia({
        url: url,
        filename: `${sanitizeFilename(title || document.title)}.${isM3u8 ? 'mp4' : (isAudio ? 'mp3' : 'mp4')}`,
        type: isM3u8 ? 'hls' : (isAudio ? 'audio' : 'video'),
        category: isAudio ? 'audio' : 'video',
        ext: isM3u8 ? 'm3u8' : (isAudio ? 'mp3' : 'mp4'),
        format: isM3u8 ? 'HLS Stream (m3u8)' : (isAudio ? 'Audio Stream' : 'Direct Video'),
        source: 'dom_hook'
      });
    }

    // B. Xử lý dữ liệu đặc biệt từ YouTube
    if (event.data.type === 'OMNILOADER_YOUTUBE_DATA') {
      handleYouTubeData(event.data);
    }
  });

  // 3. Phân giải dữ liệu YouTube
  function handleYouTubeData(data) {
    const { videoDetails, streamingData, captionTracks } = data;
    if (!streamingData) return;

    const title = videoDetails?.title || document.title;
    const thumbnail = videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';

    // A. Định dạng chuẩn (Formats: Video + Audio)
    if (streamingData.formats) {
      streamingData.formats.forEach((fmt) => {
        const directUrl = fmt.url || extractCipherUrl(fmt);
        if (directUrl) {
          reportMedia({
            url: directUrl,
            filename: `${sanitizeFilename(title)} [${fmt.qualityLabel || fmt.quality}].mp4`,
            title: title,
            quality: fmt.qualityLabel || fmt.quality,
            thumbnail: thumbnail,
            type: 'video',
            category: 'video',
            ext: 'mp4',
            format: `YouTube MP4 (${fmt.qualityLabel || fmt.quality})`,
            size: fmt.contentLength ? parseInt(fmt.contentLength, 10) : 0,
            source: 'youtube'
          });
        }
      });
    }

    // B. Định dạng Adaptive (1080p, 2K, 4K hoặc Âm thanh M4A)
    if (streamingData.adaptiveFormats) {
      streamingData.adaptiveFormats.forEach((fmt) => {
        const directUrl = fmt.url || extractCipherUrl(fmt);
        if (!directUrl) return;

        const isAudio = fmt.mimeType && fmt.mimeType.startsWith('audio/');
        const qualityLabel = fmt.qualityLabel || (isAudio ? `${Math.round((fmt.bitrate || 0) / 1000)}kbps` : 'HD');
        const ext = isAudio ? 'm4a' : 'mp4';

        reportMedia({
          url: directUrl,
          filename: `${sanitizeFilename(title)} [${isAudio ? 'Audio ' + qualityLabel : qualityLabel}].${ext}`,
          title: title,
          quality: qualityLabel,
          thumbnail: thumbnail,
          type: isAudio ? 'audio' : 'video',
          category: isAudio ? 'audio' : 'video',
          ext: ext,
          format: isAudio ? `YouTube Âm thanh (${qualityLabel})` : `YouTube Video (${qualityLabel})`,
          size: fmt.contentLength ? parseInt(fmt.contentLength, 10) : 0,
          source: 'youtube'
        });
      });
    }

    // C. HLS Manifest Stream của YouTube
    if (streamingData.hlsManifestUrl) {
      reportMedia({
        url: streamingData.hlsManifestUrl,
        filename: `${sanitizeFilename(title)} [HLS Stream].mp4`,
        title: title,
        thumbnail: thumbnail,
        type: 'hls',
        category: 'video',
        ext: 'm3u8',
        format: 'YouTube HLS Auto Stream',
        source: 'youtube'
      });
    }

    // D. Phụ đề YouTube
    if (captionTracks && captionTracks.length > 0) {
      captionTracks.forEach((cap) => {
        if (cap.baseUrl) {
          reportMedia({
            url: cap.baseUrl + '&fmt=vtt',
            filename: `${sanitizeFilename(title)} [Phụ đề ${cap.name?.simpleText || 'CC'}].vtt`,
            title: `${title} - Phụ đề ${cap.name?.simpleText || ''}`,
            type: 'document',
            category: 'document',
            ext: 'vtt',
            format: `Phụ đề (${cap.name?.simpleText || 'VTT'})`,
            size: 0,
            source: 'youtube'
          });
        }
      });
    }
  }

  function extractCipherUrl(fmt) {
    const cipher = fmt.signatureCipher || fmt.cipher;
    if (!cipher) return null;
    try {
      const params = new URLSearchParams(cipher);
      return params.get('url');
    } catch (e) {
      return null;
    }
  }

  // 4. Quét sâu toàn bộ DOM
  function scanDOMMedia() {
    // Video tags
    document.querySelectorAll('video').forEach((video, idx) => {
      let src = video.currentSrc || video.src;
      if (!src) {
        const source = video.querySelector('source');
        if (source) src = source.src;
      }
      if (src && !src.startsWith('blob:')) {
        reportMedia({
          url: src,
          filename: `${sanitizeFilename(document.title)}_video_${idx + 1}.mp4`,
          type: 'video',
          category: 'video',
          ext: 'mp4',
          format: 'HTML5 Video',
          source: 'dom'
        });
      }
    });

    // Audio tags
    document.querySelectorAll('audio').forEach((audio, idx) => {
      let src = audio.currentSrc || audio.src;
      if (!src) {
        const source = audio.querySelector('source');
        if (source) src = source.src;
      }
      if (src && !src.startsWith('blob:')) {
        reportMedia({
          url: src,
          filename: `${sanitizeFilename(document.title)}_audio_${idx + 1}.mp3`,
          type: 'audio',
          category: 'audio',
          ext: 'mp3',
          format: 'HTML5 Audio',
          source: 'dom'
        });
      }
    });

    // Các thẻ liên kết (<a>) trỏ tới file media hoặc tài liệu
    document.querySelectorAll('a[href]').forEach((link) => {
      const href = link.href.split('?')[0].toLowerCase();
      if (href.endsWith('.mp4') || href.endsWith('.mp3') || href.endsWith('.pdf') || href.endsWith('.docx') || href.endsWith('.zip')) {
        const ext = href.split('.').pop();
        const category = (ext === 'mp4') ? 'video' : (ext === 'mp3' ? 'audio' : 'document');
        reportMedia({
          url: link.href,
          filename: sanitizeFilename(link.textContent || link.title || document.title) + '.' + ext,
          type: category,
          category: category,
          ext: ext,
          format: `Direct ${ext.toUpperCase()}`,
          source: 'dom_link'
        });
      }
    });
  }

  // Gửi thông tin về Background
  function reportMedia(item) {
    if (!item.url) return;
    chrome.runtime.sendMessage({
      action: 'ADD_CUSTOM_MEDIA',
      item: item
    });
  }

  function sanitizeFilename(name) {
    return (name || 'download')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 120);
  }

  // Lắng nghe lệnh từ Popup UI
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SCAN_PAGE_IMAGES') {
      const images = [];
      const seen = new Set();
      document.querySelectorAll('img').forEach((img) => {
        const src = img.currentSrc || img.src;
        if (!src || seen.has(src) || src.startsWith('data:image/svg')) return;
        if (img.naturalWidth > 150 || img.width > 150) {
          seen.add(src);
          images.push({
            url: src,
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height
          });
        }
      });
      sendResponse({ success: true, images });
      return true;
    }

    if (request.action === 'SCAN_CANVAS_PAGES') {
      const canvases = document.querySelectorAll('canvas');
      const pages = [];
      canvases.forEach((c, i) => {
        if (c.width > 200 && c.height > 200) {
          try {
            pages.push({
              index: i + 1,
              dataUrl: c.toDataURL('image/jpeg', 0.95)
            });
          } catch (e) {}
        }
      });
      sendResponse({ success: true, pages });
      return true;
    }

    if (request.action === 'SCAN_DOM_NOW') {
      scanDOMMedia();
      sendResponse({ success: true });
      return true;
    }
  });

  // Chạy quét
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanDOMMedia);
  } else {
    scanDOMMedia();
  }
  setInterval(scanDOMMedia, 3000);
})();
