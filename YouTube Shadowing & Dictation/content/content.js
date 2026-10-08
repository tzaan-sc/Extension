// Content script running on YouTube page
(function () {
  let cachedTracks = [];
  let currentVideoDetails = null;
  let pendingDataResolvers = [];

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
      if (now - lastTimeUpdate > 200) { // Throttle to 200ms
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

  // Helper to parse timedtext XML
  function parseTimedTextXml(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const textNodes = xmlDoc.getElementsByTagName('text');
    const segments = [];

    for (let i = 0; i < textNodes.length; i++) {
      const node = textNodes[i];
      const start = parseFloat(node.getAttribute('start') || '0');
      const dur = parseFloat(node.getAttribute('dur') || '0');
      const end = start + dur;

      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = node.textContent;
      const text = tempDiv.textContent.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

      if (text) {
        segments.push({
          id: i,
          start: start,
          end: end,
          duration: dur,
          text: text
        });
      }
    }
    return segments;
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

      // Ask injected script for fresh data
      window.postMessage({
        source: 'yt-dictation-cs',
        type: 'REQUEST_CAPTIONS_TRACKS'
      }, '*');

      const timeoutId = setTimeout(() => {
        // Fallback response on timeout
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
      const url = message.baseUrl;
      fetch(url)
        .then(res => res.text())
        .then(xmlData => {
          const segments = parseTimedTextXml(xmlData);
          sendResponse({ success: true, segments: segments });
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
