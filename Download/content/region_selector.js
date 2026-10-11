// OmniLoader - Region Scan to Paginated PDF with Smart Page Break
// Tính năng quét vùng chọn, cuộn trang xuống dưới và xuất PDF chuẩn A4, chống cắt ngang dòng chữ & hình ảnh.

(function () {
  'use strict';

  // Tránh inject trùng lặp
  if (window.__omniRegionSelectorInitialized) return;
  window.__omniRegionSelectorInitialized = true;

  // 1. PURE JS PDF BUILDER (PDF-1.4 Native Generator)
  function createPdfFromImages(images) {
    if (!images || images.length === 0) return null;

    let pdfContent = '%PDF-1.4\n';
    const objectOffsets = [];

    function addLine(str) { pdfContent += str + '\n'; }
    function markObject(objNum) {
      objectOffsets[objNum] = pdfContent.length;
      addLine(`${objNum} 0 obj`);
    }

    // 1. Catalog Object
    markObject(1);
    addLine('<< /Type /Catalog /Pages 2 0 R >>');
    addLine('endobj');

    const totalPages = images.length;
    const pageObjectRefs = [];
    for (let i = 0; i < totalPages; i++) {
      pageObjectRefs.push(`${3 + i * 3} 0 R`);
    }

    // 2. Pages Object
    markObject(2);
    addLine(`<< /Type /Pages /Kids [${pageObjectRefs.join(' ')}] /Count ${totalPages} >>`);
    addLine('endobj');

    for (let i = 0; i < totalPages; i++) {
      const img = images[i];
      const pageObjNum = 3 + i * 3;
      const contentObjNum = pageObjNum + 1;
      const imageObjNum = pageObjNum + 2;

      const pageWidth = img.width || 595.28;
      const pageHeight = img.height || 841.89;

      markObject(pageObjNum);
      addLine(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObjNum} 0 R /Resources << /XObject << /Im${i + 1} ${imageObjNum} 0 R >> >> >>`);
      addLine('endobj');

      const streamContent = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${i + 1} Do\nQ`;
      markObject(contentObjNum);
      addLine(`<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`);
      addLine('endobj');

      const base64Data = img.dataUrl.split(',')[1];
      const rawBinary = atob(base64Data);

      markObject(imageObjNum);
      addLine(`<< /Type /XObject /Subtype /Image /Width ${img.pixelWidth || img.width || 800} /Height ${img.pixelHeight || img.height || 1100} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${rawBinary.length} >>\nstream`);
      pdfContent += rawBinary + '\nendstream\nendobj\n';
    }

    const startXref = pdfContent.length;
    addLine('xref');
    addLine(`0 ${3 + totalPages * 3}`);
    addLine('0000000000 65535 f ');

    for (let i = 1; i < 3 + totalPages * 3; i++) {
      const offset = String(objectOffsets[i] || 0).padStart(10, '0');
      addLine(`${offset} 00000 n `);
    }

    addLine('trailer');
    addLine(`<< /Size ${3 + totalPages * 3} /Root 1 0 R >>`);
    addLine('startxref');
    addLine(String(startXref));
    addLine('%%EOF');

    const buffer = new Uint8Array(pdfContent.length);
    for (let i = 0; i < pdfContent.length; i++) {
      buffer[i] = pdfContent.charCodeAt(i) & 0xff;
    }
    return new Blob([buffer], { type: 'application/pdf' });
  }

  // 2. HELPER FUNCTIONS
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function sanitizeFilename(name) {
    return (name || 'Tai_Lieu')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 80);
  }

  // 3. SMART PAGE BREAK ALGORITHM
  // Quét DOM tìm các ranh giới dòng chữ & khối phần tử để cắt trang A4 hoàn hảo, KHÔNG CẮT GIỮA CHỪNG
  function computeSmartPageSlices(scanRect, totalHeight, targetPageHeight) {
    const startY = scanRect.top;
    const regionLeft = scanRect.left;
    const regionRight = scanRect.left + scanRect.width;

    const items = [];

    // Lấy tất cả phần tử văn bản & khối trong vùng chọn
    const elements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, img, picture, table, tr, pre, code, blockquote, li, figure, canvas, [class*="card"], [class*="post"], article, section');

    elements.forEach(el => {
      // Bỏ qua các phần tử thuộc Overlay tiện ích
      if (el.closest('#omniloader-region-overlay') || el.closest('#omniloader-status-panel')) return;

      const rect = el.getBoundingClientRect();
      const elLeft = rect.left + window.scrollX;
      const elRight = rect.right + window.scrollX;
      const elTop = rect.top + window.scrollY;
      const elBottom = rect.bottom + window.scrollY;

      // Kiểm tra nằm trong phạm vi ngang & dọc của vùng quét
      if (elRight < regionLeft || elLeft > regionRight) return;
      if (elBottom < startY || elTop > startY + totalHeight) return;

      const relTop = elTop - startY;
      const relBottom = elBottom - startY;

      // Nếu là khối ảnh / bảng / tiêu đề: coi như khối nguyên tử không được cắt
      const tag = el.tagName.toLowerCase();
      const isAtomic = ['img', 'picture', 'table', 'tr', 'figure', 'canvas', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre'].includes(tag);

      if (isAtomic) {
        items.push({
          top: relTop,
          bottom: relBottom,
          isAtomic: true,
          tag: tag
        });
      }

      // Đối với đoạn văn bản, trích xuất tọa độ từng dòng chữ chi tiết (bằng Range)
      if (['p', 'li', 'blockquote', 'div'].includes(tag) && el.textContent.trim().length > 0) {
        try {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let textNode;
          while ((textNode = walker.nextNode())) {
            if (!textNode.textContent || !textNode.textContent.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(textNode);
            const lineRects = range.getClientRects();
            for (let i = 0; i < lineRects.length; i++) {
              const lr = lineRects[i];
              if (lr.height < 3) continue;
              const lineTop = lr.top + window.scrollY - startY;
              const lineBottom = lr.bottom + window.scrollY - startY;
              items.push({
                top: lineTop,
                bottom: lineBottom,
                isTextLine: true
              });
            }
          }
        } catch (e) {}
      }
    });

    // Lọc và sắp xếp các items theo chiều dọc
    items.sort((a, b) => a.top - b.top);

    // Thuật toán phân trang thông minh A4
    const slices = [];
    let currentY = 0;
    const minPageHeight = targetPageHeight * 0.60; // Trang ít nhất đạt 60% chiều cao A4 trừ khi hết trang

    while (currentY < totalHeight) {
      if (currentY + targetPageHeight >= totalHeight) {
        // Trang cuối cùng
        slices.push({ top: currentY, bottom: totalHeight });
        break;
      }

      const idealCut = currentY + targetPageHeight;

      // Tìm xem có phần tử nào đang bị cắt ngang bởi idealCut không
      const conflictingItem = items.find(it => it.top + 2 < idealCut && it.bottom - 2 > idealCut);

      if (!conflictingItem) {
        // Cắt sạch sẽ vì idealCut rơi vào khoảng trống/lề giữa các phần tử
        slices.push({ top: currentY, bottom: Math.round(idealCut) });
        currentY = Math.round(idealCut);
      } else {
        // Bị cắt ngang 1 dòng chữ hoặc 1 bức ảnh/bảng
        // Tìm điểm cắt an toàn tốt nhất trước conflictingItem (trong phạm vi >= minPageHeight)
        let safeCut = -1;

        // Ưu tiên 1: Cắt ngay phía trên conflictingItem
        const candidateBeforeConflict = Math.round(conflictingItem.top - 4);
        if (candidateBeforeConflict >= currentY + minPageHeight) {
          safeCut = candidateBeforeConflict;
        }

        // Ưu tiên 2: Tìm mốc an toàn cao nhất trong danh sách nằm giữa currentY + minPageHeight và idealCut
        if (safeCut === -1) {
          const validOptions = items
            .filter(it => it.top - 4 <= idealCut && it.top - 4 >= currentY + minPageHeight)
            .map(it => Math.round(it.top - 4))
            .sort((a, b) => b - a);

          if (validOptions.length > 0) {
            safeCut = validOptions[0];
          }
        }

        // Ưu tiên 3: Nếu phần tử quá dài (ví dụ bảng dài hơn 60% trang), mở rộng cửa sổ tìm kiếm xuống 45%
        if (safeCut === -1) {
          const widerOptions = items
            .filter(it => it.top - 4 <= idealCut && it.top - 4 >= currentY + targetPageHeight * 0.45)
            .map(it => Math.round(it.top - 4))
            .sort((a, b) => b - a);

          if (widerOptions.length > 0) {
            safeCut = widerOptions[0];
          } else {
            // Trường hợp hy hữu: phần tử chiếm nguyên cả trang, đành cắt tại idealCut để không kẹt vòng lặp
            safeCut = Math.round(idealCut);
          }
        }

        slices.push({ top: currentY, bottom: safeCut });
        currentY = safeCut;
      }
    }

    return slices;
  }

  // 4. MAIN REGION SCANNER CONTROLLER
  class RegionScanController {
    constructor() {
      this.overlay = null;
      this.selectionBox = null;
      this.actionPanel = null;
      this.isDragging = false;
      this.startX = 0;
      this.startY = 0;
      this.currentRect = null;
      this.mode = 'scroll_down'; // 'scroll_down' (từ vùng này xuống dưới) | 'box_only' (chỉ trong khung)
      this.boundMouseDown = this.onMouseDown.bind(this);
      this.boundMouseMove = this.onMouseMove.bind(this);
      this.boundMouseUp = this.onMouseUp.bind(this);
      this.boundKeyDown = this.onKeyDown.bind(this);
    }

    start() {
      this.destroy(); // Dọn dẹp phiên cũ nếu có
      this.createOverlay();
    }

    destroy() {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
      document.removeEventListener('keydown', this.boundKeyDown);
    }

    createOverlay() {
      this.overlay = document.createElement('div');
      this.overlay.id = 'omniloader-region-overlay';
      this.overlay.innerHTML = `
        <style>
          #omniloader-region-overlay {
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(15, 23, 42, 0.45);
            z-index: 2147483640;
            cursor: crosshair;
            user-select: none;
            backdrop-filter: blur(1.5px);
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          }
          #omniloader-top-hint {
            position: fixed;
            top: 18px; left: 50%;
            transform: translateX(-50%);
            background: rgba(15, 23, 42, 0.95);
            border: 1px solid rgba(59, 130, 246, 0.4);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 15px rgba(59, 130, 246, 0.25);
            color: #f8fafc;
            padding: 10px 20px;
            border-radius: 30px;
            font-size: 13px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
            z-index: 2147483647;
            pointer-events: none;
            animation: omniSlideDown 0.3s ease;
          }
          #omniloader-top-hint span.badge {
            background: linear-gradient(135deg, #10b981, #3b82f6);
            color: #fff;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 700;
          }
          #omniloader-selection-box {
            position: absolute;
            border: 2px dashed #38bdf8;
            background: rgba(56, 189, 248, 0.12);
            box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.45), 0 0 20px rgba(56, 189, 248, 0.3);
            pointer-events: none;
            display: none;
            z-index: 2147483642;
            border-radius: 4px;
          }
          #omniloader-dimension-tag {
            position: absolute;
            bottom: -28px; right: 0;
            background: #0284c7;
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            padding: 3px 8px;
            border-radius: 4px;
            white-space: nowrap;
          }
          #omniloader-action-panel {
            position: absolute;
            background: #0f172a;
            border: 1px solid rgba(56, 189, 248, 0.35);
            border-radius: 14px;
            box-shadow: 0 12px 35px rgba(0, 0, 0, 0.6), 0 0 20px rgba(56, 189, 248, 0.2);
            padding: 16px;
            color: #f8fafc;
            z-index: 2147483646;
            display: none;
            flex-direction: column;
            gap: 12px;
            width: 330px;
            cursor: default;
            animation: omniFadeIn 0.25s ease;
          }
          .omni-panel-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 13px;
            font-weight: 700;
            color: #38bdf8;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            padding-bottom: 8px;
          }
          .omni-radio-group {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .omni-radio-label {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            font-size: 12px;
            color: #cbd5e1;
            cursor: pointer;
            padding: 6px 8px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid transparent;
            transition: all 0.2s;
          }
          .omni-radio-label:hover {
            background: rgba(56, 189, 248, 0.08);
            border-color: rgba(56, 189, 248, 0.2);
          }
          .omni-radio-label input[type="radio"] {
            margin-top: 2px;
            accent-color: #38bdf8;
          }
          .omni-radio-desc {
            font-size: 10.5px;
            color: #94a3b8;
            margin-top: 2px;
          }
          .omni-btn-row {
            display: flex;
            gap: 8px;
            margin-top: 4px;
          }
          .omni-btn-go {
            flex: 2;
            background: linear-gradient(135deg, #10b981, #0284c7);
            color: #fff;
            border: none;
            padding: 9px 12px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 700;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
            transition: all 0.2s;
          }
          .omni-btn-go:hover {
            filter: brightness(1.15);
            transform: translateY(-1px);
          }
          .omni-btn-cancel, .omni-btn-reselect {
            flex: 1;
            background: rgba(255, 255, 255, 0.08);
            color: #94a3b8;
            border: 1px solid rgba(255, 255, 255, 0.12);
            padding: 9px 10px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          }
          .omni-btn-cancel:hover, .omni-btn-reselect:hover {
            color: #f8fafc;
            background: rgba(255, 255, 255, 0.15);
          }
          /* Progress Modal */
          #omniloader-status-panel {
            position: fixed;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: #0f172a;
            border: 1px solid rgba(16, 185, 129, 0.5);
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(16, 185, 129, 0.25);
            padding: 24px;
            width: 360px;
            color: #f8fafc;
            z-index: 2147483647;
            display: none;
            flex-direction: column;
            gap: 16px;
            text-align: center;
            animation: omniScaleUp 0.3s ease;
          }
          .omni-spinner {
            width: 36px; height: 36px;
            border: 3.5px solid rgba(16, 185, 129, 0.2);
            border-top-color: #10b981;
            border-radius: 50%;
            animation: omniSpin 0.8s linear infinite;
            margin: 0 auto;
          }
          .omni-status-title {
            font-size: 15px;
            font-weight: 700;
            color: #38bdf8;
          }
          .omni-status-msg {
            font-size: 12px;
            color: #94a3b8;
            line-height: 1.5;
          }
          .omni-progress-track {
            width: 100%;
            height: 6px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            overflow: hidden;
          }
          .omni-progress-bar {
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #10b981, #38bdf8);
            border-radius: 10px;
            transition: width 0.3s ease;
          }
          @keyframes omniSpin { to { transform: rotate(360deg); } }
          @keyframes omniSlideDown { from { transform: translate(-50%, -20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
          @keyframes omniFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes omniScaleUp { from { opacity: 0; transform: translate(-50%, -46%) scale(0.95); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
        </style>

        <div id="omniloader-top-hint">
          <span class="badge">🎯 QUÉT VÙNG XUẤT PDF</span>
          <span>Nhấp & kéo chuột chọn vùng tài liệu (Nhấn <b>ESC</b> để hủy)</span>
        </div>

        <div id="omniloader-selection-box">
          <div id="omniloader-dimension-tag">0 × 0 px</div>
        </div>

        <div id="omniloader-action-panel">
          <div class="omni-panel-title">
            <span>📐 CÀI ĐẶT XUẤT PDF</span>
            <span id="omni-panel-size" style="font-size: 11px; color: #94a3b8;">0 × 0 px</span>
          </div>

          <div class="omni-radio-group">
            <label class="omni-radio-label">
              <input type="radio" name="omni-scan-mode" value="scroll_down" checked>
              <div>
                <b>Quét từ vùng này xuống hết trang</b>
                <div class="omni-radio-desc">Tự động cuộn nạp toàn bộ bài viết, chống cắt ngang dòng chữ & ngắt trang A4 chuẩn.</div>
              </div>
            </label>

            <label class="omni-radio-label">
              <input type="radio" name="omni-scan-mode" value="box_only">
              <div>
                <b>Chỉ quét trong khung đã chọn</b>
                <div class="omni-radio-desc">Chỉ đóng gói nội dung nằm trọn vẹn trong hình chữ nhật vừa kéo.</div>
              </div>
            </label>
          </div>

          <div class="omni-btn-row">
            <button id="omni-btn-start" class="omni-btn-go">
              <span>🚀 Bắt đầu xuất PDF</span>
            </button>
            <button id="omni-btn-reselect" class="omni-btn-reselect">
              <span>Chọn lại</span>
            </button>
            <button id="omni-btn-close" class="omni-btn-cancel">
              <span>Hủy</span>
            </button>
          </div>
        </div>

        <div id="omniloader-status-panel">
          <div class="omni-spinner" id="omni-status-spinner"></div>
          <div class="omni-status-title" id="omni-status-title">Đang xử lý quét tài liệu...</div>
          <div class="omni-progress-track">
            <div class="omni-progress-bar" id="omni-progress-bar"></div>
          </div>
          <div class="omni-status-msg" id="omni-status-msg">Chuẩn bị cuộn nạp tài liệu...</div>
        </div>
      `;

      document.body.appendChild(this.overlay);

      this.selectionBox = this.overlay.querySelector('#omniloader-selection-box');
      this.actionPanel = this.overlay.querySelector('#omniloader-action-panel');
      this.statusPanel = this.overlay.querySelector('#omniloader-status-panel');

      // Gắn sự kiện chuột
      this.overlay.addEventListener('mousedown', this.boundMouseDown);
      window.addEventListener('mousemove', this.boundMouseMove);
      window.addEventListener('mouseup', this.boundMouseUp);
      document.addEventListener('keydown', this.boundKeyDown);

      // Nút hành động
      this.overlay.querySelector('#omni-btn-close').addEventListener('click', () => this.destroy());
      this.overlay.querySelector('#omni-btn-reselect').addEventListener('click', () => {
        this.actionPanel.style.display = 'none';
        this.selectionBox.style.display = 'none';
        this.currentRect = null;
      });

      this.overlay.querySelector('#omni-btn-start').addEventListener('click', () => {
        const selectedMode = this.overlay.querySelector('input[name="omni-scan-mode"]:checked')?.value || 'scroll_down';
        this.mode = selectedMode;
        this.executeRegionCapture();
      });

      // Ngăn chặn sự kiện nổi bọt từ Action Panel
      this.actionPanel.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    onKeyDown(e) {
      if (e.key === 'Escape') {
        this.destroy();
      }
    }

    onMouseDown(e) {
      if (e.button !== 0) return; // Chỉ nhận chuột trái
      if (this.actionPanel && this.actionPanel.contains(e.target)) return;

      this.isDragging = true;
      this.startX = e.pageX;
      this.startY = e.pageY;

      this.actionPanel.style.display = 'none';
      this.selectionBox.style.display = 'block';
      this.selectionBox.style.left = `${this.startX}px`;
      this.selectionBox.style.top = `${this.startY}px`;
      this.selectionBox.style.width = '0px';
      this.selectionBox.style.height = '0px';
    }

    onMouseMove(e) {
      if (!this.isDragging) return;

      const currentX = e.pageX;
      const currentY = e.pageY;

      const left = Math.min(this.startX, currentX);
      const top = Math.min(this.startY, currentY);
      const width = Math.abs(currentX - this.startX);
      const height = Math.abs(currentY - this.startY);

      this.selectionBox.style.left = `${left}px`;
      this.selectionBox.style.top = `${top}px`;
      this.selectionBox.style.width = `${width}px`;
      this.selectionBox.style.height = `${height}px`;

      const dimTag = this.selectionBox.querySelector('#omniloader-dimension-tag');
      if (dimTag) dimTag.textContent = `${Math.round(width)} × ${Math.round(height)} px`;
    }

    onMouseUp(e) {
      if (!this.isDragging) return;
      this.isDragging = false;

      let left = parseInt(this.selectionBox.style.left, 10);
      let top = parseInt(this.selectionBox.style.top, 10);
      let width = parseInt(this.selectionBox.style.width, 10);
      let height = parseInt(this.selectionBox.style.height, 10);

      // Nếu người dùng chỉ click chuột (không kéo) -> Tự động bắt lấy thẻ phần tử bên dưới con trỏ
      if (width < 15 && height < 15) {
        this.overlay.style.pointerEvents = 'none';
        const targetElement = document.elementFromPoint(e.clientX, e.clientY);
        this.overlay.style.pointerEvents = 'auto';

        if (targetElement && targetElement !== document.body && targetElement !== document.documentElement) {
          const rect = targetElement.getBoundingClientRect();
          left = Math.round(rect.left + window.scrollX);
          top = Math.round(rect.top + window.scrollY);
          width = Math.round(rect.width);
          height = Math.round(rect.height);

          this.selectionBox.style.left = `${left}px`;
          this.selectionBox.style.top = `${top}px`;
          this.selectionBox.style.width = `${width}px`;
          this.selectionBox.style.height = `${height}px`;
        }
      }

      if (width < 30 || height < 30) {
        this.selectionBox.style.display = 'none';
        return;
      }

      this.currentRect = { left, top, width, height };

      // Hiển thị Action Panel ngay bên cạnh hoặc dưới selection box
      this.actionPanel.style.display = 'flex';
      this.overlay.querySelector('#omni-panel-size').textContent = `${width} × ${height} px`;

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const panelWidth = 330;
      const panelHeight = 220;

      // Tính toạ độ hiển thị trong khung nhìn
      let panelLeft = left;
      let panelTop = top + height + 12;

      // Tránh tràn viền phải
      if (panelLeft + panelWidth > window.scrollX + viewportWidth - 20) {
        panelLeft = window.scrollX + viewportWidth - panelWidth - 20;
      }
      if (panelLeft < window.scrollX + 10) panelLeft = window.scrollX + 10;

      // Tránh tràn viền dưới (đẩy lên trên khung chọn)
      if (panelTop + panelHeight > window.scrollY + viewportHeight - 20) {
        panelTop = Math.max(window.scrollY + 10, top - panelHeight - 12);
      }

      this.actionPanel.style.left = `${panelLeft}px`;
      this.actionPanel.style.top = `${panelTop}px`;
    }

    updateProgress(percent, title, msg) {
      if (!this.statusPanel) return;
      this.statusPanel.style.display = 'flex';
      const pBar = this.statusPanel.querySelector('#omni-progress-bar');
      const pTitle = this.statusPanel.querySelector('#omni-status-title');
      const pMsg = this.statusPanel.querySelector('#omni-status-msg');

      if (pBar) pBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
      if (pTitle && title) pTitle.textContent = title;
      if (pMsg && msg) pMsg.textContent = msg;
    }

    // 5. QUY TRÌNH CHỤP VÙNG, CUỘN TRANG & CHIA TRANG A4 CHỐNG CẮT
    async executeRegionCapture() {
      if (!this.currentRect) return;

      this.actionPanel.style.display = 'none';
      this.selectionBox.style.display = 'none';
      const topHint = this.overlay.querySelector('#omniloader-top-hint');
      if (topHint) topHint.style.display = 'none';

      const dpr = window.devicePixelRatio || 1;
      const initialScrollX = window.scrollX;
      const initialScrollY = window.scrollY;
      const prevOverflow = document.documentElement.style.overflow;
      const prevScrollBehavior = document.documentElement.style.scrollBehavior;

      // Danh sách các phần tử cố định (fixed / sticky) để ẩn tạm thời tránh lặp lại nhiều lần khi cuộn
      const hiddenStickyElements = [];

      try {
        this.updateProgress(10, '⏳ Bước 1: Chuẩn bị nạp nội dung', 'Đang cuộn nạp tài liệu và kích hoạt hình ảnh lazy-load...');

        const maxDocHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, window.innerHeight);

        let scanTop = this.currentRect.top;
        let scanLeft = this.currentRect.left;
        let scanWidth = this.currentRect.width;
        let scanTotalHeight = this.mode === 'scroll_down'
          ? Math.max(maxDocHeight - scanTop, this.currentRect.height)
          : this.currentRect.height;

        // Tự động căn chỉnh chiều rộng nếu kéo quá sát lề
        if (scanLeft + scanWidth > window.innerWidth + window.scrollX) {
          scanWidth = window.innerWidth + window.scrollX - scanLeft;
        }

        // Bước A: Cuộn mượt xuống dưới để nạp các ảnh / lazy-load
        if (this.mode === 'scroll_down') {
          const scrollStep = Math.max(window.innerHeight * 0.8, 500);
          let curr = scanTop;
          while (curr < scanTop + scanTotalHeight) {
            window.scrollTo(scanLeft, curr);
            curr += scrollStep;
            await new Promise(r => setTimeout(r, 120));
          }
          window.scrollTo(scanLeft, scanTop);
          await new Promise(r => setTimeout(r, 250));
        }

        // Bước B: Tạm thời ẩn các thanh Navbar / Header / Floating ads bám dính (fixed/sticky)
        document.querySelectorAll('*').forEach(el => {
          if (this.overlay && this.overlay.contains(el)) return;
          const s = window.getComputedStyle(el);
          if (s.position === 'fixed' || s.position === 'sticky') {
            hiddenStickyElements.push({ el, prevVis: el.style.visibility, prevDisplay: el.style.display });
            el.style.setProperty('visibility', 'hidden', 'important');
          }
        });

        // Ẩn thanh cuộn trang web để chụp sạch sẽ
        document.documentElement.style.overflow = 'hidden';
        document.documentElement.style.scrollBehavior = 'auto';

        // Ẩn tạm thời overlay chính để chụp ảnh pixel-perfect
        this.overlay.style.background = 'transparent';
        this.overlay.style.backdropFilter = 'none';
        this.statusPanel.style.display = 'none';

        this.updateProgress(30, '📸 Bước 2: Chụp ảnh từng phần', 'Đang quét dữ liệu màn hình theo từng khung hình...');

        // Tạo Master Canvas gom toàn bộ vùng quét
        const masterCanvas = document.createElement('canvas');
        masterCanvas.width = Math.round(scanWidth * dpr);
        masterCanvas.height = Math.round(scanTotalHeight * dpr);
        const masterCtx = masterCanvas.getContext('2d');

        // Lấy màu nền của trang
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        const pageBgColor = (bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)') ? bodyBg : '#ffffff';
        masterCtx.fillStyle = pageBgColor;
        masterCtx.fillRect(0, 0, masterCanvas.width, masterCanvas.height);

        // Cuộn và chụp từng viewport
        const viewportH = window.innerHeight;
        let currentScrollY = scanTop;

        while (currentScrollY < scanTop + scanTotalHeight) {
          window.scrollTo(scanLeft, currentScrollY);
          await new Promise(r => setTimeout(r, 80));

          // Chụp ảnh viewport qua Service Worker
          const captureRes = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'CAPTURE_TAB_VIEWPORT' }, resolve);
          });

          if (!captureRes || !captureRes.success || !captureRes.dataUrl) {
            throw new Error(captureRes?.error || 'Không thể chụp ảnh màn hình.');
          }

          const capturedImg = await loadImage(captureRes.dataUrl);

          // Cắt phần tương ứng với vùng scanRect
          // Tọa độ viewport tương đối:
          const sliceH = Math.min(viewportH, (scanTop + scanTotalHeight) - currentScrollY);

          // Cắt từ capturedImg:
          // Vì đã window.scrollTo(scanLeft, currentScrollY), nên góc trái trên của viewport chính là (scanLeft, currentScrollY)
          const srcX = 0;
          const srcY = 0;
          const srcW = Math.min(capturedImg.width, Math.round(scanWidth * dpr));
          const srcH = Math.min(capturedImg.height, Math.round(sliceH * dpr));

          const destY = Math.round((currentScrollY - scanTop) * dpr);

          masterCtx.drawImage(
            capturedImg,
            srcX, srcY, srcW, srcH,
            0, destY, srcW, srcH
          );

          currentScrollY += viewportH;
          const progressPercent = Math.min(70, Math.round(30 + ((currentScrollY - scanTop) / scanTotalHeight) * 40));
          this.updateProgress(progressPercent, '📸 Bước 2: Chụp ảnh từng phần', `Đang chụp dữ liệu: ${progressPercent}%...`);
        }

        // Hiện lại Progress modal
        this.statusPanel.style.display = 'flex';
        this.updateProgress(75, '✂️ Bước 3: Phân tích chống cắt dòng chữ', 'Đang nhận diện các phần tử DOM & ngắt trang A4 thông minh...');

        // Bước C: Tính toán ngắt trang A4 chống cắt dòng chữ & hình ảnh
        // Tỷ lệ A4: Chiều cao = Chiều rộng * 1.4142
        const targetPageH = Math.round(scanWidth * 1.4142);
        const slices = computeSmartPageSlices(
          { left: scanLeft, top: scanTop, width: scanWidth, height: scanTotalHeight },
          scanTotalHeight,
          targetPageH
        );

        this.updateProgress(85, '📑 Bước 4: Đóng gói PDF', `Đang tạo ${slices.length} trang PDF chuẩn A4...`);

        // Bước D: Ghép từng trang vào PDF
        const pdfPages = [];

        for (let i = 0; i < slices.length; i++) {
          const sl = slices[i];
          const sliceHeight = sl.bottom - sl.top;

          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = Math.round(scanWidth * dpr);
          pageCanvas.height = Math.round(targetPageH * dpr);
          const pCtx = pageCanvas.getContext('2d');

          // Tô màu nền trang
          pCtx.fillStyle = pageBgColor;
          pCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

          // Vẽ phần nội dung vào trang (ở đầu trang, giữ trọn vẹn không bị cắt)
          pCtx.drawImage(
            masterCanvas,
            0, Math.round(sl.top * dpr), Math.round(scanWidth * dpr), Math.round(sliceHeight * dpr),
            0, 0, Math.round(scanWidth * dpr), Math.round(sliceHeight * dpr)
          );

          const jpegDataUrl = pageCanvas.toDataURL('image/jpeg', 0.95);
          pdfPages.push({
            dataUrl: jpegDataUrl,
            width: 595.28, // Kích thước A4 chuẩn trong đơn vị Point của PDF
            height: 841.89,
            pixelWidth: pageCanvas.width,
            pixelHeight: pageCanvas.height
          });
        }

        this.updateProgress(95, '⏳ Bước 5: Tạo file tải về', 'Đang nén dữ liệu & xuất file PDF...');

        const pdfBlob = createPdfFromImages(pdfPages);
        if (!pdfBlob) throw new Error('Không tạo được file PDF từ các trang.');

        const reader = new FileReader();
        reader.onloadend = () => {
          const pageTitle = sanitizeFilename(document.title || 'Tai_Lieu_Web');
          const cleanName = `${pageTitle}_QuetVung_${Date.now()}.pdf`;

          chrome.runtime.sendMessage({
            action: 'DOWNLOAD_DIRECT',
            url: reader.result,
            filename: cleanName
          }, (dlRes) => {
            this.statusPanel.querySelector('#omni-status-spinner').style.display = 'none';
            this.updateProgress(100, '✓ Đã xuất PDF thành công!', `Đã tải về máy: ${cleanName} (${pdfPages.length} trang chuẩn A4)`);

            setTimeout(() => {
              this.destroy();
            }, 3000);
          });
        };
        reader.readAsDataURL(pdfBlob);

      } catch (err) {
        console.error('OmniLoader Region Scan Error:', err);
        if (this.statusPanel) {
          this.statusPanel.querySelector('#omni-status-spinner').style.display = 'none';
          this.updateProgress(0, '❌ Lỗi xuất PDF', err.message || 'Không thể chụp và tạo file PDF.');
          setTimeout(() => this.destroy(), 3500);
        }
      } finally {
        // Khôi phục lại trạng thái ban đầu của trang web
        document.documentElement.style.overflow = prevOverflow;
        document.documentElement.style.scrollBehavior = prevScrollBehavior;
        hiddenStickyElements.forEach(({ el, prevVis, prevDisplay }) => {
          if (prevVis) el.style.visibility = prevVis;
          else el.style.removeProperty('visibility');
          if (prevDisplay) el.style.display = prevDisplay;
          else el.style.removeProperty('display');
        });
        window.scrollTo(initialScrollX, initialScrollY);
      }
    }
  }

  // Khởi tạo Singleton
  const regionScanner = new RegionScanController();

  // Lắng nghe lệnh khởi động từ Extension Popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_REGION_CAPTURE') {
      regionScanner.start();
      sendResponse({ success: true });
      return true;
    }
  });

  // Hỗ trợ gọi trực tiếp từ window nếu cần
  window.__omniStartRegionCapture = () => regionScanner.start();

})();
