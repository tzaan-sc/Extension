// OmniLoader - Region Scan to Paginated PDF with Smart Page Break
// Tính năng quét vùng chọn, cuộn trang xuống dưới và xuất PDF chuẩn A4, chống cắt ngang dòng chữ & hình ảnh.

(function () {
  'use strict';

  // Nếu đã được inject trước đó, kích hoạt mở ngay và thoát
  if (window.__omniRegionSelectorInstance) {
    window.__omniRegionSelectorInstance.start();
    return;
  }

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
      addLine(`<< /Type /XObject /Subtype /Image /Width ${img.pixelWidth || 800} /Height ${img.pixelHeight || 1100} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${rawBinary.length} >>\nstream`);
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
      img.onerror = () => reject(new Error('Lỗi nạp ảnh chụp màn hình'));
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
      if (el.closest('#omniloader-region-overlay') || el.closest('#omniloader-status-panel')) return;

      const rect = el.getBoundingClientRect();
      const elLeft = rect.left + window.scrollX;
      const elRight = rect.right + window.scrollX;
      const elTop = rect.top + window.scrollY;
      const elBottom = rect.bottom + window.scrollY;

      // Kiểm tra có giao với vùng quét không
      if (elRight < regionLeft || elLeft > regionRight) return;
      if (elBottom < startY || elTop > startY + totalHeight) return;

      const relTop = elTop - startY;
      const relBottom = elBottom - startY;

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

      // Trích xuất toạ độ từng dòng chữ chi tiết (sử dụng Range)
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

    items.sort((a, b) => a.top - b.top);

    const slices = [];
    let currentY = 0;
    const minPageHeight = targetPageHeight * 0.60;

    while (currentY < totalHeight) {
      if (currentY + targetPageHeight >= totalHeight) {
        slices.push({ top: currentY, bottom: totalHeight });
        break;
      }

      const idealCut = currentY + targetPageHeight;

      // Tìm phần tử xung đột bị cắt ngang
      const conflictingItem = items.find(it => it.top + 2 < idealCut && it.bottom - 2 > idealCut);

      if (!conflictingItem) {
        slices.push({ top: currentY, bottom: Math.round(idealCut) });
        currentY = Math.round(idealCut);
      } else {
        let safeCut = -1;

        const candidateBeforeConflict = Math.round(conflictingItem.top - 4);
        if (candidateBeforeConflict >= currentY + minPageHeight) {
          safeCut = candidateBeforeConflict;
        }

        if (safeCut === -1) {
          const validOptions = items
            .filter(it => it.top - 4 <= idealCut && it.top - 4 >= currentY + minPageHeight)
            .map(it => Math.round(it.top - 4))
            .sort((a, b) => b - a);

          if (validOptions.length > 0) {
            safeCut = validOptions[0];
          }
        }

        if (safeCut === -1) {
          const widerOptions = items
            .filter(it => it.top - 4 <= idealCut && it.top - 4 >= currentY + targetPageHeight * 0.45)
            .map(it => Math.round(it.top - 4))
            .sort((a, b) => b - a);

          if (widerOptions.length > 0) {
            safeCut = widerOptions[0];
          } else {
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
      this.statusPanel = null;
      this.isDragging = false;
      this.startX = 0;
      this.startY = 0;
      this.viewportRect = null;
      this.mode = 'scroll_down'; // 'scroll_down' | 'box_only'
      this.boundMouseDown = this.onMouseDown.bind(this);
      this.boundMouseMove = this.onMouseMove.bind(this);
      this.boundMouseUp = this.onMouseUp.bind(this);
      this.boundKeyDown = this.onKeyDown.bind(this);
    }

    start() {
      this.destroy();
      this.createOverlay();
    }

    destroy() {
      if (this.overlay) {
        this.overlay.remove();
        this.overlay = null;
      }
      window.removeEventListener('mousemove', this.boundMouseMove);
      window.removeEventListener('mouseup', this.boundMouseUp);
      document.removeEventListener('keydown', this.boundKeyDown);
    }

    createOverlay() {
      this.overlay = document.createElement('div');
      this.overlay.id = 'omniloader-region-overlay';

      // Áp dụng trực tiếp style cssText để chống chặn bởi CSP
      this.overlay.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        background: rgba(15, 23, 42, 0.45) !important;
        z-index: 2147483640 !important;
        cursor: crosshair !important;
        user-select: none !important;
        backdrop-filter: blur(1.5px) !important;
        font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif !important;
      `;

      this.overlay.innerHTML = `
        <div id="omniloader-top-hint" style="
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
        ">
          <span style="background: linear-gradient(135deg, #10b981, #3b82f6); color: #fff; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 700;">🎯 QUÉT VÙNG XUẤT PDF</span>
          <span>Kéo chuột chọn vùng tài liệu cần quét (Nhấn <b>ESC</b> để hủy)</span>
        </div>

        <div id="omniloader-selection-box" style="
          position: fixed;
          border: 2px dashed #38bdf8;
          background: rgba(56, 189, 248, 0.12);
          box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.45), 0 0 20px rgba(56, 189, 248, 0.3);
          pointer-events: none;
          display: none;
          z-index: 2147483642;
          border-radius: 4px;
        ">
          <div id="omniloader-dimension-tag" style="
            position: absolute;
            bottom: -28px; right: 0;
            background: #0284c7;
            color: #fff;
            font-size: 11px;
            font-weight: 700;
            padding: 3px 8px;
            border-radius: 4px;
            white-space: nowrap;
          ">0 × 0 px</div>
        </div>

        <div id="omniloader-action-panel" style="
          position: fixed;
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
        ">
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 13px; font-weight: 700; color: #38bdf8; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 8px;">
            <span>📐 CÀI ĐẶT XUẤT PDF</span>
            <span id="omni-panel-size" style="font-size: 11px; color: #94a3b8;">0 × 0 px</span>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #cbd5e1; cursor: pointer; padding: 6px 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.03);">
              <input type="radio" name="omni-scan-mode" value="scroll_down" checked style="margin-top: 2px;">
              <div>
                <b style="color: #38bdf8;">Quét từ vùng này xuống hết trang</b>
                <div style="font-size: 10.5px; color: #94a3b8; margin-top: 2px;">Tự động cuộn nạp toàn bộ bài viết, chống cắt ngang dòng chữ & ngắt trang A4 chuẩn.</div>
              </div>
            </label>

            <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #cbd5e1; cursor: pointer; padding: 6px 8px; border-radius: 8px; background: rgba(255, 255, 255, 0.03);">
              <input type="radio" name="omni-scan-mode" value="box_only" style="margin-top: 2px;">
              <div>
                <b>Chỉ quét trong khung đã chọn</b>
                <div style="font-size: 10.5px; color: #94a3b8; margin-top: 2px;">Chỉ xuất nội dung nằm trọn vẹn trong hình chữ nhật vừa kéo.</div>
              </div>
            </label>
          </div>

          <div style="display: flex; gap: 8px; margin-top: 4px;">
            <button id="omni-btn-start" style="flex: 2; background: linear-gradient(135deg, #10b981, #0284c7); color: #fff; border: none; padding: 9px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <span>🚀 Bắt đầu xuất PDF</span>
            </button>
            <button id="omni-btn-reselect" style="flex: 1; background: rgba(255, 255, 255, 0.08); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.12); padding: 9px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;">
              <span>Chọn lại</span>
            </button>
            <button id="omni-btn-close" style="flex: 1; background: rgba(255, 255, 255, 0.08); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.12); padding: 9px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer;">
              <span>Hủy</span>
            </button>
          </div>
        </div>

        <div id="omniloader-status-panel" style="
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
        ">
          <div id="omni-status-spinner" style="
            width: 36px; height: 36px;
            border: 3.5px solid rgba(16, 185, 129, 0.2);
            border-top-color: #10b981;
            border-radius: 50%;
            margin: 0 auto;
            animation: omniSpin 0.8s linear infinite;
          "></div>
          <div id="omni-status-title" style="font-size: 15px; font-weight: 700; color: #38bdf8;">Đang xử lý quét tài liệu...</div>
          <div style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 10px; overflow: hidden;">
            <div id="omni-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #10b981, #38bdf8); border-radius: 10px; transition: width 0.3s ease;"></div>
          </div>
          <div id="omni-status-msg" style="font-size: 12px; color: #94a3b8; line-height: 1.5;">Chuẩn bị cuộn nạp tài liệu...</div>
        </div>
      `;

      // Bổ sung animation keyframes nhẹ
      if (!document.getElementById('omniloader-keyframes')) {
        const style = document.createElement('style');
        style.id = 'omniloader-keyframes';
        style.textContent = `@keyframes omniSpin { to { transform: rotate(360deg); } }`;
        document.head.appendChild(style);
      }

      const targetParent = document.body || document.documentElement;
      if (targetParent) {
        targetParent.appendChild(this.overlay);
      }

      this.selectionBox = this.overlay.querySelector('#omniloader-selection-box');
      this.actionPanel = this.overlay.querySelector('#omniloader-action-panel');
      this.statusPanel = this.overlay.querySelector('#omniloader-status-panel');

      // Gắn sự kiện chuột
      this.overlay.addEventListener('mousedown', this.boundMouseDown);
      window.addEventListener('mousemove', this.boundMouseMove);
      window.addEventListener('mouseup', this.boundMouseUp);
      document.addEventListener('keydown', this.boundKeyDown);

      // Nút tương tác
      this.overlay.querySelector('#omni-btn-close').addEventListener('click', () => this.destroy());
      this.overlay.querySelector('#omni-btn-reselect').addEventListener('click', () => {
        this.actionPanel.style.display = 'none';
        this.selectionBox.style.display = 'none';
        this.viewportRect = null;
      });

      this.overlay.querySelector('#omni-btn-start').addEventListener('click', () => {
        const selectedMode = this.overlay.querySelector('input[name="omni-scan-mode"]:checked')?.value || 'scroll_down';
        this.mode = selectedMode;
        this.executeRegionCapture();
      });

      this.actionPanel.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    onKeyDown(e) {
      if (e.key === 'Escape') this.destroy();
    }

    onMouseDown(e) {
      if (e.button !== 0) return;
      if (this.actionPanel && this.actionPanel.contains(e.target)) return;
      if (this.statusPanel && this.statusPanel.contains(e.target)) return;

      this.isDragging = true;
      // DÙNG clientX/clientY vì overlay có position: fixed!
      this.startX = e.clientX;
      this.startY = e.clientY;

      this.actionPanel.style.display = 'none';
      this.selectionBox.style.display = 'block';
      this.selectionBox.style.left = `${this.startX}px`;
      this.selectionBox.style.top = `${this.startY}px`;
      this.selectionBox.style.width = '0px';
      this.selectionBox.style.height = '0px';
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

      // Nếu nhấp chuột mà không kéo -> tự động nhận diện phần tử bên dưới
      if (width < 12 && height < 12) {
        this.overlay.style.pointerEvents = 'none';
        const targetElement = document.elementFromPoint(e.clientX, e.clientY);
        this.overlay.style.pointerEvents = 'auto';

        if (targetElement && targetElement !== document.body && targetElement !== document.documentElement) {
          const rect = targetElement.getBoundingClientRect();
          left = Math.round(rect.left);
          top = Math.round(rect.top);
          width = Math.round(rect.width);
          height = Math.round(rect.height);

          this.selectionBox.style.left = `${left}px`;
          this.selectionBox.style.top = `${top}px`;
          this.selectionBox.style.width = `${width}px`;
          this.selectionBox.style.height = `${height}px`;
        }
      }

      if (width < 25 || height < 25) {
        this.selectionBox.style.display = 'none';
        return;
      }

      this.viewportRect = { left, top, width, height };

      // Hiển thị Action Panel
      this.actionPanel.style.display = 'flex';
      this.overlay.querySelector('#omni-panel-size').textContent = `${width} × ${height} px`;

      const panelWidth = 330;
      const panelHeight = 220;

      let panelLeft = left;
      let panelTop = top + height + 12;

      if (panelLeft + panelWidth > window.innerWidth - 20) {
        panelLeft = window.innerWidth - panelWidth - 20;
      }
      if (panelLeft < 10) panelLeft = 10;

      if (panelTop + panelHeight > window.innerHeight - 20) {
        panelTop = Math.max(10, top - panelHeight - 12);
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
      if (!this.viewportRect) return;

      this.actionPanel.style.display = 'none';
      this.selectionBox.style.display = 'none';
      const topHint = this.overlay.querySelector('#omniloader-top-hint');
      if (topHint) topHint.style.display = 'none';

      const dpr = window.devicePixelRatio || 1;
      const initialScrollX = window.scrollX;
      const initialScrollY = window.scrollY;
      const prevOverflow = document.documentElement.style.overflow;
      const prevScrollBehavior = document.documentElement.style.scrollBehavior;

      const hiddenStickyElements = [];

      try {
        this.updateProgress(10, '⏳ Bước 1: Chuẩn bị nạp nội dung', 'Đang cuộn nạp tài liệu và kích hoạt hình ảnh lazy-load...');

        const maxDocHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, window.innerHeight);

        // Chuyển đổi từ toạ độ Viewport sang toạ độ Tuyệt đối của trang web
        const scanLeft = Math.max(0, Math.round(this.viewportRect.left + initialScrollX));
        const scanTop = Math.max(0, Math.round(this.viewportRect.top + initialScrollY));
        const scanWidth = Math.round(this.viewportRect.width);
        const scanBoxHeight = Math.round(this.viewportRect.height);

        const scanTotalHeight = this.mode === 'scroll_down'
          ? Math.max(maxDocHeight - scanTop, scanBoxHeight)
          : scanBoxHeight;

        // Cuộn nạp lười nếu là chế độ cuộn trang
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

        // Tạm ẩn các phần tử fixed / sticky
        document.querySelectorAll('*').forEach(el => {
          if (this.overlay && this.overlay.contains(el)) return;
          const s = window.getComputedStyle(el);
          if (s.position === 'fixed' || s.position === 'sticky') {
            hiddenStickyElements.push({ el, prevVis: el.style.visibility, prevDisplay: el.style.display });
            el.style.setProperty('visibility', 'hidden', 'important');
          }
        });

        document.documentElement.style.overflow = 'hidden';
        document.documentElement.style.scrollBehavior = 'auto';

        // Tạm ẩn overlay khi chụp
        this.overlay.style.background = 'transparent';
        this.overlay.style.backdropFilter = 'none';
        this.statusPanel.style.display = 'none';

        this.updateProgress(30, '📸 Bước 2: Chụp ảnh từng phần', 'Đang quét dữ liệu màn hình theo từng khung hình...');

        const masterCanvas = document.createElement('canvas');
        masterCanvas.width = Math.round(scanWidth * dpr);
        masterCanvas.height = Math.round(scanTotalHeight * dpr);
        const masterCtx = masterCanvas.getContext('2d');

        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        const pageBgColor = (bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)') ? bodyBg : '#ffffff';
        masterCtx.fillStyle = pageBgColor;
        masterCtx.fillRect(0, 0, masterCanvas.width, masterCanvas.height);

        const viewportH = window.innerHeight;
        let currentScrollY = scanTop;

        while (currentScrollY < scanTop + scanTotalHeight) {
          window.scrollTo(scanLeft, currentScrollY);
          await new Promise(r => setTimeout(r, 90));

          const captureRes = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'CAPTURE_TAB_VIEWPORT' }, resolve);
          });

          if (!captureRes || !captureRes.success || !captureRes.dataUrl) {
            throw new Error(captureRes?.error || 'Không thể chụp ảnh màn hình.');
          }

          const capturedImg = await loadImage(captureRes.dataUrl);

          const sliceH = Math.min(viewportH, (scanTop + scanTotalHeight) - currentScrollY);
          const srcW = Math.min(capturedImg.width, Math.round(scanWidth * dpr));
          const srcH = Math.min(capturedImg.height, Math.round(sliceH * dpr));
          const destY = Math.round((currentScrollY - scanTop) * dpr);

          masterCtx.drawImage(
            capturedImg,
            0, 0, srcW, srcH,
            0, destY, srcW, srcH
          );

          currentScrollY += viewportH;
          const progressPercent = Math.min(70, Math.round(30 + ((currentScrollY - scanTop) / scanTotalHeight) * 40));
          this.updateProgress(progressPercent, '📸 Bước 2: Chụp ảnh từng phần', `Đang chụp dữ liệu: ${progressPercent}%...`);
        }

        this.statusPanel.style.display = 'flex';
        this.updateProgress(75, '✂️ Bước 3: Phân tích chống cắt dòng chữ', 'Đang nhận diện các phần tử DOM & ngắt trang A4 thông minh...');

        const targetPageH = Math.round(scanWidth * 1.4142);
        const slices = computeSmartPageSlices(
          { left: scanLeft, top: scanTop, width: scanWidth, height: scanTotalHeight },
          scanTotalHeight,
          targetPageH
        );

        this.updateProgress(85, '📑 Bước 4: Đóng gói PDF', `Đang tạo ${slices.length} trang PDF chuẩn A4...`);

        const pdfPages = [];

        for (let i = 0; i < slices.length; i++) {
          const sl = slices[i];
          const sliceHeight = sl.bottom - sl.top;

          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = Math.round(scanWidth * dpr);
          pageCanvas.height = Math.round(targetPageH * dpr);
          const pCtx = pageCanvas.getContext('2d');

          pCtx.fillStyle = pageBgColor;
          pCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

          pCtx.drawImage(
            masterCanvas,
            0, Math.round(sl.top * dpr), Math.round(scanWidth * dpr), Math.round(sliceHeight * dpr),
            0, 0, Math.round(scanWidth * dpr), Math.round(sliceHeight * dpr)
          );

          const jpegDataUrl = pageCanvas.toDataURL('image/jpeg', 0.95);
          pdfPages.push({
            dataUrl: jpegDataUrl,
            width: 595.28,
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
          }, () => {
            const spinner = this.statusPanel.querySelector('#omni-status-spinner');
            if (spinner) spinner.style.display = 'none';
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
          const spinner = this.statusPanel.querySelector('#omni-status-spinner');
          if (spinner) spinner.style.display = 'none';
          this.updateProgress(0, '❌ Lỗi xuất PDF', err.message || 'Không thể chụp và tạo file PDF.');
          setTimeout(() => this.destroy(), 3500);
        }
      } finally {
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

  // Gán instance toàn cục
  const regionScanner = new RegionScanController();
  window.__omniRegionSelectorInstance = regionScanner;
  window.__omniStartRegionCapture = () => regionScanner.start();

  // Lắng nghe lệnh khởi động từ Extension Popup hoặc Service Worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_REGION_CAPTURE') {
      regionScanner.start();
      sendResponse({ success: true });
      return true;
    }
  });

  // Tự khởi động ngay khi file vừa được load
  regionScanner.start();

})();
