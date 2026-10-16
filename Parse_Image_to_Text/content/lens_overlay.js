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
            <span class="lens-badge">🎯 GOOGLE LENS OCR</span>
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
              <svg width="22" height="22" viewBox="0 0 128 128" fill="none">
                <rect width="128" height="128" rx="28" fill="#0f172a" />
                <path d="M28 44 V32 H44" stroke="#38bdf8" stroke-width="8" stroke-linecap="round" />
                <path d="M100 44 V32 H84" stroke="#38bdf8" stroke-width="8" stroke-linecap="round" />
                <path d="M28 84 V96 H44" stroke="#38bdf8" stroke-width="8" stroke-linecap="round" />
                <path d="M100 84 V96 H84" stroke="#38bdf8" stroke-width="8" stroke-linecap="round" />
                <circle cx="64" cy="64" r="22" stroke="#38bdf8" stroke-width="7" fill="none" />
              </svg>
              <span>Lens OCR Studio</span>
              <span id="lens-engine-tag" style="font-size: 11px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; padding: 2px 8px; border-radius: 10px; border: 1px solid rgba(56, 189, 248, 0.3);">Đang quét...</span>
            </div>
            <div class="lens-header-actions">
              <button id="lens-btn-resnip" class="lens-btn-sm" title="Quét lại vùng khác">✂️ Quét vùng khác</button>
              <button id="lens-btn-upload" class="lens-btn-sm" title="Tải ảnh khác lên">📁 Tải ảnh khác</button>
              <input type="file" id="lens-file-input" accept="image/*" style="display: none;" />
              <button id="lens-btn-close-studio" class="lens-btn-sm lens-btn-close" title="Đóng giao diện">✕ Đóng</button>
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
                  <button class="lens-floating-btn" id="lens-float-copy">📋 Copy</button>
                  <button class="lens-floating-btn" id="lens-float-search">🔍 Tìm Google</button>
                  <button class="lens-floating-btn" id="lens-float-translate">🌐 Dịch</button>
                  <button class="lens-floating-btn" id="lens-float-speak">🔊 Nghe</button>
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
                  <span>📝</span>
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
                    <span>📋 Sao chép tất cả</span>
                  </button>
                  <button class="lens-action-btn" id="lens-btn-translate">
                    <span>🌐 Dịch Tiếng Việt</span>
                  </button>
                  <button class="lens-action-btn" id="lens-btn-speak">
                    <span>🔊 Nghe đọc</span>
                  </button>
                  <button class="lens-action-btn" id="lens-btn-search-google">
                    <span>🔍 Tìm Google</span>
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

  // Nhận lệnh từ background / popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_SNIPPING_CAPTURE') {
      window.__lensOverlayControllerInstance.startSnipping();
      sendResponse({ status: 'snipping_started' });
    } else if (request.action === 'SCAN_DIRECT_IMAGE_URL' && request.imageUrl) {
      window.__lensOverlayControllerInstance.openLensStudio(request.imageUrl);
      sendResponse({ status: 'studio_opened' });
    }
  });

})();
