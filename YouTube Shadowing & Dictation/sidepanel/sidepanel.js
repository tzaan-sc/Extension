/**
 * YouTube Shadowing & Dictation - Side Panel Controller
 */

(function () {
  // State
  let activeTabId = null;
  let tracks = [];
  let segments = [];
  let currentIndex = 0;
  let isAutoPause = true;
  let isLoop = false;
  let currentSpeed = 1.0;

  // DOM Elements
  const connectionStatus = document.getElementById('connectionStatus');
  const statusText = connectionStatus.querySelector('.status-text');
  const videoTitle = document.getElementById('videoTitle');
  const trackSelect = document.getElementById('trackSelect');
  const btnReloadVideo = document.getElementById('btnReloadVideo');

  // Tabs
  const tabBtns = document.querySelectorAll('.tab-btn');
  const paneDictate = document.getElementById('paneDictate');
  const paneTranscript = document.getElementById('paneTranscript');

  // Sentence & Controls
  const currentSentenceNum = document.getElementById('currentSentenceNum');
  const totalSentenceNum = document.getElementById('totalSentenceNum');
  const totalSegmentsCount = document.getElementById('totalSegmentsCount');
  const sentenceTimeRange = document.getElementById('sentenceTimeRange');
  const dictateProgressBar = document.getElementById('dictateProgressBar');
  const btnPrevSentence = document.getElementById('btnPrevSentence');
  const btnReplaySentence = document.getElementById('btnReplaySentence');
  const btnNextSentence = document.getElementById('btnNextSentence');

  // Settings
  const speedChips = document.querySelectorAll('.speed-chip');
  const toggleAutoPause = document.getElementById('toggleAutoPause');
  const toggleLoop = document.getElementById('toggleLoop');

  // Dictation Input & Actions
  const dictationInput = document.getElementById('dictationInput');
  const btnHint = document.getElementById('btnHint');
  const btnReveal = document.getElementById('btnReveal');
  const btnCheck = document.getElementById('btnCheck');
  const hintContainer = document.getElementById('hintContainer');
  const hintText = document.getElementById('hintText');
  const btnCloseHint = document.getElementById('btnCloseHint');

  // Result Card
  const resultCard = document.getElementById('resultCard');
  const scoreBadge = document.getElementById('scoreBadge');
  const scoreIcon = document.getElementById('scoreIcon');
  const scorePercent = document.getElementById('scorePercent');
  const scoreDesc = document.getElementById('scoreDesc');
  const diffOriginalText = document.getElementById('diffOriginalText');
  const diffUserText = document.getElementById('diffUserText');
  const btnNextAfterCheck = document.getElementById('btnNextAfterCheck');

  // Transcript List
  const transcriptList = document.getElementById('transcriptList');
  const transcriptSearchInput = document.getElementById('transcriptSearchInput');

  // Helpers
  function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Find active YouTube tab
  async function getActiveYouTubeTab() {
    try {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0 && activeTabs[0].url && activeTabs[0].url.includes('youtube.com')) {
        return activeTabs[0];
      }

      // Check all YouTube watch tabs
      const ytWatchTabs = await chrome.tabs.query({ url: '*://*.youtube.com/watch*' });
      if (ytWatchTabs.length > 0) {
        return ytWatchTabs[0];
      }

      const allYtTabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
      return allYtTabs.length > 0 ? allYtTabs[0] : null;
    } catch (e) {
      console.warn('[YT-Dictation] Error querying tabs:', e);
      return null;
    }
  }

  // Send message to content script with auto-injection fallback
  async function sendMessageToContent(message, isRetry = false) {
    const tab = await getActiveYouTubeTab();
    if (!tab || !tab.id) {
      updateStatus(false, 'Chưa mở tab YouTube');
      videoTitle.textContent = 'Hãy mở một video trên YouTube';
      return null;
    }
    activeTabId = tab.id;

    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (e) {
      if (!isRetry && chrome.scripting) {
        try {
          // Attempt to inject content script into the tab dynamically
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content/content.js']
          });
          // Wait briefly for content script to mount
          await new Promise(r => setTimeout(r, 300));
          return await chrome.tabs.sendMessage(tab.id, message);
        } catch (injectErr) {
          console.warn('[YT-Dictation] Injection failed:', injectErr);
        }
      }
      updateStatus(false, 'Vui lòng tải lại trang YouTube (F5)');
      return null;
    }
  }

  function updateStatus(connected, text) {
    if (connected) {
      connectionStatus.classList.add('connected');
      statusText.textContent = text || 'Đã kết nối';
    } else {
      connectionStatus.classList.remove('connected');
      statusText.textContent = text || 'Chưa kết nối';
    }
  }

  // Init Data from YouTube
  async function loadVideoInfo() {
    updateStatus(false, 'Đang kết nối video...');
    const res = await sendMessageToContent({ type: 'GET_VIDEO_DATA' });

    if (res) {
      updateStatus(true, 'Đã kết nối');
      tracks = res.tracks || [];
      if (res.videoDetails && res.videoDetails.title) {
        videoTitle.textContent = res.videoDetails.title;
      }
      populateTrackSelect();
    } else {
      updateStatus(false, 'Nhấn F5 trên YouTube để kích hoạt');
    }
  }

  function populateTrackSelect() {
    trackSelect.innerHTML = '';
    if (!tracks || tracks.length === 0) {
      trackSelect.innerHTML = '<option value="">Không tìm thấy phụ đề (bật CC trên video)</option>';
      trackSelect.disabled = true;
      segments = [];
      renderCurrentSentence();
      renderTranscriptList();
      return;
    }

    trackSelect.disabled = false;
    let selectedIndex = 0;

    tracks.forEach((t, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = `${t.name} (${t.languageCode})${t.isAutoGenerated ? ' [Tự tạo]' : ''}`;
      trackSelect.appendChild(opt);

      // Prioritize English or manual tracks
      if (t.languageCode.startsWith('en') && !t.isAutoGenerated) {
        selectedIndex = i;
      }
    });

    trackSelect.selectedIndex = selectedIndex;
    loadSelectedTrackSubtitles();
  }

  async function loadSelectedTrackSubtitles() {
    const selectedIdx = trackSelect.value;
    if (selectedIdx === '' || !tracks[selectedIdx]) return;

    const track = tracks[selectedIdx];
    updateStatus(true, 'Đang tải phụ đề...');

    const res = await sendMessageToContent({
      type: 'FETCH_SUBTITLES',
      baseUrl: track.baseUrl
    });

    if (res && res.success && res.segments && res.segments.length > 0) {
      segments = res.segments;
      totalSentenceNum.textContent = segments.length;
      totalSegmentsCount.textContent = segments.length;
      currentIndex = 0;
      updateStatus(true, `Sẵn sàng (${segments.length} câu)`);
      renderCurrentSentence();
      renderTranscriptList();
    } else {
      updateStatus(false, 'Lỗi tải phụ đề');
      segments = [];
      totalSentenceNum.textContent = '0';
      totalSegmentsCount.textContent = '0';
      renderTranscriptList();
    }
  }

  // Render Current Sentence for Dictation
  function renderCurrentSentence() {
    if (segments.length === 0) {
      currentSentenceNum.textContent = '0';
      sentenceTimeRange.textContent = '00:00 - 00:00';
      dictateProgressBar.style.width = '0%';
      return;
    }

    const current = segments[currentIndex];
    currentSentenceNum.textContent = (currentIndex + 1).toString();
    sentenceTimeRange.textContent = `${formatTime(current.start)} - ${formatTime(current.end)}`;

    const progress = ((currentIndex + 1) / segments.length) * 100;
    dictateProgressBar.style.width = `${progress}%`;

    // Clear input & results
    dictationInput.value = '';
    dictationInput.focus();
    resultCard.style.display = 'none';
    hintContainer.style.display = 'none';

    highlightActiveTranscriptItem();
  }

  // Play / Replay current sentence
  async function playCurrentSentence() {
    if (segments.length === 0) return;
    const current = segments[currentIndex];
    await sendMessageToContent({
      type: 'SEEK_VIDEO',
      time: current.start,
      autoPlay: true
    });
    dictationInput.focus();
  }

  // Seek to specific segment
  async function seekToSegment(index) {
    if (index < 0 || index >= segments.length) return;
    currentIndex = index;
    renderCurrentSentence();
    await playCurrentSentence();
  }

  // Check dictation result
  function checkDictation() {
    if (segments.length === 0) return;
    const current = segments[currentIndex];
    const userText = dictationInput.value.trim();

    if (!userText) {
      dictationInput.focus();
      return;
    }

    const diffResult = DiffUtils.compare(current.text, userText);

    // Render score badge
    scorePercent.textContent = `${diffResult.accuracy}%`;
    scoreBadge.className = 'result-score-badge';

    if (diffResult.accuracy >= 95) {
      scoreBadge.classList.add('perfect');
      scoreIcon.textContent = '🎉';
      scoreDesc.textContent = 'Xuất sắc!';
    } else if (diffResult.accuracy >= 70) {
      scoreBadge.classList.add('good');
      scoreIcon.textContent = '⚡';
      scoreDesc.textContent = 'Khá tốt!';
    } else {
      scoreBadge.classList.add('retry');
      scoreIcon.textContent = '💪';
      scoreDesc.textContent = 'Cố gắng lên!';
    }

    // Render Original Text
    diffOriginalText.textContent = current.text;

    // Render Diff User Text
    diffUserText.innerHTML = '';
    diffResult.diffSequence.forEach(item => {
      const span = document.createElement('span');
      span.className = `token ${item.type}`;
      if (item.type === 'correct') {
        span.textContent = item.user;
      } else if (item.type === 'extra') {
        span.textContent = item.user;
      } else if (item.type === 'missing') {
        span.textContent = item.orig;
      }
      diffUserText.appendChild(span);
    });

    resultCard.style.display = 'flex';
  }

  // Next / Prev sentence navigation
  function nextSentence() {
    if (currentIndex < segments.length - 1) {
      seekToSegment(currentIndex + 1);
    }
  }

  function prevSentence() {
    if (currentIndex > 0) {
      seekToSegment(currentIndex - 1);
    }
  }

  // Hint logic
  function showHint() {
    if (segments.length === 0) return;
    const current = segments[currentIndex];
    hintText.textContent = DiffUtils.generateHint(current.text, 1);
    hintContainer.style.display = 'block';
  }

  // Reveal answer
  function revealAnswer() {
    if (segments.length === 0) return;
    const current = segments[currentIndex];
    dictationInput.value = current.text;
    checkDictation();
  }

  // Render all transcript items
  function renderTranscriptList(filterQuery = '') {
    transcriptList.innerHTML = '';
    if (segments.length === 0) {
      transcriptList.innerHTML = '<div class="empty-state">Chưa có phụ đề nào. Vui lòng mở video YouTube và chọn phụ đề ở trên.</div>';
      return;
    }

    const q = filterQuery.toLowerCase().trim();
    let count = 0;

    segments.forEach((seg, idx) => {
      if (q && !seg.text.toLowerCase().includes(q)) {
        return;
      }
      count++;

      const item = document.createElement('div');
      item.className = `transcript-item ${idx === currentIndex ? 'active' : ''}`;
      item.dataset.index = idx;

      item.innerHTML = `
        <span class="transcript-time">${formatTime(seg.start)}</span>
        <span class="transcript-text">${escapeHtml(seg.text)}</span>
      `;

      item.addEventListener('click', () => {
        switchTab('dictate');
        seekToSegment(idx);
      });

      transcriptList.appendChild(item);
    });

    if (count === 0) {
      transcriptList.innerHTML = '<div class="empty-state">Không tìm thấy câu phù hợp.</div>';
    }
  }

  function highlightActiveTranscriptItem() {
    const items = transcriptList.querySelectorAll('.transcript-item');
    items.forEach(el => {
      const idx = parseInt(el.dataset.index, 10);
      if (idx === currentIndex) {
        el.classList.add('active');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        el.classList.remove('active');
      }
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function switchTab(tabId) {
    tabBtns.forEach(btn => {
      if (btn.dataset.tab === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (tabId === 'dictate') {
      paneDictate.classList.add('active');
      paneTranscript.classList.remove('active');
    } else {
      paneDictate.classList.remove('active');
      paneTranscript.classList.add('active');
    }
  }

  // Handle messages from content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'VIDEO_CHANGED') {
      loadVideoInfo();
    }

    if (message.type === 'VIDEO_TIME_UPDATE') {
      const currentTime = message.currentTime;

      if (segments.length > 0 && currentIndex < segments.length) {
        const current = segments[currentIndex];

        // Auto-pause check: when currentTime passes segment end
        if (isAutoPause && currentTime >= current.end && !message.paused) {
          if (isLoop) {
            sendMessageToContent({
              type: 'SEEK_VIDEO',
              time: current.start,
              autoPlay: true
            });
          } else {
            sendMessageToContent({ type: 'PAUSE_VIDEO' });
          }
        }
      }
    }
  });

  // Setup Event Listeners
  function initEventListeners() {
    btnReloadVideo.addEventListener('click', loadVideoInfo);
    const btnRefreshTab = document.getElementById('btnRefreshTab');
    if (btnRefreshTab) {
      btnRefreshTab.addEventListener('click', async () => {
        const tab = await getActiveYouTubeTab();
        if (tab && tab.id) {
          chrome.tabs.reload(tab.id);
          updateStatus(false, 'Đang tải lại trang YouTube...');
          setTimeout(loadVideoInfo, 2000);
        }
      });
    }
    trackSelect.addEventListener('change', loadSelectedTrackSubtitles);

    // Auto reload when tab changes
    chrome.tabs.onActivated.addListener(() => {
      setTimeout(loadVideoInfo, 300);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com')) {
        setTimeout(loadVideoInfo, 300);
      }
    });

    // Tabs
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Playback Controls
    btnReplaySentence.addEventListener('click', playCurrentSentence);
    btnNextSentence.addEventListener('click', nextSentence);
    btnPrevSentence.addEventListener('click', prevSentence);
    btnNextAfterCheck.addEventListener('click', nextSentence);

    // Speed Chips
    speedChips.forEach(chip => {
      chip.addEventListener('click', async () => {
        speedChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        currentSpeed = parseFloat(chip.dataset.speed);
        await sendMessageToContent({
          type: 'SET_PLAYBACK_SPEED',
          speed: currentSpeed
        });
      });
    });

    // Toggle options
    toggleAutoPause.addEventListener('change', (e) => {
      isAutoPause = e.target.checked;
    });

    toggleLoop.addEventListener('change', (e) => {
      isLoop = e.target.checked;
    });

    // Dictation Actions
    btnCheck.addEventListener('click', checkDictation);
    btnHint.addEventListener('click', showHint);
    btnReveal.addEventListener('click', revealAnswer);
    btnCloseHint.addEventListener('click', () => {
      hintContainer.style.display = 'none';
    });

    // Enter to check in dictation input
    dictationInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        checkDictation();
      }
      // Tab to replay sentence
      if (e.key === 'Tab') {
        e.preventDefault();
        playCurrentSentence();
      }
    });

    // Global Hotkeys
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault();
        playCurrentSentence();
        return;
      }

      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        nextSentence();
        return;
      }

      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        prevSentence();
        return;
      }

      if (e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        showHint();
        return;
      }

      if (e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        revealAnswer();
        return;
      }
    });

    // Search filter in transcript tab
    transcriptSearchInput.addEventListener('input', (e) => {
      renderTranscriptList(e.target.value);
    });
  }

  // Initial Boot
  initEventListeners();
  loadVideoInfo();
})();
