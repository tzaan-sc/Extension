// OmniLoader - Popup UI Controller (Giao diện sạch sẽ, lọc chuẩn xác theo Tab)

function convertTimedTextToSrt(xmlText) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const textNodes = xmlDoc.getElementsByTagName('text');

    if (!textNodes || textNodes.length === 0) return xmlText;

    let srtOutput = '';
    for (let i = 0; i < textNodes.length; i++) {
      const node = textNodes[i];
      const startSec = parseFloat(node.getAttribute('start') || '0');
      const durationSec = parseFloat(node.getAttribute('dur') || '2');
      const endSec = startSec + durationSec;

      const txt = document.createElement('textarea');
      txt.innerHTML = node.textContent || '';
      const cleanText = txt.value;

      const pad = (n, len = 2) => String(n).padStart(len, '0');
      const formatTime = (total) => {
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = Math.floor(total % 60);
        const ms = Math.floor((total % 1) * 1000);
        return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
      };

      srtOutput += `${i + 1}\n${formatTime(startSec)} --> ${formatTime(endSec)}\n${cleanText.trim()}\n\n`;
    }
    return srtOutput;
  } catch (e) {
    return xmlText;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  let currentTab = null;
  let allMedia = [];
  let currentCategory = 'all';

  const mediaContainer = document.getElementById('mediaContainer');
  const emptyState = document.getElementById('emptyState');
  const pageTitleElem = document.getElementById('pageTitle');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const btnRefresh = document.getElementById('btnRefresh');
  const btnScanAudio = document.getElementById('btnScanAudio');
  const btnScanCanvas = document.getElementById('btnScanCanvas');

  // 1. Lấy thông tin tab
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs.length > 0) {
      currentTab = tabs[0];
      pageTitleElem.textContent = currentTab.title || currentTab.url;
      pageTitleElem.title = currentTab.title || currentTab.url;
      await ensureContentScript(currentTab.id);
    }
  } catch (e) {}

  async function ensureContentScript(tabId) {
    if (!currentTab || currentTab.url?.startsWith('chrome://') || currentTab.url?.startsWith('edge://')) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/content.js']
      }).catch(() => {});
    } catch (e) {}
  }

  // 2. Lấy dữ liệu Media từ Background
  function loadMedia() {
    if (!currentTab) return;
    chrome.runtime.sendMessage({ action: 'GET_MEDIA', tabId: currentTab.id }, (res) => {
      if (res && res.success) {
        allMedia = res.data || [];
        updateCounts();
        renderMedia();
      }
    });
  }

  // 3. Cập nhật số lượng trên các tab
  function updateCounts() {
    const counts = {
      all: allMedia.length,
      audio: allMedia.filter(m => m.category === 'audio').length,
      video: allMedia.filter(m => m.category === 'video').length,
      document: allMedia.filter(m => m.category === 'document' || m.type === 'subtitle').length,
    };
    document.getElementById('countAll').textContent = counts.all;
    document.getElementById('countAudio').textContent = counts.audio;
    document.getElementById('countVideo').textContent = counts.video;
    document.getElementById('countDoc').textContent = counts.document;
  }

  // 4. Gom nhóm dữ liệu YouTube
  function groupYouTubeMedia(items) {
    const ytGroups = new Map();
    const otherItems = [];

    items.forEach((item) => {
      if (item.source === 'youtube' && item.title) {
        const key = item.title;
        if (!ytGroups.has(key)) {
          ytGroups.set(key, {
            id: item.id,
            isYouTube: true,
            title: item.title,
            thumbnail: item.thumbnail,
            videos: [],
            audios: [],
            subtitles: []
          });
        }

        const group = ytGroups.get(key);
        if (item.type === 'subtitle') {
          if (!group.subtitles.some(s => s.quality === item.quality)) {
            group.subtitles.push(item);
          }
        } else if (item.category === 'audio') {
          if (!group.audios.some(a => a.quality === item.quality)) {
            group.audios.push(item);
          }
        } else {
          if (!group.videos.some(v => v.resolution === item.resolution)) {
            group.videos.push(item);
          }
        }
      } else {
        otherItems.push(item);
      }
    });

    for (const group of ytGroups.values()) {
      group.videos.sort((a, b) => {
        const hA = parseInt(a.resolution, 10) || 0;
        const hB = parseInt(b.resolution, 10) || 0;
        return hB - hA;
      });
    }

    return [...Array.from(ytGroups.values()), ...otherItems];
  }

  // 5. Render danh sách thẻ Media theo Tab được chọn
  function renderMedia() {
    mediaContainer.querySelectorAll('.media-card, .yt-master-card').forEach(el => el.remove());

    if (allMedia.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';
    const displayList = groupYouTubeMedia(allMedia);
    let renderedCount = 0;

    displayList.forEach((item) => {
      // A. Thẻ YouTube Master Card
      if (item.isYouTube) {
        const showVideo = (currentCategory === 'all' || currentCategory === 'video') && item.videos.length > 0;
        const showAudio = (currentCategory === 'all' || currentCategory === 'audio') && item.audios.length > 0;
        const showSub = (currentCategory === 'all' || currentCategory === 'document') && item.subtitles.length > 0;

        // Nếu không có phần nào thỏa mãn tab lọc thì bỏ qua
        if (!showVideo && !showAudio && !showSub) return;

        renderedCount++;
        const card = document.createElement('div');
        card.className = 'yt-master-card';

        let videoOptions = item.videos.map((v, i) => `
          <option value="v_${i}">${v.quality || v.resolution} (.mp4)</option>
        `).join('');

        let audioOptions = item.audios.map((a, i) => `
          <option value="a_${i}">${a.quality} (.mp3)</option>
        `).join('');

        let subOptions = item.subtitles.map((s, i) => `
          <option value="s_${i}">${s.quality} (.srt)</option>
        `).join('');

        card.innerHTML = `
          <div class="media-info">
            <div class="media-thumb">
              ${item.thumbnail ? `<img src="${item.thumbnail}">` : getFallbackIcon('video')}
            </div>
            <div class="media-details">
              <span class="media-title" title="${item.title}">${item.title}</span>
              <div class="media-tags">
                <span class="badge badge-video">YOUTUBE MEDIA</span>
                <span class="badge badge-audio">${item.videos.length} ĐỘ PHÂN GIẢI</span>
                ${item.subtitles.length > 0 ? `<span class="badge badge-doc">${item.subtitles.length} PHỤ ĐỀ</span>` : ''}
              </div>
            </div>
          </div>

          ${showVideo ? `
            <div class="format-section">
              <div class="section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <span>ĐỘ PHÂN GIẢI VIDEO (.mp4)</span>
              </div>
              <div class="format-row">
                <select class="res-select sel-video">${videoOptions}</select>
                <button class="btn-download btn-dl-video"><span>Tải Video</span></button>
              </div>
            </div>
          ` : ''}

          ${showAudio ? `
            <div class="format-section">
              <div class="section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
                <span>ÂM THANH (.mp3)</span>
              </div>
              <div class="format-row">
                <select class="res-select sel-audio">${audioOptions}</select>
                <button class="btn-download btn-dl-audio"><span>Tải MP3</span></button>
              </div>
            </div>
          ` : ''}

          ${showSub ? `
            <div class="format-section">
              <div class="section-title">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
                <span>PHỤ ĐỀ (.srt)</span>
              </div>
              <div class="format-row">
                <select class="res-select sel-sub">${subOptions}</select>
                <button class="btn-download btn-dl-sub"><span>Tải Phụ Đề</span></button>
              </div>
            </div>
          ` : ''}
        `;

        const btnDlVid = card.querySelector('.btn-dl-video');
        if (btnDlVid) {
          btnDlVid.addEventListener('click', () => {
            const idx = parseInt(card.querySelector('.sel-video').value.replace('v_', ''), 10);
            handleDownload(item.videos[idx]);
          });
        }

        const btnDlAud = card.querySelector('.btn-dl-audio');
        if (btnDlAud) {
          btnDlAud.addEventListener('click', () => {
            const idx = parseInt(card.querySelector('.sel-audio').value.replace('a_', ''), 10);
            handleDownload(item.audios[idx]);
          });
        }

        const btnDlSub = card.querySelector('.btn-dl-sub');
        if (btnDlSub) {
          btnDlSub.addEventListener('click', async () => {
            const idx = parseInt(card.querySelector('.sel-sub').value.replace('s_', ''), 10);
            const subItem = item.subtitles[idx];
            downloadSubtitleAsSrt(subItem);
          });
        }

        mediaContainer.appendChild(card);
        return;
      }

      // B. Thẻ Media thông thường
      if (currentCategory !== 'all' && item.category !== currentCategory) return;

      renderedCount++;
      const card = document.createElement('div');
      card.className = 'media-card';

      const isAudio = item.category === 'audio';
      const isVideo = item.category === 'video';
      const isHls = item.type === 'hls';
      const badgeClass = isAudio ? 'badge-audio' : (isHls ? 'badge-hls' : (isVideo ? 'badge-video' : 'badge-doc'));

      card.innerHTML = `
        <div class="media-info">
          <div class="media-thumb">
            ${isAudio ? getAudioIcon() : (item.thumbnail ? `<img src="${item.thumbnail}">` : getFallbackIcon(item.category))}
          </div>
          <div class="media-details">
            <span class="media-title" title="${item.filename || item.title}">${item.filename || item.title || 'Media file'}</span>
            <div class="media-tags">
              <span class="badge ${badgeClass}">${item.quality || item.format || item.ext}</span>
              <span class="media-size">${item.sizeFormatted || 'Stream'}</span>
            </div>
          </div>
        </div>

        ${isAudio ? `
          <div class="audio-player-preview">
            <audio controls preload="none" src="${item.url}"></audio>
          </div>
        ` : ''}

        <div class="card-actions">
          <button class="btn-download" data-id="${item.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Tải ${isAudio ? 'MP3' : (isHls ? 'MP4 (HLS)' : (item.ext ? item.ext.toUpperCase() : 'Video'))}</span>
          </button>

          ${isVideo && !isHls ? `
            <button class="btn-extract-audio" data-url="${item.url}" title="Chỉ lấy âm thanh MP3 từ video này">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>
              </svg>
              <span>Tách MP3</span>
            </button>
          ` : ''}

          <button class="btn-copy" data-url="${item.url}" title="Sao chép link">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
          </button>
        </div>
      `;

      card.querySelector('.btn-download').addEventListener('click', () => {
        handleDownload(item);
      });

      const btnExtract = card.querySelector('.btn-extract-audio');
      if (btnExtract) {
        btnExtract.addEventListener('click', () => {
          const oldText = btnExtract.innerHTML;
          btnExtract.innerHTML = `<span>⏳ Đang tách...</span>`;
          chrome.runtime.sendMessage({
            action: 'EXTRACT_AUDIO',
            payload: {
              url: item.url,
              filename: item.filename || 'extracted_audio.mp3'
            }
          }, () => {
            setTimeout(() => { btnExtract.innerHTML = oldText; }, 3500);
          });
        });
      }

      card.querySelector('.btn-copy').addEventListener('click', (e) => {
        navigator.clipboard.writeText(item.url);
        const btn = e.currentTarget;
        const oldHtml = btn.innerHTML;
        btn.innerHTML = `<span>✓ Đã chép!</span>`;
        setTimeout(() => { btn.innerHTML = oldHtml; }, 1500);
      });

      mediaContainer.appendChild(card);
    });

    if (renderedCount === 0) {
      emptyState.style.display = 'flex';
    }
  }

  // 6. Tải Phụ đề sang .SRT
  async function downloadSubtitleAsSrt(subItem) {
    try {
      const resp = await fetch(subItem.url);
      const text = await resp.text();
      const srtContent = convertTimedTextToSrt(text);

      const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
      const reader = new FileReader();
      reader.onloadend = () => {
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_DIRECT',
          url: reader.result,
          filename: subItem.filename || 'subtitles.srt'
        });
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      console.error('Lỗi tải phụ đề:', e);
    }
  }

  // 7. Tải file Media
  function handleDownload(item) {
    if (!item || !item.url) return;
    if (item.type === 'hls') {
      chrome.runtime.sendMessage({
        action: 'START_HLS_DOWNLOAD',
        payload: {
          url: item.url,
          filename: item.filename || 'video.mp4',
          downloadId: item.id
        }
      });
    } else {
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_DIRECT',
        url: item.url,
        filename: item.filename || `media_${Date.now()}.${item.ext || 'mp4'}`
      }, (res) => {
        if (!res || !res.success) {
          window.open(item.url, '_blank');
        }
      });
    }
  }

  // 8. Chuyển Tab lọc
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category;
      renderMedia();
    });
  });

  btnScanAudio.addEventListener('click', async () => {
    if (!currentTab) return;
    chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_DOM_NOW' }, () => {
      setTimeout(loadMedia, 400);
    });
    const audioTab = document.querySelector('.tab-btn[data-category="audio"]');
    if (audioTab) audioTab.click();
  });

  btnRefresh.addEventListener('click', () => {
    if (currentTab) {
      chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_DOM_NOW' });
    }
    loadMedia();
  });

  function getAudioIcon() {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
  }

  function getFallbackIcon(category) {
    if (category === 'video') {
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    } else {
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 2 2h12a2 2 0 0 2-2V8z"></path></svg>`;
    }
  }

  loadMedia();
  setInterval(loadMedia, 1500);
});
