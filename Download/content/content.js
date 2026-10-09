// OmniLoader - Content Script (Đầy đủ độ phân giải 4K, 1080p, 720p, 480p, 360p, MP3)

(function () {
  'use strict';

  function injectMainWorldScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('content/injected.js');
      script.onload = function () { this.remove(); };
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {}
  }
  injectMainWorldScript();

  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || !event.data.type) return;

    if (event.data.type === 'OMNILOADER_SNIFFED_URL') {
      const { url, title } = event.data;
      const isM3u8 = url.includes('.m3u8');
      const isAudio = url.includes('.mp3') || url.includes('.m4a') || url.includes('.wav');

      reportMedia({
        id: `sniff_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        url: url,
        filename: `${sanitizeFilename(title || document.title)}.${isM3u8 ? 'mp4' : (isAudio ? 'mp3' : 'mp4')}`,
        type: isM3u8 ? 'hls' : (isAudio ? 'audio' : 'video'),
        category: isAudio ? 'audio' : 'video',
        ext: isM3u8 ? 'm3u8' : (isAudio ? 'mp3' : 'mp4'),
        format: isM3u8 ? 'HLS Stream (m3u8)' : (isAudio ? 'Audio Stream' : 'Direct Video'),
        source: 'dom_hook'
      });
    }

    if (event.data.type === 'OMNILOADER_YOUTUBE_DATA') {
      handleYouTubeData(event.data);
    }
  });

  // Bóc tách toàn bộ độ phân giải YouTube
  function handleYouTubeData(data) {
    const { videoDetails, streamingData } = data;
    if (!streamingData) return;

    const title = videoDetails?.title || document.title;
    const thumbnail = videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';

    // 1. Phân tích Formats (360p / 720p chuẩn)
    if (streamingData.formats) {
      streamingData.formats.forEach((fmt, idx) => {
        const directUrl = fmt.url || extractCipherUrl(fmt);
        if (!directUrl) return;

        const label = fmt.qualityLabel || (fmt.height ? `${fmt.height}p` : '360p');
        reportMedia({
          id: `yt_std_${fmt.itag || idx}_${label}`,
          url: directUrl,
          filename: `${sanitizeFilename(title)} [${label}].mp4`,
          title: title,
          quality: `${label} (MP4 Có tiếng)`,
          thumbnail: thumbnail,
          type: 'video',
          category: 'video',
          ext: 'mp4',
          format: `Video MP4 (${label})`,
          size: fmt.contentLength ? parseInt(fmt.contentLength, 10) : 0,
          source: 'youtube'
        });
      });
    }

    // 2. Phân tích Adaptive Formats (1080p Full HD, 2K, 4K, 720p60, 480p, Audio M4A)
    if (streamingData.adaptiveFormats) {
      streamingData.adaptiveFormats.forEach((fmt, idx) => {
        const directUrl = fmt.url || extractCipherUrl(fmt);
        if (!directUrl) return;

        const isAudio = fmt.mimeType && fmt.mimeType.startsWith('audio/');
        
        if (isAudio) {
          const bitrate = Math.round((fmt.bitrate || 128000) / 1000);
          const label = `${bitrate}kbps`;
          reportMedia({
            id: `yt_audio_${fmt.itag || idx}_${label}`,
            url: directUrl,
            filename: `${sanitizeFilename(title)} [Audio ${label}].m4a`,
            title: title,
            quality: `Âm thanh (${label})`,
            thumbnail: thumbnail,
            type: 'audio',
            category: 'audio',
            ext: 'm4a',
            format: `Âm thanh M4A/MP3 (${label})`,
            size: fmt.contentLength ? parseInt(fmt.contentLength, 10) : 0,
            source: 'youtube'
          });
        } else {
          const label = fmt.qualityLabel || (fmt.height ? `${fmt.height}p` : 'HD');
          reportMedia({
            id: `yt_video_${fmt.itag || idx}_${label}`,
            url: directUrl,
            filename: `${sanitizeFilename(title)} [${label}].mp4`,
            title: title,
            quality: `${label} (Hình ảnh sắc nét)`,
            thumbnail: thumbnail,
            type: 'video',
            category: 'video',
            ext: 'mp4',
            format: `Video HD (${label})`,
            size: fmt.contentLength ? parseInt(fmt.contentLength, 10) : 0,
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

  function scanDOMMedia() {
    document.querySelectorAll('video').forEach((video, idx) => {
      let src = video.currentSrc || video.src;
      if (!src) {
        const source = video.querySelector('source');
        if (source) src = source.src;
      }
      if (src && !src.startsWith('blob:')) {
        reportMedia({
          id: `dom_vid_${idx}_${src.substring(0, 30)}`,
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

    document.querySelectorAll('audio').forEach((audio, idx) => {
      let src = audio.currentSrc || audio.src;
      if (!src) {
        const source = audio.querySelector('source');
        if (source) src = source.src;
      }
      if (src && !src.startsWith('blob:')) {
        reportMedia({
          id: `dom_aud_${idx}_${src.substring(0, 30)}`,
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
  }

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

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SCAN_DOM_NOW') {
      scanDOMMedia();
      sendResponse({ success: true });
      return true;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanDOMMedia);
  } else {
    scanDOMMedia();
  }
  setInterval(scanDOMMedia, 2500);
})();
