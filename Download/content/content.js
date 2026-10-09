// OmniLoader - Content Script
// Quét DOM, kết nối với Injected Script và báo cáo Media về Background

(function () {
  'use strict';

  // 1. Inject script vào Main World để hook fetch/XHR
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

    // A. Bắt link mạng từ Fetch / XHR
    if (event.data.type === 'OMNILOADER_SNIFFED_URL') {
      const { url, title } = event.data;
      reportMedia({
        url: url,
        filename: sanitizeFilename(title || document.title),
        type: url.includes('.m3u8') ? 'hls' : 'video',
        category: 'video',
        ext: url.includes('.m3u8') ? 'm3u8' : 'mp4',
        format: url.includes('.m3u8') ? 'HLS Stream (m3u8)' : 'Direct Video',
        source: 'dom_hook'
      });
    }

    // B. Xử lý dữ liệu đặc biệt từ YouTube
    if (event.data.type === 'OMNILOADER_YOUTUBE_DATA') {
      handleYouTubeData(event.data);
    }
  });

  // 3. Xử lý các định dạng video & âm thanh YouTube
  function handleYouTubeData(data) {
    const { videoDetails, streamingData, captionTracks } = data;
    if (!streamingData) return;

    const title = videoDetails?.title || document.title;
    const thumbnail = videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';

    // A. Định dạng kết hợp (Video + Audio 360p / 720p trực tiếp)
    if (streamingData.formats) {
      streamingData.formats.forEach((fmt) => {
        if (fmt.url) {
          reportMedia({
            url: fmt.url,
            filename: `${sanitizeFilename(title)} [${fmt.qualityLabel || fmt.quality}].mp4`,
            title: title,
            quality: fmt.qualityLabel || fmt.quality,
            thumbnail: thumbnail,
            type: 'video',
            category: 'video',
            ext: 'mp4',
            format: `YouTube Video ${fmt.qualityLabel || fmt.quality}`,
            size: fmt.contentLength ? parseInt(fmt.contentLength, 10) : 0,
            source: 'youtube'
          });
        }
      });
    }

    // B. Định dạng Adaptive (Chất lượng cao 1080p, 2K, 4K hoặc Audio M4A chất lượng cao)
    if (streamingData.adaptiveFormats) {
      streamingData.adaptiveFormats.forEach((fmt) => {
        if (!fmt.url) return;
        const isAudio = fmt.mimeType && fmt.mimeType.startsWith('audio/');
        const qualityLabel = fmt.qualityLabel || (isAudio ? `${Math.round((fmt.bitrate || 0) / 1000)}kbps` : 'HD');
        const ext = isAudio ? 'm4a' : 'mp4';

        reportMedia({
          url: fmt.url,
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

    // C. Phụ đề YouTube
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

  // 4. Quét các phần tử thẻ trong DOM (<video>, <audio>, <iframe>, <embed>)
  function scanDOMMedia() {
    // Video elements
    document.querySelectorAll('video').forEach((video, idx) => {
      const src = video.currentSrc || video.src;
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

    // Audio elements
    document.querySelectorAll('audio').forEach((audio, idx) => {
      const src = audio.currentSrc || audio.src;
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

    // PDF Embeds
    document.querySelectorAll('embed[type="application/pdf"], iframe[src*=".pdf"]').forEach((elem) => {
      const src = elem.src;
      if (src) {
        reportMedia({
          url: src,
          filename: `${sanitizeFilename(document.title)}.pdf`,
          type: 'document',
          category: 'document',
          ext: 'pdf',
          format: 'PDF Document',
          source: 'dom'
        });
      }
    });
  }

  // 5. Quét tất cả hình ảnh chất lượng cao trên trang
  function scanImages() {
    const images = [];
    const seen = new Set();

    document.querySelectorAll('img').forEach((img) => {
      const src = img.currentSrc || img.src;
      if (!src || seen.has(src) || src.startsWith('data:image/svg')) return;

      // Lọc ảnh có kích thước thật > 200px
      if (img.naturalWidth > 200 || img.width > 200) {
        seen.add(src);
        images.push({
          url: src,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          alt: img.alt || 'image'
        });
      }
    });

    return images;
  }

  // Gửi thông tin Media về Background
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

  // Lắng nghe yêu cầu quét nâng cao từ Popup UI
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SCAN_PAGE_IMAGES') {
      const images = scanImages();
      sendResponse({ success: true, images });
      return true;
    }

    if (request.action === 'SCAN_CANVAS_PAGES') {
      const canvases = document.querySelectorAll('canvas');
      const pageCanvases = [];
      canvases.forEach((c, i) => {
        if (c.width > 300 && c.height > 300) {
          try {
            pageCanvases.push({
              index: i + 1,
              dataUrl: c.toDataURL('image/jpeg', 0.9)
            });
          } catch (e) {}
        }
      });
      sendResponse({ success: true, pages: pageCanvases });
      return true;
    }
  });

  // Chạy quét khi DOM tải xong
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanDOMMedia);
  } else {
    scanDOMMedia();
  }

  // Quan sát khi DOM có thêm video (lazy-loaded / infinite scroll)
  const observer = new MutationObserver(() => {
    scanDOMMedia();
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });
})();
