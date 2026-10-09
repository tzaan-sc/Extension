// OmniLoader - Popup UI Controller

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

  // 1. Lấy thông tin tab đang hoạt động
  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs.length > 0) {
      currentTab = tabs[0];
      pageTitleElem.textContent = currentTab.title || currentTab.url;
      pageTitleElem.title = currentTab.title || currentTab.url;

      // Tiêm Content Script vào tab nếu tab chưa chạy
      await ensureContentScript(currentTab.id);
    }
  } catch (e) {
    console.error('Error fetching tab:', e);
  }

  // Tự động tiêm script vào tab nếu tab đã mở trước khi cài extension
  async function ensureContentScript(tabId) {
    if (!currentTab || currentTab.url?.startsWith('chrome://') || currentTab.url?.startsWith('edge://')) {
      return;
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/content.js']
      }).catch(() => {});
    } catch (e) {}
  }

  // 2. Tải danh sách media từ Background/Storage
  async function loadMedia() {
    if (!currentTab) return;

    chrome.runtime.sendMessage(
      { action: 'GET_MEDIA', tabId: currentTab.id },
      (response) => {
        if (response && response.success) {
          allMedia = response.data || [];
          updateCounts();
          renderMedia();
        }
      }
    );
  }

  // 3. Cập nhật số lượng
  function updateCounts() {
    const counts = {
      all: allMedia.length,
      audio: allMedia.filter(m => m.category === 'audio').length,
      video: allMedia.filter(m => m.category === 'video').length,
      document: allMedia.filter(m => m.category === 'document').length,
    };

    document.getElementById('countAll').textContent = counts.all;
    document.getElementById('countAudio').textContent = counts.audio;
    document.getElementById('countVideo').textContent = counts.video;
    document.getElementById('countDoc').textContent = counts.document;
  }

  // 4. Render danh sách Media Cards
  function renderMedia() {
    const filtered = currentCategory === 'all'
      ? allMedia
      : allMedia.filter(m => m.category === currentCategory);

    mediaContainer.querySelectorAll('.media-card').forEach(el => el.remove());

    if (filtered.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    filtered.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'media-card';

      const isAudio = item.category === 'audio';
      const badgeClass = isAudio ? 'badge-audio' : (item.category === 'video' ? 'badge-video' : 'badge-doc');

      card.innerHTML = `
        <div class="media-info">
          <div class="media-thumb">
            ${isAudio ? getAudioIcon() : getFallbackIcon(item.category)}
          </div>
          <div class="media-details">
            <span class="media-title" title="${item.filename || item.title}">${item.filename || item.title || 'Âm thanh'}</span>
            <div class="media-tags">
              <span class="badge ${badgeClass}">${item.quality || item.format || item.ext}</span>
              <span class="media-size">${item.sizeFormatted || 'Audio Stream'}</span>
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
            <span>Tải về (${item.ext ? item.ext.toUpperCase() : 'FILE'})</span>
          </button>
          <button class="btn-copy" data-url="${item.url}" title="Sao chép liên kết">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy Link</span>
          </button>
        </div>
      `;

      // Nút Download
      card.querySelector('.btn-download').addEventListener('click', () => {
        handleDownload(item);
      });

      // Nút Copy URL
      card.querySelector('.btn-copy').addEventListener('click', (e) => {
        navigator.clipboard.writeText(item.url);
        const btn = e.currentTarget;
        const oldHtml = btn.innerHTML;
        btn.innerHTML = `<span>✓ Đã chép!</span>`;
        setTimeout(() => { btn.innerHTML = oldHtml; }, 1500);
      });

      mediaContainer.appendChild(card);
    });
  }

  // 5. Xử lý tải xuống
  function handleDownload(item) {
    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_DIRECT',
      url: item.url,
      filename: item.filename || `audio_${Date.now()}.${item.ext || 'mp3'}`
    }, (res) => {
      if (!res || !res.success) {
        // Mở URL trực tiếp nếu download API gặp lỗi
        window.open(item.url, '_blank');
      }
    });
  }

  // 6. Xử lý chuyển Tab Lọc
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category;
      renderMedia();
    });
  });

  // 7. Nút Quét tìm Âm thanh trên trang
  btnScanAudio.addEventListener('click', async () => {
    if (!currentTab) return;
    
    // Gửi lệnh quét sâu tới Content Script
    chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_DOM_NOW' }, () => {
      setTimeout(loadMedia, 400);
    });

    // Chuyển sang tab âm thanh
    const audioTab = document.querySelector('.tab-btn[data-category="audio"]');
    if (audioTab) audioTab.click();
  });

  // 8. Nút Quét lại trang
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
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>`;
    }
  }

  // Khởi động
  loadMedia();
  setInterval(loadMedia, 1500);
});
