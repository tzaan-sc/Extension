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

  // Universal subtitle parser (JSON3, XML <p>, XML <text>)
  function parseSubtitles(rawData) {
    if (!rawData) return [];

    // 1. Try JSON3 format
    if (typeof rawData === 'string' && (rawData.trim().startsWith('{') || rawData.trim().startsWith('['))) {
      try {
        const json = JSON.parse(rawData);
        if (json && json.events && Array.isArray(json.events)) {
          const segments = [];
          json.events.forEach((ev, idx) => {
            if (!ev.segs || !Array.isArray(ev.segs)) return;
            const text = ev.segs
              .map(s => s.utf8 || '')
              .join('')
              .replace(/[\n\r]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            if (!text || text === '\n') return;
            const start = (ev.tStartMs || 0) / 1000;
            const dur = (ev.dDurationMs || 0) / 1000;
            segments.push({
              id: segments.length,
              start: start,
              end: start + dur,
              duration: dur,
              text: text
            });
          });
          if (segments.length > 0) return segments;
        }
      } catch (e) {
        // Not JSON, continue to XML
      }
    }

    // 2. Try XML format
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(rawData, 'text/xml');
      const segments = [];

      // Check <p t="123" d="456"> (milliseconds)
      const pNodes = xmlDoc.getElementsByTagName('p');
      if (pNodes.length > 0) {
        for (let i = 0; i < pNodes.length; i++) {
          const node = pNodes[i];
          const t = parseFloat(node.getAttribute('t') || '0');
          const d = parseFloat(node.getAttribute('d') || '0');
          const start = t / 1000;
          const dur = d / 1000;

          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = node.textContent || '';
          const text = tempDiv.textContent.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

          if (text) {
            segments.push({
              id: segments.length,
              start: start,
              end: start + dur,
              duration: dur,
              text: text
            });
          }
        }
        if (segments.length > 0) return segments;
      }

      // Check <text start="1.23" dur="4.56"> (seconds)
      const textNodes = xmlDoc.getElementsByTagName('text');
      if (textNodes.length > 0) {
        for (let i = 0; i < textNodes.length; i++) {
          const node = textNodes[i];
          const start = parseFloat(node.getAttribute('start') || '0');
          const dur = parseFloat(node.getAttribute('dur') || '0');

          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = node.textContent || '';
          const text = tempDiv.textContent.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();

          if (text) {
            segments.push({
              id: segments.length,
              start: start,
              end: start + dur,
              duration: dur,
              text: text
            });
          }
        }
        if (segments.length > 0) return segments;
      }
    } catch (e) {
      console.warn('[YT-Dictation] XML parsing error:', e);
    }

    return [];
  }

  // Fetch subtitles helper with format fallbacks
  async function fetchSubtitleSegments(baseUrl) {
    // Attempt 1: Fetch with &fmt=json3
    try {
      const jsonUrl = baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=json3`;
      const res = await fetch(jsonUrl);
      const text = await res.text();
      const segs = parseSubtitles(text);
      if (segs.length > 0) return segs;
    } catch (e) {
      console.warn('[YT-Dictation] JSON3 fetch failed, trying raw URL:', e);
    }

    // Attempt 2: Fetch raw URL
    try {
      const res = await fetch(baseUrl);
      const text = await res.text();
      const segs = parseSubtitles(text);
      if (segs.length > 0) return segs;
    } catch (e) {
      console.warn('[YT-Dictation] Raw URL fetch failed:', e);
    }

    // Attempt 3: Fetch with &fmt=srv1
    try {
      const srvUrl = baseUrl.includes('fmt=') ? baseUrl.replace(/fmt=[^&]+/, 'fmt=srv1') : `${baseUrl}&fmt=srv1`;
      const res = await fetch(srvUrl);
      const text = await res.text();
      const segs = parseSubtitles(text);
      if (segs.length > 0) return segs;
    } catch (e) {
      console.warn('[YT-Dictation] srv1 fetch failed:', e);
    }

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
