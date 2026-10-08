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
        if (event.data.success) {
          if (event.data.segments && Array.isArray(event.data.segments)) {
            resolver(event.data.segments);
          } else if (event.data.rawText) {
            const segs = SubtitleParser.parse(event.data.rawText);
            resolver(segs);
          } else {
            resolver(null);
          }
        } else {
          resolver(null);
        }
      }
      return;
    }

    if (event.data.type === 'RESPONSE_CAPTIONS_TRACKS' || event.data.type === 'VIDEO_CHANGED') {
      cachedTracks = event.data.tracks || [];
      currentVideoDetails = event.data.videoDetails || {};

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

  // Helper to extract transcript from DOM if available or trigger it
  async function extractFromDomTranscript() {
    try {
      let segmentNodes = document.querySelectorAll('ytd-transcript-segment-renderer');
      if (segmentNodes.length === 0) {
        // Expand description
        const expandBtn = document.querySelector('#expand, ytd-text-inline-expander #expand, #description-inline-expander, #description.ytd-watch-metadata');
        if (expandBtn) {
          expandBtn.click();
          await new Promise(r => setTimeout(r, 200));
        }

        // Try clicking Show Transcript button
        let showBtn = document.querySelector('ytd-video-description-transcript-section-renderer button, ytd-transcript-renderer button, button[aria-label*="transcript" i], button[aria-label*="bản ghi" i]');
        if (!showBtn) {
          const allBtns = Array.from(document.querySelectorAll('button, ytd-button-renderer, .yt-spec-button-shape-next'));
          showBtn = allBtns.find(b => {
            const t = (b.textContent || '').toLowerCase();
            return t.includes('transcript') || t.includes('bản ghi lời thoại') || t.includes('bản ghi');
          });
        }

        if (showBtn) {
          console.log('[YT-Dictation CS] Found and clicking transcript button...');
          showBtn.click();
          for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 100));
            segmentNodes = document.querySelectorAll('ytd-transcript-segment-renderer');
            if (segmentNodes.length > 0) break;
          }
        }
      }

      if (segmentNodes && segmentNodes.length > 0) {
        const segments = [];
        segmentNodes.forEach((node, idx) => {
          const timeText = node.querySelector('.segment-timestamp, .formatted-timestamp')?.textContent?.trim() || '0:00';
          const text = node.querySelector('.segment-text, yt-formatted-string.segment-text')?.textContent?.trim() || '';

          const parts = timeText.split(':').map(p => parseInt(p, 10));
          let start = 0;
          if (parts.length === 3) start = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else if (parts.length === 2) start = parts[0] * 60 + parts[1];

          if (text) {
            segments.push({
              id: idx,
              start: start,
              end: start + 3,
              duration: 3,
              text: text
            });
          }
        });
        for (let i = 0; i < segments.length - 1; i++) {
          segments[i].end = segments[i + 1].start;
          segments[i].duration = parseFloat((segments[i].end - segments[i].start).toFixed(2));
        }
        if (segments.length > 0) {
          console.log('[YT-Dictation CS] Successfully extracted', segments.length, 'segments from DOM!');
          return segments;
        }
      }
    } catch (e) {
      console.warn('[YT-Dictation] DOM transcript extraction failed:', e);
    }
    return null;
  }

  // Helper to extract from video.textTracks cues
  function extractFromTextTracks() {
    try {
      const video = getVideoElement();
      if (video && video.textTracks) {
        for (let i = 0; i < video.textTracks.length; i++) {
          const track = video.textTracks[i];
          if (track.cues && track.cues.length > 0) {
            const segments = [];
            for (let j = 0; j < track.cues.length; j++) {
              const cue = track.cues[j];
              const text = SubtitleParser.cleanText(cue.text);
              if (text) {
                segments.push({
                  id: j,
                  start: parseFloat(cue.startTime.toFixed(2)),
                  end: parseFloat(cue.endTime.toFixed(2)),
                  duration: parseFloat((cue.endTime - cue.startTime).toFixed(2)),
                  text: text
                });
              }
            }
            if (segments.length > 0) return segments;
          }
        }
      }
    } catch (e) {
      console.warn('[YT-Dictation] TextTracks extraction failed:', e);
    }
    return null;
  }

  // Fetch subtitles helper with in-page context and format fallbacks
  async function fetchSubtitleSegments(baseUrl) {
    // 1. First priority: In-page fetch (Innertube + in-page URLs)
    try {
      const requestId = 'req_' + Math.random().toString(36).substring(2, 9);
      const inPageResult = await new Promise((resolve) => {
        const timer = setTimeout(() => {
          delete pendingSubtitleResolvers[requestId];
          resolve(null);
        }, 4000);

        pendingSubtitleResolvers[requestId] = (result) => {
          clearTimeout(timer);
          resolve(result);
        };

        window.postMessage({
          source: 'yt-dictation-cs',
          type: 'FETCH_SUBTITLES_IN_PAGE',
          requestId: requestId,
          baseUrl: baseUrl || ''
        }, '*');
      });

      if (inPageResult && inPageResult.length > 0) {
        return inPageResult;
      }
    } catch (e) {
      console.warn('[YT-Dictation] In-page fetch error:', e);
    }

    // 2. Second priority: Active DOM transcript triggering
    const domSegments = await extractFromDomTranscript();
    if (domSegments && domSegments.length > 0) {
      return domSegments;
    }

    // 3. Third priority: Check HTML5 video textTracks
    const trackSegments = extractFromTextTracks();
    if (trackSegments && trackSegments.length > 0) {
      return trackSegments;
    }

    if (!baseUrl) return [];
    const base = baseUrl.startsWith('//') ? `https:${baseUrl}` : baseUrl;

    // Helper fetch
    async function safeFetch(url) {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.text();
      } catch (e) {
        return null;
      }
    }

    const urlsToTry = [
      base.includes('fmt=') ? base.replace(/fmt=[^&]+/, 'fmt=json3') : `${base}&fmt=json3`,
      base,
      base.includes('fmt=') ? base.replace(/fmt=[^&]+/, 'fmt=srv3') : `${base}&fmt=srv3`,
      base.includes('fmt=') ? base.replace(/fmt=[^&]+/, 'fmt=srv1') : `${base}&fmt=srv1`,
      base.replace('&variant=gemini', '') + '&fmt=json3',
      base.replace('&variant=gemini', '') + '&fmt=srv3',
      base.replace('&variant=gemini', '')
    ];

    for (const u of urlsToTry) {
      const text = await safeFetch(u);
      if (text && text.trim().length > 0) {
        const segs = SubtitleParser.parse(text);
        if (segs && segs.length > 0) return segs;
      }
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

      return true;
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
      return true;
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
