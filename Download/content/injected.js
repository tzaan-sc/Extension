// OmniLoader - Main World Injected Hook
// Can thiệp sâu vào DOM, Fetch, XHR, Video Player (YouTube, TikTok, Facebook, Web phim)
// V2: Hook response từ YouTube Player API + Giải mã Signature Cipher + N-Transform chống throttle

(function () {
  'use strict';

  if (window.__omniMainInjected) return;
  window.__omniMainInjected = true;

  // ============================================================
  // 1. Hook Fetch API — Bắt cả request URL lẫn response body
  // ============================================================
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const request = args[0];
    const url = typeof request === 'string' ? request : (request?.url || '');

    // Sniff URL media tổng quát & phát hiện stream YouTube live
    if (url) {
      if (url.includes('googlevideo.com/videoplayback')) {
        handleGoogleVideoPlaybackUrl(url);
      } else {
        checkAndNotifyUrl(url, 'fetch');
      }
    }

    // Gọi fetch gốc
    const response = await originalFetch.apply(this, args);

    // Chặn response từ YouTube Player API để lấy streamingData chính xác nhất
    if (url && (url.includes('/youtubei/v1/player') || url.includes('/get_video_info'))) {
      try {
        const cloned = response.clone();
        const json = await cloned.json();
        if (json && json.streamingData) {
          handleYouTubePlayerResponse(json);
        }
      } catch (e) {}
    }

    return response;
  };

  // ============================================================
  // 2. Hook XMLHttpRequest — Bắt response YouTube Player
  // ============================================================
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__omniUrl = url ? url.toString() : '';
    if (url) {
      const urlStr = url.toString();
      if (urlStr.includes('googlevideo.com/videoplayback')) {
        handleGoogleVideoPlaybackUrl(urlStr);
      } else {
        checkAndNotifyUrl(urlStr, 'xhr');
      }
    }
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (this.__omniUrl && (this.__omniUrl.includes('/youtubei/v1/player') || this.__omniUrl.includes('/get_video_info'))) {
      this.addEventListener('load', function () {
        try {
          const json = JSON.parse(this.responseText);
          if (json && json.streamingData) {
            handleYouTubePlayerResponse(json);
          }
        } catch (e) {}
      });
    }
    return originalXHRSend.apply(this, args);
  };

  // ============================================================
  // 3. Hook HTMLMediaElement.play — Bắt link khi video/audio phát
  // ============================================================
  const originalPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    const src = this.currentSrc || this.src;
    if (src && !src.startsWith('blob:')) {
      checkAndNotifyUrl(src, 'media_play');
    }
    return originalPlay.apply(this, arguments);
  };

  // ============================================================
  // 4. YouTube Signature Decipher Engine
  //    Phân tích base.js để trích xuất hàm giải mã chữ ký
  // ============================================================
  let _decipherFunction = null;
  let _nTransformFunction = null;
  let _decipherReady = false;
  let _decipherPromise = null;

  /**
   * Tìm URL file player JS (base.js) của YouTube trên trang hiện tại
   */
  function getPlayerJsUrl() {
    // Cách 1: Từ thẻ <script> trực tiếp
    const scripts = document.querySelectorAll('script[src*="/base.js"], script[src*="player_ias"], script[src*="player_es6"]');
    for (const s of scripts) {
      if (s.src) return s.src;
    }

    // Cách 2: Từ ytcfg config
    if (window.ytcfg && typeof window.ytcfg.get === 'function') {
      const jsUrl = window.ytcfg.get('PLAYER_JS_URL');
      if (jsUrl) {
        return jsUrl.startsWith('http') ? jsUrl : `https://www.youtube.com${jsUrl}`;
      }
    }

    // Cách 3: Regex tìm trong HTML (cả player_ias lẫn player_es6)
    const pageHtml = document.documentElement.innerHTML;
    const match = pageHtml.match(/\/s\/player\/[a-zA-Z0-9]+\/(?:player_ias|player_es6)\.vflset\/[^"'\s]+?\/base\.js/);
    if (match) {
      return `https://www.youtube.com${match[0]}`;
    }

    return null;
  }

  /**
   * Khởi tạo engine giải mã: Tải base.js và trích xuất decipher + n-transform
   */
  async function initDecipher() {
    if (_decipherReady) return;
    if (_decipherPromise) return _decipherPromise;

    _decipherPromise = (async () => {
      try {
        const playerJsUrl = getPlayerJsUrl();
        if (!playerJsUrl) {
          console.warn('[OmniLoader] Không tìm thấy URL base.js');
          return;
        }

        const resp = await originalFetch(playerJsUrl);
        if (!resp.ok) return;
        const jsCode = await resp.text();

        _decipherFunction = extractDecipherFunction(jsCode);
        _nTransformFunction = extractNTransformFunction(jsCode);
        _decipherReady = true;

        if (_decipherFunction) {
          console.log('[OmniLoader] ✅ Decipher engine đã sẵn sàng');
        } else {
          console.warn('[OmniLoader] ⚠️ Không trích xuất được hàm decipher');
        }
      } catch (e) {
        console.warn('[OmniLoader] Lỗi khởi tạo decipher:', e.message);
      }
    })();

    return _decipherPromise;
  }

  /**
   * Trích xuất hàm giải mã chữ ký từ base.js
   * YouTube dùng pattern: split("") → gọi helper object → join("")
   */
  function extractDecipherFunction(jsCode) {
    // Bước 1: Tìm tên hàm giải mã chính
    const funcNamePatterns = [
      /\b[cs]\s*&&\s*[adf]\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/,
      /\bm=([a-zA-Z0-9$]{2,})\(decodeURIComponent\(h\.s\)\)/,
      /\bc\s*&&\s*d\.set\([^,]+\s*,\s*(?:encodeURIComponent\s*\()([a-zA-Z0-9$]+)\(/,
      /\bc\s*&&\s*[a-z]\.set\([^,]+\s*,\s*([a-zA-Z0-9$]+)\(/,
      /\bc\s*&&\s*[a-z]\.set\([^,]+\s*,\s*encodeURIComponent\(([a-zA-Z0-9$]+)\(/,
    ];

    let funcName = null;
    for (const pattern of funcNamePatterns) {
      const match = jsCode.match(pattern);
      if (match) {
        funcName = match[1];
        break;
      }
    }

    // Fallback: Tìm trực tiếp pattern a.split("")
    if (!funcName) {
      const altMatch = jsCode.match(/([a-zA-Z0-9$]+)\s*=\s*function\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\)/);
      if (altMatch) funcName = altMatch[1];
    }

    if (!funcName) return null;

    // Bước 2: Trích xuất thân hàm
    const escapedName = funcName.replace(/[$]/g, '\\$');
    const funcPattern = new RegExp(
      `(?:var\\s+)?${escapedName}\\s*=\\s*function\\s*\\(\\s*a\\s*\\)\\s*\\{([^}]+)\\}|` +
      `function\\s+${escapedName}\\s*\\(\\s*a\\s*\\)\\s*\\{([^}]+)\\}`
    );
    const funcMatch = jsCode.match(funcPattern);
    if (!funcMatch) return null;

    const funcBody = funcMatch[1] || funcMatch[2];

    // Bước 3: Tìm tên helper object (chứa các thao tác reverse, splice, swap)
    const helperMatch = funcBody.match(/([a-zA-Z0-9$]{2,})\.[a-zA-Z0-9$]{2,}\(/);
    if (!helperMatch) return null;

    const helperName = helperMatch[1];
    const escapedHelper = helperName.replace(/[$]/g, '\\$');

    // Bước 4: Trích xuất helper object
    const helperPattern = new RegExp(
      `var\\s+${escapedHelper}\\s*=\\s*\\{([\\s\\S]*?)\\};`
    );
    const helperObjMatch = jsCode.match(helperPattern);
    if (!helperObjMatch) return null;

    // Bước 5: Tạo hàm thực thi được
    const fullCode = `var ${helperName}={${helperObjMatch[1]}};` +
      `function decipher(a){a=a.split("");${funcBody};return a.join("")}`;

    try {
      const fn = new Function(`${fullCode}; return decipher;`)();
      // Kiểm tra hàm hoạt động (không crash)
      fn('test_string');
      return fn;
    } catch (e) {
      return null;
    }
  }

  /**
   * Trích xuất hàm N-Transform từ base.js
   * YouTube throttle tốc độ tải nếu tham số `n` không được transform đúng cách
   */
  function extractNTransformFunction(jsCode) {
    try {
      // Tìm nơi tham số n được sử dụng
      const nPatterns = [
        /\.get\("n"\)\)&&\(b=([a-zA-Z0-9$]+)(?:\[(\d+)\])?\([\w$]*\)/,
        /b=String\.fromCharCode\(110\),c=a\.get\(b\)\)&&\(c=([a-zA-Z0-9$]+)(?:\[(\d+)\])?\([\w$]*\)/,
      ];

      let funcName = null;
      let arrayIndex = undefined;

      for (const pattern of nPatterns) {
        const match = jsCode.match(pattern);
        if (match) {
          funcName = match[1];
          arrayIndex = match[2];
          break;
        }
      }

      if (!funcName) return null;

      // Nếu tham chiếu qua mảng (array[index])
      if (arrayIndex !== undefined) {
        const escapedArr = funcName.replace(/[$]/g, '\\$');
        const arrayMatch = jsCode.match(new RegExp(`var\\s+${escapedArr}\\s*=\\s*\\[([^\\]]+)\\]`));
        if (arrayMatch) {
          const elements = arrayMatch[1].split(',');
          funcName = elements[parseInt(arrayIndex)].trim();
        }
      }

      // Trích xuất thân hàm n-transform
      const escapedName = funcName.replace(/[$]/g, '\\$');
      const funcPatterns = [
        new RegExp(`${escapedName}\\s*=\\s*function\\s*\\(\\s*a\\s*\\)\\s*\\{((?:(?!\\n\\};)[\\s\\S])+)\\}`, 's'),
        new RegExp(`function\\s+${escapedName}\\s*\\(\\s*a\\s*\\)\\s*\\{((?:(?!\\n\\};)[\\s\\S])+)\\}`, 's'),
      ];

      for (const pattern of funcPatterns) {
        const funcBodyMatch = jsCode.match(pattern);
        if (funcBodyMatch) {
          try {
            const fn = new Function('a', funcBodyMatch[1]);
            // Test
            const testResult = fn('test');
            if (typeof testResult === 'string') return fn;
          } catch (e) {}
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Giải mã 1 signatureCipher thành URL tải được
   */
  function decipherUrl(cipherText) {
    if (!_decipherFunction) return null;
    try {
      const params = new URLSearchParams(cipherText);
      const scrambledSig = params.get('s');
      const sigParam = params.get('sp') || 'sig';
      const url = params.get('url');

      if (!scrambledSig || !url) return null;

      const decipheredSig = _decipherFunction(scrambledSig);
      let finalUrl = `${url}&${sigParam}=${encodeURIComponent(decipheredSig)}`;

      // Áp dụng N-Transform để tránh bị YouTube throttle tốc độ tải
      finalUrl = applyNTransform(finalUrl);

      return finalUrl;
    } catch (e) {
      return null;
    }
  }

  /**
   * Áp dụng N-Transform cho URL (kể cả URL trực tiếp không cần cipher)
   */
  function applyNTransform(url) {
    if (!_nTransformFunction || !url) return url;
    try {
      const urlObj = new URL(url);
      const n = urlObj.searchParams.get('n');
      if (n) {
        const transformedN = _nTransformFunction(n);
        if (typeof transformedN === 'string' && transformedN !== n) {
          urlObj.searchParams.set('n', transformedN);
          return urlObj.toString();
        }
      }
    } catch (e) {}
    return url;
  }

  // ============================================================
  // 5. YouTube Data Handler — Xử lý playerResponse & Innertube API
  // ============================================================
  let _lastVideoId = null;
  let _lastProcessedTime = 0;
  let _lastAndroidVideoId = null;
  const _capturedItags = new Set();

  /**
   * Gọi Innertube API với client ANDROID_VR để lấy direct stream URL sạch
   * Không bị Signature Cipher, có sẵn 360p (video+audio) và audio track trực tiếp
   */
  async function fetchInnertubeAndroid(videoId) {
    if (!videoId) return null;
    try {
      const payload = {
        videoId: videoId,
        context: {
          client: {
            clientName: 'ANDROID_VR',
            clientVersion: '1.61.48',
            deviceMake: 'Oculus',
            deviceModel: 'Quest 3',
            osName: 'Android',
            osVersion: '12',
            hl: 'en',
            gl: 'US'
          }
        }
      };

      const resp = await originalFetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/33.0.0.12.56.574693156 SamsungBrowser/4.0 Chrome/122.0.6261.139 Mobile VR Safari/537.36'
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) return null;
      const data = await resp.json();
      if (data && data.streamingData) {
        return data;
      }
    } catch (e) {
      console.warn('[OmniLoader] Android Innertube fetch error:', e);
    }
    return null;
  }

  /**
   * Bắt các gói tin googlevideo.com/videoplayback từ chính player đang phát
   * Chứa URL đã được ký và xác thực 100% hợp lệ bởi trình duyệt
   */
  function handleGoogleVideoPlaybackUrl(fullUrl) {
    if (!fullUrl || !fullUrl.includes('googlevideo.com/videoplayback')) return;
    try {
      const parsed = new URL(fullUrl);
      const itagStr = parsed.searchParams.get('itag');
      if (!itagStr) return;
      const itag = parseInt(itagStr, 10);

      const dedupeKey = `${itag}_${parsed.searchParams.get('id') || ''}`;
      if (_capturedItags.has(dedupeKey)) return;
      _capturedItags.add(dedupeKey);

      // Xóa các tham số chunk range để chuyển thành URL full stream
      parsed.searchParams.delete('range');
      parsed.searchParams.delete('sq');
      const cleanUrl = parsed.toString();

      window.postMessage({
        type: 'OMNILOADER_YOUTUBE_PLAYBACK_URL',
        itag: itag,
        url: cleanUrl,
        title: document.title.replace(' - YouTube', '').trim()
      }, '*');
    } catch (e) {}
  }

  /**
   * Xử lý playerResponse từ YouTube:
   * 1. Giải mã cipher cho các format bị mã hóa
   * 2. Áp dụng n-transform cho tất cả URL
   * 3. Gửi dữ liệu về content script
   */
  async function handleYouTubePlayerResponse(playerResponse) {
    if (!playerResponse || !playerResponse.streamingData) return;

    const videoId = playerResponse.videoDetails?.videoId;
    const now = Date.now();
    // Tránh xử lý trùng lặp: cùng video trong vòng 10 giây
    if (videoId && videoId === _lastVideoId && (now - _lastProcessedTime) < 10000) return;
    _lastVideoId = videoId;
    _lastProcessedTime = now;

    // Kiểm tra xem có format nào cần giải mã cipher không
    const allFormats = [
      ...(playerResponse.streamingData.formats || []),
      ...(playerResponse.streamingData.adaptiveFormats || [])
    ];
    const hasCipher = allFormats.some(f => f.signatureCipher || f.cipher);

    // Khởi tạo decipher engine nếu cần
    if (hasCipher && !_decipherReady) {
      await initDecipher();
    }

    // Hàm xử lý danh sách format: Giải mã cipher + N-Transform
    const processFormats = (formats) => {
      if (!formats) return [];
      return formats.map(fmt => {
        let url = fmt.url;
        let deciphered = true;

        // Giải mã cipher nếu URL chưa có sẵn
        if (!url && (fmt.signatureCipher || fmt.cipher)) {
          url = decipherUrl(fmt.signatureCipher || fmt.cipher);

          if (!url) {
            deciphered = false;
            try {
              const params = new URLSearchParams(fmt.signatureCipher || fmt.cipher);
              url = params.get('url') || null;
            } catch (e) {}
          }
        }

        // Áp dụng N-Transform cho URL trực tiếp có sẵn (không phải cipher)
        if (url && deciphered && !fmt.signatureCipher && !fmt.cipher) {
          url = applyNTransform(url);
        }

        return { ...fmt, url, _deciphered: deciphered };
      }).filter(fmt => fmt.url);
    };

    const resolvedData = {
      ...playerResponse.streamingData,
      formats: processFormats(playerResponse.streamingData.formats),
      adaptiveFormats: processFormats(playerResponse.streamingData.adaptiveFormats)
    };

    // Gửi dữ liệu đã xử lý về content script
    window.postMessage({
      type: 'OMNILOADER_YOUTUBE_DATA',
      videoDetails: playerResponse.videoDetails,
      streamingData: resolvedData,
      captionTracks: playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
    }, '*');
  }

  // ============================================================
  // 6. YouTube Scanner Đa Tầng (Android Innertube + DOM + Global Player)
  // ============================================================
  async function scanYouTube() {
    if (!window.location.hostname.includes('youtube.com')) return;
    const path = window.location.pathname;
    if (!path.startsWith('/watch') && !path.startsWith('/shorts')) return;

    let videoId = null;
    if (path.startsWith('/watch')) {
      const params = new URLSearchParams(window.location.search);
      videoId = params.get('v');
    } else if (path.startsWith('/shorts/')) {
      videoId = path.split('/')[2];
    }

    // Tầng 1: Lấy stream sạch từ Android Innertube API (Không bị cipher, 100% direct URL)
    if (videoId && videoId !== _lastAndroidVideoId) {
      _lastAndroidVideoId = videoId;
      try {
        const androidData = await fetchInnertubeAndroid(videoId);
        if (androidData && androidData.streamingData &&
            ((androidData.streamingData.formats && androidData.streamingData.formats.length > 0) ||
             (androidData.streamingData.adaptiveFormats && androidData.streamingData.adaptiveFormats.length > 0))) {
          console.log('[OmniLoader] ✅ Bắt được stream sạch từ Android Innertube cho video:', videoId);
          handleYouTubePlayerResponse(androidData);
          return;
        }
      } catch (e) {}
    }

    // Tầng 2: Từ YouTube Player Component hoặc biến toàn cục
    let playerResponse = null;
    const moviePlayer = document.getElementById('movie_player');
    if (moviePlayer && typeof moviePlayer.getPlayerResponse === 'function') {
      try {
        playerResponse = moviePlayer.getPlayerResponse();
      } catch (e) {}
    }

    if (!playerResponse) {
      playerResponse = window.ytInitialPlayerResponse ||
        (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args &&
          (() => { try { return JSON.parse(window.ytplayer.config.args.player_response); } catch (e) { return null; } })());
    }

    if (playerResponse && playerResponse.streamingData) {
      handleYouTubePlayerResponse(playerResponse);
    }
  }

  // ============================================================
  // 7. Generic URL Checker (Chỉ dùng cho các trang NGOÀI YouTube)
  // ============================================================
  function checkAndNotifyUrl(url, source) {
    if (!url || typeof url !== 'string') return;

    // Bỏ qua hoàn toàn mọi URL từ YouTube — xử lý riêng qua handleYouTubePlayerResponse
    if (url.includes('googlevideo.com') || url.includes('youtube.com') || url.includes('youtu.be')) return;

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

  // ============================================================
  // 8. Event Listeners & Khởi động
  // ============================================================

  // SPA Navigation: Reset video ID khi chuyển trang
  window.addEventListener('yt-navigate-finish', () => {
    _lastVideoId = null;
    _lastAndroidVideoId = null;
    _capturedItags.clear();
    setTimeout(scanYouTube, 1500);
  });

  // Page Load: Quét lần đầu
  window.addEventListener('load', () => {
    setTimeout(scanYouTube, 2000);
  });

  // Quét định kỳ dự phòng (ít thường xuyên hơn để tiết kiệm tài nguyên)
  setInterval(scanYouTube, 5000);
})();
