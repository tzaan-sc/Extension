// Content script running on YouTube page
(function () {
  let cachedTracks = [];
  let currentVideoDetails = null;
  let pendingDataResolvers = [];
  let pendingSubtitleResolvers = {};

  function injectMainScript() {
    if (document.getElementById('yt-dictation-injected')) return;
    try {
      const script = document.createElement('script');
      script.id = 'yt-dictation-injected';
      script.src = chrome.runtime.getURL('content/injected.js');
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      console.warn('[YT-Dictation] Error injecting main script:', e);
    }
  }

  injectMainScript();

  // Listen for messages from injected page script
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'yt-dictation-page') {
      return;
    }

    if (event.data.type === 'FETCH_SUBTITLES_IN_PAGE_RESPONSE') {
      const resolver = pendingSubtitleResolvers[event.data.requestId];
      if (resolver) {
        delete pendingSubtitleResolvers[event.data.requestId];
        if (event.data.success && event.data.rawText) {
          const segs = SubtitleParser.parse(event.data.rawText);
          resolver(segs);
        } else {
          resolver(null);
        }
      }
      return;
    }

    if (event.data.type === 'RESPONSE_CAPTIONS_TRACKS' || event.data.type === 'VIDEO_CHANGED') {
      cachedTracks = event.data.tracks || [];
      currentVideoDetails = event.data.videoDetails || {};

      // Resolve pending GET_VIDEO_DATA requests
      while (pendingDataResolvers.length > 0) {
        const resolve = pendingDataResolvers.shift();
        resolve({
          tracks: cachedTracks,
          videoDetails: currentVideoDetails
        });
      }

      chrome.runtime.sendMessage({
        type: event.data.type,
        tracks: cachedTracks,
        videoDetails: currentVideoDetails
      }).catch(() => {});
    }
  });

  function getVideoElement() {
    return document.querySelector('video.html5-main-video') || document.querySelector('video');
  }

  // Setup video timeupdate sync
  let lastTimeUpdate = 0;
  function setupVideoListeners() {
    const video = getVideoElement();
    if (!video || video._ytDictationBound) return;
    video._ytDictationBound = true;

    video.addEventListener('timeupdate', () => {
      const now = Date.now();
      if (now - lastTimeUpdate > 200) {
        lastTimeUpdate = now;
        chrome.runtime.sendMessage({
          type: 'VIDEO_TIME_UPDATE',
          currentTime: video.currentTime,
          paused: video.paused,
          duration: video.duration,
          playbackRate: video.playbackRate
        }).catch(() => {});
      }
    });

    video.addEventListener('pause', () => {
      chrome.runtime.sendMessage({
        type: 'VIDEO_STATE_CHANGE',
        paused: true,
        currentTime: video.currentTime
      }).catch(() => {});
    });

    video.addEventListener('play', () => {
      chrome.runtime.sendMessage({
        type: 'VIDEO_STATE_CHANGE',
        paused: false,
        currentTime: video.currentTime
      }).catch(() => {});
    });
  }

  setInterval(setupVideoListeners, 1000);

  // Fetch subtitles helper with in-page context and format fallbacks
  async function fetchSubtitleSegments(baseUrl) {
    if (!baseUrl) return [];
    const base = baseUrl.startsWith('//') ? `https:${baseUrl}` : baseUrl;

    // 1. First priority: In-page fetch (running in YouTube's main context with full cookies & session)
    try {
      const requestId = 'req_' + Math.random().toString(36).substring(2, 9);
      const inPageResult = await new Promise((resolve) => {
        const timer = setTimeout(() => {
          delete pendingSubtitleResolvers[requestId];
          resolve(null);
        }, 2000);

        pendingSubtitleResolvers[requestId] = (result) => {
          clearTimeout(timer);
          resolve(result);
        };

        window.postMessage({
          source: 'yt-dictation-cs',
          type: 'FETCH_SUBTITLES_IN_PAGE',
          requestId: requestId,
          baseUrl: base
        }, '*');
      });

      if (inPageResult && inPageResult.length > 0) {
        return inPageResult;
      }
    } catch (e) {
      console.warn('[YT-Dictation] In-page fetch error:', e);
    }

    // Helper fetch with credentials
    async function safeFetch(url) {
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return null;
        return await res.text();
      } catch (e) {
        return null;
      }
    }

    // 2. Direct fetch fallback: Try URL + &fmt=json3
    try {
      const jsonUrl = base.includes('fmt=') ? base.replace(/fmt=[^&]+/, 'fmt=json3') : `${base}&fmt=json3`;
      const text = await safeFetch(jsonUrl);
      if (text) {
        const segs = SubtitleParser.parse(text);
        if (segs && segs.length > 0) return segs;
      }
    } catch (e) {}

    // 3. Try raw base URL
    try {
      const text = await safeFetch(base);
      if (text) {
        const segs = SubtitleParser.parse(text);
        if (segs && segs.length > 0) return segs;
      }
    } catch (e) {}

    // 4. Try URL + &fmt=srv3
    try {
      const srv3Url = base.includes('fmt=') ? base.replace(/fmt=[^&]+/, 'fmt=srv3') : `${base}&fmt=srv3`;
      const text = await safeFetch(srv3Url);
      if (text) {
        const segs = SubtitleParser.parse(text);
        if (segs && segs.length > 0) return segs;
      }
    } catch (e) {}

    // 5. Try URL + &fmt=srv1
    try {
      const srv1Url = base.includes('fmt=') ? base.replace(/fmt=[^&]+/, 'fmt=srv1') : `${base}&fmt=srv1`;
      const text = await safeFetch(srv1Url);
      if (text) {
        const segs = SubtitleParser.parse(text);
        if (segs && segs.length > 0) return segs;
      }
    } catch (e) {}

    return [];
  }

  // Handle messages from sidepanel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const video = getVideoElement();

    if (message.type === 'PING') {
      sendResponse({ status: 'PONG', isYouTube: true, hasVideo: !!video });
      return;
    }

    if (message.type === 'GET_VIDEO_DATA') {
      injectMainScript();

      window.postMessage({
        source: 'yt-dictation-cs',
        type: 'REQUEST_CAPTIONS_TRACKS'
      }, '*');

      const timeoutId = setTimeout(() => {
        const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent || document.title.replace(' - YouTube', '');
        sendResponse({
          tracks: cachedTracks,
          videoDetails: currentVideoDetails || { title: title || 'YouTube Video' },
          currentTime: video ? video.currentTime : 0,
          paused: video ? video.paused : true,
          duration: video ? video.duration : 0,
          playbackRate: video ? video.playbackRate : 1
        });
      }, 500);

      pendingDataResolvers.push((data) => {
        clearTimeout(timeoutId);
        sendResponse({
          tracks: data.tracks || cachedTracks,
          videoDetails: data.videoDetails || currentVideoDetails,
          currentTime: video ? video.currentTime : 0,
          paused: video ? video.paused : true,
          duration: video ? video.duration : 0,
          playbackRate: video ? video.playbackRate : 1
        });
      });

      return true; // Async response
    }

    if (message.type === 'FETCH_SUBTITLES') {
      fetchSubtitleSegments(message.baseUrl)
        .then(segments => {
          if (segments && segments.length > 0) {
            sendResponse({ success: true, segments: segments });
          } else {
            sendResponse({ success: false, error: 'Không parse được phụ đề' });
          }
        })
        .catch(err => {
          console.error('[YT-Dictation] Error fetching subtitles:', err);
          sendResponse({ success: false, error: err.message });
        });
      return true; // Async response
    }

    if (message.type === 'SEEK_VIDEO') {
      if (video && typeof message.time === 'number') {
        video.currentTime = Math.max(0, message.time);
        if (message.autoPlay) {
          video.play().catch(() => {});
        }
        sendResponse({ success: true, currentTime: video.currentTime });
      } else {
        sendResponse({ success: false });
      }
    }

    if (message.type === 'PLAY_VIDEO') {
      if (video) {
        video.play().catch(() => {});
        sendResponse({ success: true });
      }
    }

    if (message.type === 'PAUSE_VIDEO') {
      if (video) {
        video.pause();
        sendResponse({ success: true });
      }
    }

    if (message.type === 'SET_PLAYBACK_SPEED') {
      if (video && message.speed) {
        video.playbackRate = message.speed;
        sendResponse({ success: true, speed: video.playbackRate });
      }
    }

    if (message.type === 'RELOAD_PAGE') {
      window.location.reload();
      sendResponse({ success: true });
    }
  });
})();
