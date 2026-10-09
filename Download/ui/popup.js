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
  const btnScanCanvas = document.getElementById('btnScanCanvas');
  const btnScanImages = document.getElementById('btnScanImages');

  const progressOverlay = document.getElementById('progressOverlay');
  const progressTitle = document.getElementById('progressTitle');
  const progressDetail = document.getElementById('progressDetail');
  const progressBarFill = document.getElementById('progressBarFill');

  // 1. Lấy thông tin tab hiện tại
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      currentTab = tabs[0];
      pageTitleElem.textContent = currentTab.title || currentTab.url;
      pageTitleElem.title = currentTab.title || currentTab.url;

      // Yêu cầu content script quét lại DOM ngay lập tức
      chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_DOM_NOW' }, () => {
        if (chrome.runtime.lastError) {
          // Tab chưa load content script hoặc là chrome:// page
        }
      });
    }
  } catch (e) {
    console.error('Error fetching tab:', e);
  }

  // 2. Tải danh sách media từ Background
  function loadMedia() {
    if (!currentTab) return;

    chrome.runtime.sendMessage(
      { action: 'GET_MEDIA', tabId: currentTab.id },
      (response) => {
        if (response && response.success) {
          allMedia = response.data || [];
          updateCounts();
          if (currentCategory !== 'images') {
            renderMedia();
          }
        }
      }
    );
  }

  // 3. Cập nhật số lượng trên các tab lọc
  function updateCounts() {
    const counts = {
      all: allMedia.length,
      video: allMedia.filter(m => m.category === 'video').length,
      audio: allMedia.filter(m => m.category === 'audio').length,
      document: allMedia.filter(m => m.category === 'document').length,
    };

    document.getElementById('countAll').textContent = counts.all;
    document.getElementById('countVideo').textContent = counts.video;
    document.getElementById('countAudio').textContent = counts.audio;
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

      const isHls = item.type === 'hls';
      const badgeClass = isHls ? 'badge-hls' : (item.category === 'video' ? 'badge-video' : (item.category === 'audio' ? 'badge-audio' : 'badge-doc'));

      card.innerHTML = `
        <div class="media-info">
          <div class="media-thumb">
            ${item.thumbnail ? `<img src="${item.thumbnail}" alt="thumb">` : getFallbackIcon(item.category)}
          </div>
          <div class="media-details">
            <span class="media-title" title="${item.filename || item.title}">${item.filename || item.title || 'Tập tin'}</span>
            <div class="media-tags">
              <span class="badge ${badgeClass}">${item.quality || item.format || item.ext}</span>
              <span class="media-size">${item.sizeFormatted || 'Stream'}</span>
            </div>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn-download" data-id="${item.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Tải về</span>
          </button>
          <button class="btn-copy" data-url="${item.url}" title="Sao chép liên kết">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy</span>
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
        const oldText = btn.innerHTML;
        btn.innerHTML = `<span>Đã chép!</span>`;
        setTimeout(() => { btn.innerHTML = oldText; }, 1500);
      });

      mediaContainer.appendChild(card);
    });
  }

  // 5. Xử lý tải xuống
  function handleDownload(item) {
    if (item.type === 'hls') {
      showProgress('Đang tải & ghép luồng video HLS (m3u8)...', 'Đang khởi tạo các luồng tải...');
      chrome.runtime.sendMessage({
        action: 'START_HLS_DOWNLOAD',
        payload: {
          url: item.url,
          filename: item.filename || 'hls_video.mp4',
          downloadId: item.id
        }
      });
    } else {
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_DIRECT',
        url: item.url,
        filename: item.filename || 'download.mp4'
      }, (res) => {
        if (!res || !res.success) {
          window.open(item.url, '_blank');
        }
      });
    }
  }

  // 6. Quản lý Thanh tiến trình (HLS Progress)
  function showProgress(title, detail) {
    progressOverlay.style.display = 'flex';
    progressTitle.textContent = title;
    progressDetail.textContent = detail;
    progressBarFill.style.width = '0%';
  }

  function hideProgress() {
    progressOverlay.style.display = 'none';
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'HLS_PROGRESS_UPDATE') {
      const { progress } = message;
      progressDetail.textContent = `Đã tải ${progress.completed} / ${progress.total} đoạn (${progress.percent}%)`;
      progressBarFill.style.width = `${progress.percent}%`;
    } else if (message.action === 'HLS_DOWNLOAD_COMPLETE') {
      progressDetail.textContent = 'Hoàn tất! Video đã được lưu vào máy.';
      progressBarFill.style.width = '100%';
      setTimeout(hideProgress, 2000);
    } else if (message.action === 'HLS_DOWNLOAD_ERROR') {
      progressDetail.textContent = `Lỗi: ${message.error}`;
      setTimeout(hideProgress, 3500);
    }
  });

  // 7. Xử lý chuyển Tab Lọc
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category;

      if (currentCategory === 'images') {
        scanAndRenderImages();
      } else {
        renderMedia();
      }
    });
  });

  // 8. Quét & Tải Album Ảnh
  async function scanAndRenderImages() {
    if (!currentTab) return;
    chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_PAGE_IMAGES' }, (res) => {
      if (res && res.images && res.images.length > 0) {
        mediaContainer.querySelectorAll('.media-card').forEach(el => el.remove());
        emptyState.style.display = 'none';
        document.getElementById('countImages').textContent = res.images.length;

        res.images.forEach((img, idx) => {
          const card = document.createElement('div');
          card.className = 'media-card';
          card.innerHTML = `
            <div class="media-info">
              <div class="media-thumb">
                <img src="${img.url}" alt="img">
              </div>
              <div class="media-details">
                <span class="media-title">Ảnh ${idx + 1} (${img.width}x${img.height}px)</span>
                <div class="media-tags">
                  <span class="badge badge-doc">IMAGE</span>
                </div>
              </div>
            </div>
            <div class="card-actions">
              <button class="btn-download" data-url="${img.url}">
                <span>Tải ảnh</span>
              </button>
            </div>
          `;
          card.querySelector('.btn-download').addEventListener('click', () => {
            chrome.runtime.sendMessage({
              action: 'DOWNLOAD_DIRECT',
              url: img.url,
              filename: `image_${idx + 1}.jpg`
            });
          });
          mediaContainer.appendChild(card);
        });
      } else {
        mediaContainer.querySelectorAll('.media-card').forEach(el => el.remove());
        emptyState.style.display = 'flex';
      }
    });
  }

  // 9. Nút cào tài liệu sang PDF
  btnScanCanvas.addEventListener('click', () => {
    if (!currentTab) return;
    showProgress('Đang quét tài liệu từ Canvas...', 'Đang cuộn và trích xuất các trang...');

    chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_CANVAS_PAGES' }, (res) => {
      if (res && res.pages && res.pages.length > 0) {
        progressDetail.textContent = `Tìm thấy ${res.pages.length} trang tài liệu! Đang tải về...`;
        progressBarFill.style.width = '70%';

        res.pages.forEach((p) => {
          chrome.runtime.sendMessage({
            action: 'DOWNLOAD_DIRECT',
            url: p.dataUrl,
            filename: `TaiLieu_Trang_${p.index}.jpg`
          });
        });

        progressBarFill.style.width = '100%';
        progressDetail.textContent = `Đã tải ${res.pages.length} trang thành công!`;
        setTimeout(hideProgress, 2500);
      } else {
        progressDetail.textContent = 'Không tìm thấy trang tài liệu Canvas nào trên trang này.';
        setTimeout(hideProgress, 2500);
      }
    });
  });

  // Nút Tải Album Ảnh
  btnScanImages.addEventListener('click', () => {
    const imgTab = document.querySelector('.tab-btn[data-category="images"]');
    if (imgTab) imgTab.click();
  });

  // Nút Refresh
  btnRefresh.addEventListener('click', () => {
    if (currentTab) {
      chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_DOM_NOW' });
    }
    loadMedia();
  });

  function getFallbackIcon(category) {
    if (category === 'video') {
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    } else if (category === 'audio') {
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
    } else {
      return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 2 2h12a2 2 0 0 2-2V8z"></path></svg>`;
    }
  }

  // Khởi động
  loadMedia();
  setInterval(loadMedia, 2000);
});
