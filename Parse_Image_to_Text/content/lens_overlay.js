// Google Lens Style Interactive Overlay Controller
(function () {
  'use strict';

  if (window.__lensOverlayControllerInstance) {
    try {
      window.__lensOverlayControllerInstance.destroy();
    } catch (e) {}
  }

  class LensOverlayController {
    constructor() {
      this.root = null;
      this.snippingOverlay = null;
      this.selectionBox = null;
      this.isDragging = false;
      this.startX = 0;
      this.startY = 0;

      this.currentImageSrc = null;
      this.currentImageNaturalWidth = 0;
      this.currentImageNaturalHeight = 0;
      this.recognizedWords = [];
      this.selectedWords = new Set();

      this.ocrEngine = new window.LensOCREngine();

      this.boundMouseDown = this.onMouseDown.bind(this);
      this.boundMouseMove = this.onMouseMove.bind(this);
      this.boundMouseUp = this.onMouseUp.bind(this);
      this.boundKeyDown = this.onKeyDown.bind(this);
    }

    init() {
      this.destroy();
      this.ensureStyles();
    }

    ensureStyles() {
      if (!document.getElementById('lens-ocr-css')) {
        const link = document.createElement('link');
        link.id = 'lens-ocr-css';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('content/lens.css');
        document.head.appendChild(link);
      }
    }

    destroy() {
      if (this.root) {
        this.root.remove();
        this.root = null;
      }
      window.removeEventListener('mousemove', this.boundMouseMove);
      window.removeEventListener('mouseup', this.boundMouseUp);
      document.removeEventListener('keydown', this.boundKeyDown);
    }

    // ==========================================
    // 1. SNIPPING / SCREEN CAPTURE AREA
    // ==========================================
    startSnipping() {
      this.init();
      this.root = document.createElement('div');
      this.root.id = 'lens-ocr-root';

      this.root.innerHTML = `
        <div class="lens-snipping-overlay">
          <div class="lens-top-banner">
            <span class="lens-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="22" y1="12" x2="18" y2="12" />
                <line x1="6" y1="12" x2="2" y2="12" />
                <line x1="12" y1="6" x2="12" y2="2" />
                <line x1="12" y1="22" x2="12" y2="18" />
              </svg>
              <span>LENS OCR</span>
            </span>
            <span>Kéo chuột khoanh vùng văn bản cần quét (Nhấn <b>ESC</b> để hủy)</span>
          </div>
          <div class="lens-snip-selection-box" style="display: none;">
            <div class="lens-snip-tag">0 × 0 px</div>
          </div>
        </div>
      `;

      const targetParent = document.body || document.documentElement;
      targetParent.appendChild(this.root);

      this.snippingOverlay = this.root.querySelector('.lens-snipping-overlay');
      this.selectionBox = this.root.querySelector('.lens-snip-selection-box');

      this.snippingOverlay.addEventListener('mousedown', this.boundMouseDown);
      window.addEventListener('mousemove', this.boundMouseMove);
      window.addEventListener('mouseup', this.boundMouseUp);
      document.addEventListener('keydown', this.boundKeyDown);
    }

    onMouseDown(e) {
      if (e.button !== 0) return; // Chỉ nhận chuột trái
      this.isDragging = true;
      this.startX = e.clientX;
      this.startY = e.clientY;

      this.selectionBox.style.left = `${this.startX}px`;
      this.selectionBox.style.top = `${this.startY}px`;
      this.selectionBox.style.width = '0px';
      this.selectionBox.style.height = '0px';
      this.selectionBox.style.display = 'block';
    }

    onMouseMove(e) {
      if (!this.isDragging) return;

      const currentX = e.clientX;
      const currentY = e.clientY;

      const left = Math.min(this.startX, currentX);
      const top = Math.min(this.startY, currentY);
      const width = Math.abs(currentX - this.startX);
      const height = Math.abs(currentY - this.startY);

      this.selectionBox.style.left = `${left}px`;
      this.selectionBox.style.top = `${top}px`;
      this.selectionBox.style.width = `${width}px`;
      this.selectionBox.style.height = `${height}px`;

      const tag = this.selectionBox.querySelector('.lens-snip-tag');
      if (tag) {
        tag.textContent = `${Math.round(width)} × ${Math.round(height)} px`;
      }
    }

    async onMouseUp(e) {
      if (!this.isDragging) return;
      this.isDragging = false;

      const currentX = e.clientX;
      const currentY = e.clientY;

      const left = Math.min(this.startX, currentX);
      const top = Math.min(this.startY, currentY);
      const width = Math.abs(currentX - this.startX);
      const height = Math.abs(currentY - this.startY);

      // Nếu kéo quá nhỏ (dưới 15px), bỏ qua không chụp
      if (width < 15 || height < 15) {
        this.selectionBox.style.display = 'none';
        return;
      }

      // Ẩn lớp phủ một tích tắc để screenshot màn hình không dính màu mờ overlay
      this.snippingOverlay.style.display = 'none';

      // Chụp màn hình bằng Chrome API
      chrome.runtime.sendMessage({ action: "CAPTURE_VISIBLE_TAB" }, async (response) => {
        if (!response || !response.success || !response.dataUrl) {
          alert('Không thể chụp ảnh màn hình: ' + (response?.error || 'Lỗi không xác định'));
          this.destroy();
          return;
        }

        try {
          const croppedDataUrl = await this.cropImage(response.dataUrl, left, top, width, height);
          this.destroy(); // Đóng snipping mask
          this.openLensStudio(croppedDataUrl);
        } catch (err) {
          console.error('Lỗi cắt ảnh:', err);
          alert('Lỗi cắt ảnh: ' + err.message);
          this.destroy();
        }
      });
    }

    onKeyDown(e) {
      if (e.key === 'Escape') {
        this.destroy();
      }
    }

    // Cắt ảnh theo toạ độ màn hình (hỗ trợ devicePixelRatio cho màn hình Retina/High-DPI)
    cropImage(dataUrl, cropX, cropY, cropW, cropH) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const dpr = window.devicePixelRatio || 1;

          // Nhân hệ số tỉ lệ màn hình
          const actualX = cropX * dpr;
          const actualY = cropY * dpr;
          const actualW = cropW * dpr;
          const actualH = cropH * dpr;

          canvas.width = actualW;
          canvas.height = actualH;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, actualX, actualY, actualW, actualH, 0, 0, actualW, actualH);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Lỗi tải ảnh màn hình để cắt'));
        img.src = dataUrl;
      });
    }

    // ==========================================
    // 2. GOOGLE LENS INTERACTIVE STUDIO
    // ==========================================
    openLensStudio(imageDataUrl) {
      this.init();
      this.currentImageSrc = imageDataUrl;
      this.selectedWords.clear();

      this.root = document.createElement('div');
      this.root.id = 'lens-ocr-root';

      this.root.innerHTML = `
        <div class="lens-studio-modal">
          <!-- Top Header -->
          <div class="lens-header">
            <div class="lens-logo">
              <svg width="24" height="24" viewBox="0 0 128 128" fill="none">
                <defs>
                  <linearGradient id="studioGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#38bdf8" />
                    <stop offset="50%" stop-color="#818cf8" />
                    <stop offset="100%" stop-color="#ec4899" />
                  </linearGradient>
                </defs>
                <rect width="128" height="128" rx="28" fill="#0b1120" />
                <g stroke="url(#studioGrad)" stroke-width="8" stroke-linecap="round">
                  <path d="M24 44 V28 H40" />
                  <path d="M104 44 V28 H88" />
                  <path d="M24 84 V100 H40" />
                  <path d="M104 84 V100 H88" />
                </g>
                <circle cx="64" cy="64" r="24" stroke="url(#studioGrad)" stroke-width="5" fill="rgba(56, 189, 248, 0.12)" />
                <line x1="42" y1="64" x2="86" y2="64" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" />
              </svg>
              <span>Lens OCR Studio</span>
              <span id="lens-engine-tag" style="font-size: 11px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 8px; border-radius: 10px; border: 1px solid rgba(56, 189, 248, 0.3);">Đang quét...</span>
            </div>
            <div class="lens-header-actions">
              <button id="lens-btn-resnip" class="lens-btn-sm" title="Quét lại vùng khác">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                <span>Quét vùng khác</span>
              </button>
              <button id="lens-btn-upload" class="lens-btn-sm" title="Tải ảnh khác lên">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Tải ảnh khác</span>
              </button>
              <input type="file" id="lens-file-input" accept="image/*" style="display: none;" />
              <button id="lens-btn-close-studio" class="lens-btn-sm lens-btn-close" title="Đóng giao diện">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span>Đóng</span>
              </button>
            </div>
          </div>

          <!-- Main Layout -->
          <div class="lens-body">
            <!-- Left Canvas Image with Bounding Boxes -->
            <div class="lens-stage-container">
              <div class="lens-image-wrapper" id="lens-image-wrapper">
                <img id="lens-target-img" src="${imageDataUrl}" alt="Scan Target" />
                <div class="lens-boxes-layer" id="lens-boxes-layer"></div>

                <!-- Floating Toolbar when user selects words -->
                <div class="lens-floating-toolbar" id="lens-floating-toolbar" style="display: none;">
                  <button class="lens-floating-btn" id="lens-float-copy">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>Copy</span>
                  </button>
                  <button class="lens-floating-btn" id="lens-float-search">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span>Tìm Google</span>
                  </button>
                  <button class="lens-floating-btn" id="lens-float-translate">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    <span>Dịch</span>
                  </button>
                  <button class="lens-floating-btn" id="lens-float-speak">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                    <span>Nghe</span>
                  </button>
                </div>

                <!-- Loading overlay -->
                <div class="lens-loading-overlay" id="lens-loading-overlay">
                  <div class="lens-spinner"></div>
                  <div class="lens-loading-text" id="lens-loading-text">Đang nhận diện chữ trong ảnh...</div>
                  <div class="lens-progress-bar-wrap">
                    <div class="lens-progress-bar" id="lens-progress-bar"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Right Sidebar: Full Extracted Text & Actions -->
            <div class="lens-sidebar">
              <div class="lens-sidebar-header">
                <div class="lens-sidebar-title">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                  <span>Văn bản trích xuất</span>
                </div>
                <span id="lens-word-count" style="font-size: 11px; color: #94a3b8;">0 từ</span>
              </div>

              <div class="lens-sidebar-content">
                <div class="lens-textarea-wrap">
                  <textarea id="lens-full-text" class="lens-textarea" placeholder="Nội dung chữ sau khi quét sẽ hiển thị tại đây..."></textarea>
                </div>

                <div class="lens-actions-grid">
                  <button class="lens-action-btn primary" id="lens-btn-copy-all">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>Sao chép tất cả</span>
                  </button>
                  <button class="lens-action-btn" id="lens-btn-translate">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                    <span>Dịch Tiếng Việt</span>
                  </button>
                  <button class="lens-action-btn" id="lens-btn-speak">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                    <span>Nghe đọc</span>
                  </button>
                  <button class="lens-action-btn" id="lens-btn-search-google">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <span>Tìm Google</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

      const targetParent = document.body || document.documentElement;
      targetParent.appendChild(this.root);

      this.bindStudioEvents();
      this.runOCR(imageDataUrl);
    }

    bindStudioEvents() {
      const btnClose = this.root.querySelector('#lens-btn-close-studio');
      if (btnClose) btnClose.addEventListener('click', () => this.destroy());

      const btnResnip = this.root.querySelector('#lens-btn-resnip');
      if (btnResnip) {
        btnResnip.addEventListener('click', () => {
          this.destroy();
          this.startSnipping();
        });
      }

      const btnUpload = this.root.querySelector('#lens-btn-upload');
      const fileInput = this.root.querySelector('#lens-file-input');
      if (btnUpload && fileInput) {
        btnUpload.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (re) => {
              this.openLensStudio(re.target.result);
            };
            reader.readAsDataURL(file);
          }
        });
      }

      // Nút Copy All
      const btnCopyAll = this.root.querySelector('#lens-btn-copy-all');
      if (btnCopyAll) {
        btnCopyAll.addEventListener('click', () => {
          const text = this.root.querySelector('#lens-full-text')?.value || '';
          if (text.trim()) {
            this.copyToClipboard(text);
            this.showToast('✓ Đã sao chép toàn bộ văn bản!');
          }
        });
      }

      // Nút Dịch Google Translate
      const btnTranslate = this.root.querySelector('#lens-btn-translate');
      if (btnTranslate) {
        btnTranslate.addEventListener('click', () => {
          const text = this.getSelectedOrFullText();
          if (text) {
            window.open(`https://translate.google.com/?sl=auto&tl=vi&text=${encodeURIComponent(text)}`, '_blank');
          }
        });
      }

      // Nút Nghe đọc (Text to speech)
      const btnSpeak = this.root.querySelector('#lens-btn-speak');
      if (btnSpeak) {
        btnSpeak.addEventListener('click', () => {
          const text = this.getSelectedOrFullText();
          if (text) {
            this.speakText(text);
          }
        });
      }

      // Nút Tìm kiếm Google
      const btnSearch = this.root.querySelector('#lens-btn-search-google');
      if (btnSearch) {
        btnSearch.addEventListener('click', () => {
          const text = this.getSelectedOrFullText();
          if (text) {
            window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank');
          }
        });
      }

      // Sự kiện trên Floating Toolbar
      const floatCopy = this.root.querySelector('#lens-float-copy');
      if (floatCopy) {
        floatCopy.addEventListener('click', () => {
          const text = this.getSelectedText();
          if (text) {
            this.copyToClipboard(text);
            this.showToast('✓ Đã sao chép đoạn chữ đã chọn!');
          }
        });
      }

      const floatSearch = this.root.querySelector('#lens-float-search');
      if (floatSearch) {
        floatSearch.addEventListener('click', () => {
          const text = this.getSelectedText();
          if (text) {
            window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank');
          }
        });
      }

      const floatTranslate = this.root.querySelector('#lens-float-translate');
      if (floatTranslate) {
        floatTranslate.addEventListener('click', () => {
          const text = this.getSelectedText();
          if (text) {
            window.open(`https://translate.google.com/?sl=auto&tl=vi&text=${encodeURIComponent(text)}`, '_blank');
          }
        });
      }

      const floatSpeak = this.root.querySelector('#lens-float-speak');
      if (floatSpeak) {
        floatSpeak.addEventListener('click', () => {
          const text = this.getSelectedText();
          if (text) {
            this.speakText(text);
          }
        });
      }

      // Click ra ngoài để bỏ chọn từ
      const stage = this.root.querySelector('.lens-stage-container');
      if (stage) {
        stage.addEventListener('click', (e) => {
          if (!e.target.closest('.lens-ocr-word') && !e.target.closest('.lens-floating-toolbar')) {
            this.clearWordSelection();
          }
        });
      }
    }

    // ==========================================
    // 3. THỰC HIỆN OCR VÀ VẼ BỘ KHUNG OVERLAY
    // ==========================================
    async runOCR(imageDataUrl) {
      const loadingOverlay = this.root.querySelector('#lens-loading-overlay');
      const loadingText = this.root.querySelector('#lens-loading-text');
      const progressBar = this.root.querySelector('#lens-progress-bar');
      const engineTag = this.root.querySelector('#lens-engine-tag');

      const img = this.root.querySelector('#lens-target-img');

      // Đợi ảnh render xong để lấy kích thước tự nhiên
      await new Promise(res => {
        if (img.complete) res();
        else img.onload = () => res();
      });

      this.currentImageNaturalWidth = img.naturalWidth || img.width;
      this.currentImageNaturalHeight = img.naturalHeight || img.height;

      try {
        const result = await this.ocrEngine.recognize(imageDataUrl, (status, progress) => {
          if (loadingText) loadingText.textContent = `${status} (${Math.round((progress || 0) * 100)}%)`;
          if (progressBar) progressBar.style.width = `${Math.round((progress || 0) * 100)}%`;
        });

        if (engineTag) engineTag.textContent = result.engine || 'Tesseract.js';
        if (loadingOverlay) loadingOverlay.style.display = 'none';

        // Điền văn bản vào textarea
        const textarea = this.root.querySelector('#lens-full-text');
        if (textarea) textarea.value = result.text || '';

        const wordCount = (result.text || '').trim().split(/\s+/).filter(Boolean).length;
        const wordCountEl = this.root.querySelector('#lens-word-count');
        if (wordCountEl) wordCountEl.textContent = `${wordCount} từ`;

        // Render các hộp bôi đen tương tác đè lên ảnh
        this.recognizedWords = result.words || [];
        this.renderBoundingBoxes();

        // Tự động điều chỉnh kích thước khi phóng to thu nhỏ cửa sổ
        window.addEventListener('resize', () => this.renderBoundingBoxes());

      } catch (err) {
        console.error('Lỗi nhận diện OCR:', err);
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        if (loadingText) loadingText.textContent = 'Lỗi nhận diện!';
        alert('Lỗi nhận diện OCR: ' + err.message);
      }
    }

    renderBoundingBoxes() {
      const layer = this.root.querySelector('#lens-boxes-layer');
      const img = this.root.querySelector('#lens-target-img');
      if (!layer || !img || !this.recognizedWords) return;

      layer.innerHTML = '';

      const renderedWidth = img.clientWidth;
      const renderedHeight = img.clientHeight;

      if (!renderedWidth || !renderedHeight || !this.currentImageNaturalWidth) return;

      const scaleX = renderedWidth / this.currentImageNaturalWidth;
      const scaleY = renderedHeight / this.currentImageNaturalHeight;

      this.recognizedWords.forEach((word, index) => {
        const bbox = word.bbox;
        if (!bbox) return;

        const left = bbox.x0 * scaleX;
        const top = bbox.y0 * scaleY;
        const width = (bbox.x1 - bbox.x0) * scaleX;
        const height = (bbox.y1 - bbox.y0) * scaleY;

        if (width < 3 || height < 3) return;

        const box = document.createElement('div');
        box.className = 'lens-ocr-word';
        box.dataset.index = index;
        box.dataset.text = word.text;
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;
        box.style.fontSize = `${Math.max(9, height * 0.75)}px`;
        box.title = word.text;
        box.textContent = word.text;

        // Click để chọn từ
        box.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleSelectWord(index, box, e.shiftKey || e.ctrlKey);
        });

        layer.appendChild(box);
      });
    }

    toggleSelectWord(index, element, isMulti) {
      if (!isMulti) {
        this.clearWordSelection();
      }

      if (this.selectedWords.has(index)) {
        this.selectedWords.delete(index);
        element.classList.remove('selected');
      } else {
        this.selectedWords.add(index);
        element.classList.add('selected');
      }

      this.updateFloatingToolbar();
    }

    clearWordSelection() {
      this.selectedWords.clear();
      const selectedEls = this.root.querySelectorAll('.lens-ocr-word.selected');
      selectedEls.forEach(el => el.classList.remove('selected'));
      this.updateFloatingToolbar();
    }

    updateFloatingToolbar() {
      const toolbar = this.root.querySelector('#lens-floating-toolbar');
      if (!toolbar) return;

      if (this.selectedWords.size === 0) {
        toolbar.style.display = 'none';
        return;
      }

      // Tính vị trí trung tâm các từ được chọn
      const indices = Array.from(this.selectedWords);
      let minX = Infinity, minY = Infinity, maxX = -Infinity;

      indices.forEach(idx => {
        const wordEl = this.root.querySelector(`.lens-ocr-word[data-index="${idx}"]`);
        if (wordEl) {
          const l = parseFloat(wordEl.style.left);
          const t = parseFloat(wordEl.style.top);
          const w = parseFloat(wordEl.style.width);
          if (l < minX) minX = l;
          if (t < minY) minY = t;
          if (l + w > maxX) maxX = l + w;
        }
      });

      if (minX !== Infinity) {
        toolbar.style.left = `${(minX + maxX) / 2}px`;
        toolbar.style.top = `${minY}px`;
        toolbar.style.display = 'flex';
      }
    }

    getSelectedText() {
      if (this.selectedWords.size === 0) return '';
      const sortedIndices = Array.from(this.selectedWords).sort((a, b) => a - b);
      return sortedIndices.map(i => this.recognizedWords[i]?.text || '').join(' ').trim();
    }

    getSelectedOrFullText() {
      const selected = this.getSelectedText();
      if (selected) return selected;
      return this.root.querySelector('#lens-full-text')?.value || '';
    }

    speakText(text) {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
        this.showToast('🔊 Đang phát giọng đọc...');
      } else {
        alert('Trình duyệt không hỗ trợ tổng hợp giọng nói SpeechSynthesis.');
      }
    }

    copyToClipboard(text) {
      navigator.clipboard.writeText(text).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      });
    }

    showToast(message) {
      const old = this.root.querySelector('.lens-toast');
      if (old) old.remove();

      const toast = document.createElement('div');
      toast.className = 'lens-toast';
      toast.textContent = message;
      this.root.appendChild(toast);

      setTimeout(() => {
        toast.remove();
      }, 2500);
    }
  }

  // Khởi tạo instance toàn cục
  window.__lensOverlayControllerInstance = new LensOverlayController();

  // Nhận lệnh từ background / popup (chỉ đăng ký 1 lần)
  if (!window.__lensMessageListenerBound) {
    window.__lensMessageListenerBound = true;
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'START_SNIPPING_CAPTURE') {
        window.__lensOverlayControllerInstance.startSnipping();
        sendResponse({ status: 'snipping_started' });
      } else if (request.action === 'SCAN_DIRECT_IMAGE_URL' && request.imageUrl) {
        window.__lensOverlayControllerInstance.openLensStudio(request.imageUrl);
        sendResponse({ status: 'studio_opened' });
      }
    });
  }

})();
