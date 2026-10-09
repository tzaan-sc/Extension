// OmniLoader - Content Script (Bóc tách chuẩn xác Video / Audio / Phụ đề)

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
      if (url.includes('&range=') || url.includes('chunk_')) return;

      const isM3u8 = url.includes('.m3u8');
      const isAudio = url.includes('.mp3') || url.includes('.m4a') || url.includes('.wav');

      reportSingleMedia({
        id: `sniff_${url.split('?')[0].substr(-25)}`,
        url: url,
        filename: `${sanitizeFilename(title || document.title)}.${isM3u8 ? 'mp4' : (isAudio ? 'mp3' : 'mp4')}`,
        type: isM3u8 ? 'hls' : (isAudio ? 'audio' : 'video'),
        category: isAudio ? 'audio' : 'video',
        ext: isM3u8 ? 'm3u8' : (isAudio ? 'mp3' : 'mp4'),
        format: isM3u8 ? 'HLS Stream (m3u8)' : (isAudio ? 'Audio Stream' : 'Video MP4'),
        source: 'dom_hook'
      });
    }

    if (event.data.type === 'OMNILOADER_YOUTUBE_DATA') {
      handleYouTubeData(event.data);
    }
  });

  function handleYouTubeData(data) {
    const { videoDetails, streamingData, captionTracks } = data;
    if (!streamingData) return;

    const title = videoDetails?.title || document.title;
    const thumbnail = videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
    const batchItems = [];

    // 1. Phân tích Formats (360p / 720p Video + Audio hoàn chỉnh)
    if (streamingData.formats) {
      streamingData.formats.forEach((fmt) => {
        const directUrl = fmt.url || extractCipherUrl(fmt);
        if (!directUrl) return;

        const height = fmt.height || 360;
        const qualityName = getQualityLabel(height);

        batchItems.push({
          id: `yt_std_${height}p`,
          url: directUrl,
          filename: `${sanitizeFilename(title)} [${height}p].mp4`,
          title: title,
          quality: `${qualityName} (${height}p)`,
          resolution: `${height}p`,
          thumbnail: thumbnail,
          type: 'video',
          category: 'video',
          ext: 'mp4',
          format: `${qualityName} (${height}p)`,
          size: fmt.contentLength ? parseInt(fmt.contentLength, 10) : 0,
          source: 'youtube'
        });
      });
    }

    // 2. Phân tích Adaptive Formats (1080p, 720p, 480p, 240p, 144p & Audio)
    if (streamingData.adaptiveFormats) {
      streamingData.adaptiveFormats.forEach((fmt) => {
        const directUrl = fmt.url || extractCipherUrl(fmt);
        if (!directUrl) return;

        const isAudio = fmt.mimeType && fmt.mimeType.startsWith('audio/');
        
        if (isAudio) {
          const bitrate = Math.round((fmt.bitrate || 128000) / 1000);
          batchItems.push({
            id: `yt_audio_${bitrate}k`,
            url: directUrl,
            filename: `${sanitizeFilename(title)} [Audio ${bitrate}kbps].mp3`,
            title: title,
            quality: `Audio ${bitrate}kbps`,
            resolution: `${bitrate}kbps`,
            thumbnail: thumbnail,
            type: 'audio',
            category: 'audio',
            ext: 'mp3',
            format: `Âm thanh (${bitrate}kbps)`,
            size: fmt.contentLength ? parseInt(fmt.contentLength, 10) : 0,
            source: 'youtube'
          });
        } else if (fmt.height) {
          const height = fmt.height;
          const qualityName = getQualityLabel(height);

          batchItems.push({
            id: `yt_adapt_${height}p`,
            url: directUrl,
            filename: `${sanitizeFilename(title)} [${height}p].mp4`,
            title: title,
            quality: `${qualityName} (${height}p)`,
            resolution: `${height}p`,
            thumbnail: thumbnail,
            type: 'video',
            category: 'video',
            ext: 'mp4',
            format: `${qualityName} (${height}p)`,
            size: fmt.contentLength ? parseInt(fmt.contentLength, 10) : 0,
            source: 'youtube'
          });
        }
      });
    }

    // 3. Phân tích Phụ đề
    if (captionTracks && captionTracks.length > 0) {
      captionTracks.forEach((cap, idx) => {
        if (cap.baseUrl) {
          const langName = cap.name?.simpleText || cap.languageCode || 'Phụ đề';
          batchItems.push({
            id: `yt_sub_${cap.languageCode || idx}`,
            url: cap.baseUrl,
            filename: `${sanitizeFilename(title)} [${langName}].srt`,
            title: title,
            quality: langName,
            resolution: 'Phụ đề',
            thumbnail: thumbnail,
            type: 'subtitle',
            category: 'document',
            ext: 'srt',
            format: `Phụ đề (${langName})`,
            size: 0,
            source: 'youtube'
          });
        }
      });
    }

    if (batchItems.length > 0) {
      chrome.runtime.sendMessage({
        action: 'ADD_BATCH_MEDIA',
        items: batchItems
      });
    }
  }

  function getQualityLabel(height) {
    if (height >= 2160) return '4K Siêu nét';
    if (height >= 1440) return '2K QHD';
    if (height >= 1080) return 'Full HD';
    if (height >= 720) return 'HD';
    if (height >= 480) return 'Tiêu chuẩn';
    if (height >= 360) return 'Trung bình';
    if (height >= 240) return 'Thấp';
    return 'Di động (144p)';
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
    // Bỏ qua quét DOM video trên YouTube vì YouTube đã có bộ bóc tách riêng sạch sẽ
    if (window.location.hostname.includes('youtube.com')) return;

    const batch = [];
    document.querySelectorAll('video').forEach((video, idx) => {
      let src = video.currentSrc || video.src;
      if (!src) {
        const source = video.querySelector('source');
        if (source) src = source.src;
      }
      if (src && !src.startsWith('blob:') && !src.includes('&range=')) {
        batch.push({
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
      if (src && !src.startsWith('blob:') && !src.includes('&range=')) {
        batch.push({
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

    if (batch.length > 0) {
      chrome.runtime.sendMessage({
        action: 'ADD_BATCH_MEDIA',
        items: batch
      });
    }
  }

  function reportSingleMedia(item) {
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
      .substring(0, 100);
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
  setInterval(scanDOMMedia, 3000);
})();
