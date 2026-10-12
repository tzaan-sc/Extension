// OmniLoader - Content Script (Tự động nhận diện tài liệu Canvas, Ảnh nhiều trang & PDF nhúng)

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

      const isPdf = url.toLowerCase().includes('.pdf');
      const isM3u8 = url.includes('.m3u8');
      const isAudio = url.includes('.mp3') || url.includes('.m4a') || url.includes('.wav');

      const ext = isPdf ? 'pdf' : (isM3u8 ? 'm3u8' : (isAudio ? 'mp3' : 'mp4'));
      const cat = isPdf ? 'document' : (isAudio ? 'audio' : 'video');
      const typ = isPdf ? 'document' : (isM3u8 ? 'hls' : (isAudio ? 'audio' : 'video'));
      const fmt = isPdf ? 'Tài liệu PDF' : (isM3u8 ? 'HLS Stream (m3u8)' : (isAudio ? 'Audio Stream' : 'Video MP4'));

      reportSingleMedia({
        id: `sniff_${url.split('?')[0].substr(-25)}`,
        url: url,
        filename: `${sanitizeFilename(title || document.title)}.${ext === 'm3u8' ? 'mp4' : ext}`,
        type: typ,
        category: cat,
        ext: ext,
        format: fmt,
        source: 'dom_hook'
      });
    }

    if (event.data.type === 'OMNILOADER_YOUTUBE_DATA') {
      handleYouTubeData(event.data);
    }

    if (event.data.type === 'OMNI_START_REGION_SCAN') {
      if (window.__omniStartRegionCapture) {
        window.__omniStartRegionCapture();
      } else {
        chrome.runtime.sendMessage({ action: 'TRIGGER_REGION_SCAN_TAB' });
      }
    }
  });

  function handleYouTubeData(data) {
    const { videoDetails, streamingData, captionTracks } = data;
    if (!streamingData) return;

    const title = videoDetails?.title || document.title;
    const thumbnail = videoDetails?.thumbnail?.thumbnails?.slice(-1)[0]?.url || '';
    const batchItems = [];

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

  // Quét toàn diện DOM
  function scanDOMMedia() {
    if (window.location.hostname.includes('youtube.com')) return;

    const batch = [];

    // Video
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

    // Audio
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

    // 3. Tài liệu PDF nhúng (Embed, Object, Iframe, Link)
    const pdfSelectors = [
      'embed[type="application/pdf"]',
      'embed[src*=".pdf" i]',
      'object[type="application/pdf"]',
      'object[data*=".pdf" i]',
      'iframe[src*=".pdf" i]',
      'a[href*=".pdf" i]'
    ];
    document.querySelectorAll(pdfSelectors.join(', ')).forEach((el, idx) => {
      const src = el.src || el.data || el.href;
      if (src && !src.includes('&range=')) {
        batch.push({
          id: `dom_doc_${idx}_${src.substring(0, 35)}`,
          url: src,
          filename: `${sanitizeFilename(document.title || 'Tai_Lieu')}.pdf`,
          type: 'document',
          category: 'document',
          ext: 'pdf',
          format: 'Tài liệu PDF',
          source: 'dom'
        });
      }
    });

    // 4. Nhận diện Google Drive / Google Docs / Sheets / Slides trực tiếp trên trang
    const href = window.location.href;
    const driveMatch = href.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                       href.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      const fileId = driveMatch[1];
      batch.push({
        id: `gdrive_file_${fileId}`,
        url: `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`,
        filename: `${sanitizeFilename(document.title || 'GoogleDrive_File')}.pdf`,
        title: document.title || 'Google Drive File',
        type: 'document',
        category: 'document',
        ext: 'pdf',
        format: 'Google Drive Document (Gốc)',
        sizeFormatted: 'Google Drive',
        source: 'google_drive'
      });
    }

    const docsMatch = href.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (docsMatch) {
      batch.push({
        id: `gdocs_${docsMatch[1]}`,
        url: `https://docs.google.com/document/d/${docsMatch[1]}/export?format=pdf`,
        filename: `${sanitizeFilename(document.title || 'GoogleDoc')}.pdf`,
        title: document.title || 'Google Doc',
        type: 'document',
        category: 'document',
        ext: 'pdf',
        format: 'Google Docs (Xuất PDF)',
        sizeFormatted: 'Google Docs',
        source: 'google_drive'
      });
    }

    // 5. Tài liệu Canvas & Ảnh nhiều trang học liệu (Google Drive view-only, Scribd, Studocu, Quizlet...)
    const canvases = Array.from(document.querySelectorAll('canvas')).filter(c => c.width > 120 && c.height > 120);
    const driveImgs = Array.from(document.querySelectorAll('img')).filter(img => {
      const src = img.src || '';
      return (src.startsWith('blob:') || src.includes('googleusercontent.com') || src.includes('drive.google.com')) &&
             (img.naturalWidth > 200 || img.width > 200);
    });

    const docPagesCount = Math.max(canvases.length, driveImgs.length);
    if (docPagesCount > 0) {
      batch.push({
        id: `canvas_doc_${docPagesCount}p`,
        url: window.location.href,
        title: document.title || 'Tài liệu học tập',
        filename: `${sanitizeFilename(document.title || 'Tai_Lieu')}.pdf`,
        type: 'canvas_pdf',
        category: 'document',
        ext: 'pdf',
        quality: `${docPagesCount} trang`,
        format: `Tài liệu (${docPagesCount} trang)`,
        sizeFormatted: `${docPagesCount} trang PDF`,
        source: 'dom_canvas'
      });
    }

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
  setInterval(scanDOMMedia, 2000);
})();
