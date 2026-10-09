// OmniLoader - Main World Injected Hook
// Can thiệp vào Fetch, XHR và đọc các biến Global của trang (YouTube, TikTok, Canvas, m3u8)

(function () {
  'use strict';

  // 1. Hook Fetch API
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    if (url) {
      checkAndNotifyUrl(url, 'fetch');
    }
    return originalFetch.apply(this, args);
  };

  // 2. Hook XMLHttpRequest
  const originalXHR = window.XMLHttpRequest.prototype.open;
  window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (url) {
      checkAndNotifyUrl(url.toString(), 'xhr');
    }
    return originalXHR.apply(this, [method, url, ...rest]);
  };

  // Kiểm tra URL xem có phải là m3u8, mp4 hoặc streaming blob không
  function checkAndNotifyUrl(url, source) {
    const cleanUrl = url.split('?')[0].toLowerCase();
    if (
      cleanUrl.endsWith('.m3u8') ||
      cleanUrl.endsWith('.mpd') ||
      cleanUrl.endsWith('.mp4') ||
      cleanUrl.endsWith('.m4a') ||
      cleanUrl.endsWith('.pdf') ||
      url.includes('googlevideo.com/videoplayback') ||
      url.includes('v.douyin.com') ||
      url.includes('tiktokcdn.com')
    ) {
      window.postMessage(
        {
          type: 'OMNILOADER_SNIFFED_URL',
          url: url,
          source: source,
          title: document.title
        },
        '*'
      );
    }
  }

  // 3. YouTube Special Sniffer
  function scanYouTube() {
    if (!window.location.hostname.includes('youtube.com')) return;

    try {
      const playerResponse = window.ytInitialPlayerResponse || (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args && JSON.parse(window.ytplayer.config.args.player_response));
      if (playerResponse && playerResponse.streamingData) {
        window.postMessage(
          {
            type: 'OMNILOADER_YOUTUBE_DATA',
            videoDetails: playerResponse.videoDetails,
            streamingData: playerResponse.streamingData,
            captionTracks: playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
          },
          '*'
        );
      }
    } catch (e) {
      // Bỏ qua nếu chưa sẵn sàng
    }
  }

  // Quét định kỳ khi đổi video trên Single Page App (YouTube, TikTok, Facebook)
  setInterval(scanYouTube, 2000);
})();
