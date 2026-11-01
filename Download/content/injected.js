// OmniLoader - Main World Injected Hook
// Can thiệp sâu vào DOM, Fetch, XHR, Video Player (YouTube, TikTok, Facebook, Web phim)
// V2: Hook response từ YouTube Player API + Giải mã Signature Cipher + N-Transform chống throttle

(function () {
  'use strict';

  // ============================================================
  // 1. Hook Fetch API — Bắt cả request URL lẫn response body
  // ============================================================
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const request = args[0];
    const url = typeof request === 'string' ? request : (request?.url || '');

    // Sniff URL media tổng quát
    if (url) {
      checkAndNotifyUrl(url, 'fetch');
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
      checkAndNotifyUrl(url.toString(), 'xhr');
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
    const scripts = document.querySelectorAll('script[src*="/base.js"], script[src*="player_ias"]');
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

    // Cách 3: Regex tìm trong HTML
    const pageHtml = document.documentElement.innerHTML;
    const match = pageHtml.match(/\/s\/player\/[a-zA-Z0-9]+\/player_ias\.vflset\/[^"'\s]+?\/base\.js/);
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
  // 5. YouTube Data Handler — Xử lý playerResponse
  // ============================================================
  let _lastVideoId = null;

  /**
   * Xử lý playerResponse từ YouTube:
   * 1. Giải mã cipher cho các format bị mã hóa
   * 2. Áp dụng n-transform cho tất cả URL
   * 3. Gửi dữ liệu về content script
   */
  async function handleYouTubePlayerResponse(playerResponse) {
    if (!playerResponse || !playerResponse.streamingData) return;

    const videoId = playerResponse.videoDetails?.videoId;
    // Tránh xử lý trùng lặp cùng 1 video
    if (videoId && videoId === _lastVideoId) return;
    _lastVideoId = videoId;

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

        // Giải mã cipher nếu URL chưa có sẵn
        if (!url && (fmt.signatureCipher || fmt.cipher)) {
          url = decipherUrl(fmt.signatureCipher || fmt.cipher);
        }

        // Áp dụng N-Transform cho URL trực tiếp (tránh throttle)
        if (url && !fmt.signatureCipher && !fmt.cipher) {
          url = applyNTransform(url);
        }

        return { ...fmt, url };
      }).filter(fmt => fmt.url); // Chỉ giữ format có URL hợp lệ
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
  // 6. Legacy YouTube Scanner (Dự phòng khi hook API không bắt được)
  // ============================================================
  function scanYouTube() {
    if (!window.location.hostname.includes('youtube.com')) return;
    if (!window.location.pathname.startsWith('/watch')) return;

    let playerResponse = null;

    // Cách 1: Từ YouTube Player Component
    const moviePlayer = document.getElementById('movie_player');
    if (moviePlayer && typeof moviePlayer.getPlayerResponse === 'function') {
      try {
        playerResponse = moviePlayer.getPlayerResponse();
      } catch (e) {}
    }

    // Cách 2: Từ biến toàn cục
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
  // 7. Generic URL Checker (Cho các trang không phải YouTube)
  // ============================================================
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

  // ============================================================
  // 8. Event Listeners & Khởi động
  // ============================================================

  // SPA Navigation: Reset video ID khi chuyển trang
  window.addEventListener('yt-navigate-finish', () => {
    _lastVideoId = null;
    setTimeout(scanYouTube, 1500);
  });

  // Page Load: Quét lần đầu
  window.addEventListener('load', () => {
    setTimeout(scanYouTube, 2000);
  });

  // Quét định kỳ dự phòng (ít thường xuyên hơn để tiết kiệm tài nguyên)
  setInterval(scanYouTube, 5000);
})();
