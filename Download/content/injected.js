// OmniLoader - Main World Injected Hook
// Can thiệp sâu vào DOM, Fetch, XHR, Video Player (YouTube, TikTok, Facebook, Web phim)

(function () {
  'use strict';

  // 1. Hook Fetch API
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
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

  // 3. Hook HTMLMediaElement để bắt link ngay khi video/audio bắt đầu phát
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const src = this.currentSrc || this.src;
    if (src && !src.startsWith('blob:')) {
      checkAndNotifyUrl(src, 'media_play');
    }
    return originalPlay.apply(this, arguments);
  };

  // Hàm kiểm tra và gửi URL về Content Script
  function checkAndNotifyUrl(url, source) {
    if (!url || typeof url !== 'string') return;
    const cleanUrl = url.split('?')[0].toLowerCase();

    const isMedia = 
      cleanUrl.endsWith('.m3u8') ||
      cleanUrl.endsWith('.mpd') ||
      cleanUrl.endsWith('.mp4') ||
      cleanUrl.endsWith('.webm') ||
      cleanUrl.endsWith('.m4a') ||
      cleanUrl.endsWith('.mp3') ||
      cleanUrl.endsWith('.wav') ||
      cleanUrl.endsWith('.pdf') ||
      cleanUrl.endsWith('.ts') ||
      url.includes('googlevideo.com/videoplayback') ||
      url.includes('tiktokcdn.com') ||
      url.includes('fbcdn.net') ||
      url.includes('cdninstagram.com') ||
      url.includes('twimg.com');

    if (isMedia) {
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

  // 4. Quét sâu YouTube (Hỗ trợ cả SPA navigation & movie_player)
  function scanYouTube() {
    if (!window.location.hostname.includes('youtube.com')) return;

    let playerResponse = null;

    // Cách 1: Lấy trực tiếp từ YouTube Player Component (Chính xác 100% khi chuyển bài)
    const moviePlayer = document.getElementById('movie_player');
    if (moviePlayer && typeof moviePlayer.getPlayerResponse === 'function') {
      try {
        playerResponse = moviePlayer.getPlayerResponse();
      } catch (e) {}
    }

    // Cách 2: Lấy từ biến toàn cục
    if (!playerResponse) {
      playerResponse = window.ytInitialPlayerResponse || 
        (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args && JSON.parse(window.ytplayer.config.args.player_response));
    }

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
  }

  // Lắng nghe sự kiện chuyển video của YouTube (SPA)
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(scanYouTube, 1000);
  });
  window.addEventListener('load', scanYouTube);

  // Quét định kỳ
  setInterval(scanYouTube, 2500);
})();
