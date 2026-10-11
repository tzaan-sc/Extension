// OmniLoader - Region Scan to Paginated PDF with Smart Page Break
// Tính năng quét vùng chọn, cuộn trang xuống dưới và xuất PDF chuẩn A4, chống cắt ngang dòng chữ & hình ảnh.

(function () {
  'use strict';

  // Dọn dẹp instance cũ nếu có để cho phép nạp lại mã mới nhất mà không bắt người dùng phải F5 lại trang
  if (window.__omniRegionSelectorInstance) {
    try {
      window.__omniRegionSelectorInstance.destroy();
    } catch (e) {}
  }

  // 1. PURE JS PDF BUILDER (PDF-1.4 Native Generator - Binary Safe)
  function createPdfFromImages(images) {
    if (!images || images.length === 0) return null;

    const chunks = [];
    const objectOffsets = [];
    let currentOffset = 0;
    const encoder = new TextEncoder();

    function pushBytes(bytes) {
      chunks.push(bytes);
      currentOffset += bytes.length;
    }

    function addLine(str) {
      pushBytes(encoder.encode(str + '\n'));
    }

    function markObject(objNum) {
      objectOffsets[objNum] = currentOffset;
      addLine(`${objNum} 0 obj`);
    }

    // PDF Header (Bắt buộc cho mọi trình đọc PDF)
    addLine('%PDF-1.4');
    pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

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

      const streamContent = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${i + 1} Do\nQ\n`;
      const streamBytes = encoder.encode(streamContent);
      markObject(contentObjNum);
      addLine(`<< /Length ${streamBytes.length} >>\nstream`);
      pushBytes(streamBytes);
      addLine('endstream');
      addLine('endobj');

      const base64Data = img.dataUrl.split(',')[1];
      const rawBinaryString = atob(base64Data);
      const imgBytes = new Uint8Array(rawBinaryString.length);
      for (let b = 0; b < rawBinaryString.length; b++) {
        imgBytes[b] = rawBinaryString.charCodeAt(b);
      }

      markObject(imageObjNum);
      addLine(`<< /Type /XObject /Subtype /Image /Width ${img.pixelWidth || 800} /Height ${img.pixelHeight || 1100} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream`);
      pushBytes(imgBytes);
      addLine('\nendstream');
      addLine('endobj');
    }

    const startXref = currentOffset;
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

    return new Blob(chunks, { type: 'application/pdf' });
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

        if (safeCut <= currentY + 30) {
          safeCut = Math.round(Math.min(currentY + targetPageHeight, totalHeight));
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
          width: 420px;
          max-width: 90vw;
          color: #f8fafc;
          z-index: 2147483647;
          display: none;
          flex-direction: column;
          gap: 14px;
          text-align: center;
          box-sizing: border-box;
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
          <div id="omni-progress-wrapper" style="width: 100%; height: 6px; background: rgba(255, 255, 255, 0.1); border-radius: 10px; overflow: hidden;">
            <div id="omni-progress-bar" style="width: 0%; height: 100%; background: linear-gradient(90deg, #10b981, #38bdf8); border-radius: 10px; transition: width 0.3s ease;"></div>
          </div>
          <div id="omni-status-msg" style="font-size: 12px; color: #94a3b8; line-height: 1.5;">Chuẩn bị cuộn nạp tài liệu...</div>
          
          <!-- Khu vực hiển thị chẩn đoán lỗi chi tiết khi gặp sự cố -->
          <div id="omni-error-box" style="display: none; flex-direction: column; gap: 10px; text-align: left; margin-top: 4px;">
            <div style="font-size: 11px; font-weight: 600; color: #f87171; display: flex; align-items: center; gap: 5px;">
              <span>⚠️ Chi tiết lỗi kỹ thuật:</span>
            </div>
            <textarea id="omni-error-text" readonly style="
              width: 100%; height: 120px;
              background: rgba(0, 0, 0, 0.5);
              border: 1px solid rgba(239, 68, 68, 0.35);
              border-radius: 8px;
              color: #fca5a5;
              font-family: Consolas, monospace;
              font-size: 11px;
              padding: 8px;
              resize: none;
              box-sizing: border-box;
              line-height: 1.4;
            "></textarea>
            <div style="display: flex; gap: 8px;">
              <button id="omni-btn-copy-error" style="
                flex: 1;
                background: linear-gradient(135deg, #ef4444, #dc2626);
                color: #fff;
                border: none;
                padding: 8px 12px;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
              ">📋 Sao chép lỗi gửi hỗ trợ</button>
              <button id="omni-btn-error-close" style="
                background: rgba(255, 255, 255, 0.1);
                color: #cbd5e1;
                border: 1px solid rgba(255, 255, 255, 0.15);
                padding: 8px 14px;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
              ">✕ Đóng</button>
            </div>
          </div>
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

      // Xử lý nút trong hộp chẩn đoán lỗi
      const btnErrorClose = this.overlay.querySelector('#omni-btn-error-close');
      if (btnErrorClose) {
        btnErrorClose.addEventListener('click', () => this.destroy());
      }

      const btnCopyError = this.overlay.querySelector('#omni-btn-copy-error');
      if (btnCopyError) {
        btnCopyError.addEventListener('click', () => {
          const errTextarea = this.overlay.querySelector('#omni-error-text');
          if (errTextarea && errTextarea.value) {
            navigator.clipboard.writeText(errTextarea.value).then(() => {
              btnCopyError.textContent = '✓ Đã sao chép! Hãy dán vào chat';
              btnCopyError.style.background = '#059669';
              setTimeout(() => {
                btnCopyError.textContent = '📋 Sao chép lỗi gửi hỗ trợ';
                btnCopyError.style.background = 'linear-gradient(135deg, #ef4444, #dc2626)';
              }, 3000);
            }).catch(() => {
              errTextarea.select();
              document.execCommand('copy');
              btnCopyError.textContent = '✓ Đã sao chép!';
            });
          }
        });
      }

      this.actionPanel.addEventListener('mousedown', (e) => e.stopPropagation());
      this.statusPanel.addEventListener('mousedown', (e) => e.stopPropagation());
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

    showDiagnosticError(stepName, err, extraInfo = {}) {
      if (!this.statusPanel) return;
      if (this.overlay) {
        this.overlay.style.visibility = 'visible';
        this.overlay.style.display = 'block';
      }
      this.statusPanel.style.display = 'flex';

      const spinner = this.statusPanel.querySelector('#omni-status-spinner');
      if (spinner) spinner.style.display = 'none';

      const progressBar = this.statusPanel.querySelector('#omni-progress-bar');
      if (progressBar) progressBar.style.background = '#ef4444';

      const pTitle = this.statusPanel.querySelector('#omni-status-title');
      if (pTitle) {
        pTitle.textContent = `❌ Lỗi tại: ${stepName}`;
        pTitle.style.color = '#ef4444';
      }

      const pMsg = this.statusPanel.querySelector('#omni-status-msg');
      if (pMsg) {
        pMsg.textContent = (err && err.message) || String(err) || 'Đã xảy ra sự cố trong quá trình xuất PDF.';
      }

      const errorBox = this.statusPanel.querySelector('#omni-error-box');
      const errorTextarea = this.statusPanel.querySelector('#omni-error-text');

      if (errorBox && errorTextarea) {
        errorBox.style.display = 'flex';
        const report = [
          `[OMNILOADER REGION SCAN REPORT]`,
          `Thời gian: ${new Date().toLocaleString()}`,
          `URL: ${window.location.href}`,
          `Bước phát sinh lỗi: ${stepName}`,
          `Lỗi (Name): ${(err && err.name) || 'Error'}`,
          `Thông điệp (Message): ${(err && err.message) || String(err)}`,
          `Kích thước vùng quét: W=${extraInfo.scanWidth || 'N/A'}, H=${extraInfo.scanHeight || 'N/A'} (Mode: ${extraInfo.mode || this.mode})`,
          `Viewport: ${window.innerWidth}x${window.innerHeight}, DPR: ${window.devicePixelRatio || 1}`,
          `Trang web: scrollHeight=${document.documentElement.scrollHeight}`,
          `Stack Trace:`,
          (err && err.stack) || 'Không có stack trace'
        ].join('\n');

        errorTextarea.value = report;
      }
    }

    // 5. QUY TRÌNH CHỤP VÙNG, CUỘN TRANG & CHIA TRANG A4 CHỐNG CẮT
    async executeRegionCapture() {
      if (!this.viewportRect) {
        alert('Vui lòng kéo chuột chọn vùng tài liệu cần xuất PDF trước khi bắt đầu.');
        return;
      }

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
      let currentStep = 'Khởi tạo quy trình';
      let scanWidth = 0;
      let scanTotalHeight = 0;

      try {
        currentStep = 'Bước 1: Kết nối Service Worker';
        this.updateProgress(5, '⏳ Bước 1: Kết nối hệ thống', 'Đang xác thực kết nối với tiến trình nền...');

        const pingRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ action: 'PING' }, (resp) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(resp || { success: false, error: 'Phản hồi rỗng từ Background Worker' });
            }
          });
        });

        if (!pingRes || (!pingRes.pong && !pingRes.success)) {
          throw new Error(
            `Không thể kết nối với Service Worker tiện ích: "${pingRes?.error || 'Không có phản hồi'}". ` +
            `Vui lòng vào chrome://extensions bấm nút Làm mới (Reload 🔄) tiện ích và F5 tải lại trang web này.`
          );
        }

        currentStep = 'Bước 1: Chuẩn bị nội dung & cuộn nạp';
        this.updateProgress(10, '⏳ Bước 1: Chuẩn bị nạp nội dung', 'Đang cuộn nạp tài liệu và kích hoạt hình ảnh lazy-load...');

        const maxDocHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, window.innerHeight);

        // Chuyển đổi từ toạ độ Viewport sang toạ độ Tuyệt đối của trang web
        const scanLeft = Math.max(0, Math.round(this.viewportRect.left + initialScrollX));
        const scanTop = Math.max(0, Math.round(this.viewportRect.top + initialScrollY));
        scanWidth = Math.round(this.viewportRect.width);
        const scanBoxHeight = Math.round(this.viewportRect.height);

        // Giới hạn chiều cao an toàn tối đa để trình duyệt không bị sập bộ nhớ Canvas (tối đa 15000px)
        const rawTotalHeight = this.mode === 'scroll_down'
          ? Math.max(maxDocHeight - scanTop, scanBoxHeight)
          : scanBoxHeight;
        scanTotalHeight = Math.min(rawTotalHeight, 15000);

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

        currentStep = 'Bước 2: Phân bổ Master Canvas & Chụp ảnh';
        this.updateProgress(25, '📸 Bước 2: Chụp ảnh từng khung', 'Đang quét dữ liệu màn hình theo từng khung hình...');

        const effectiveDpr = Math.min(dpr, 1.25);
        const maxCanvasHeight = 16000;
        const boundedTotalHeight = Math.min(scanTotalHeight, Math.floor(maxCanvasHeight / effectiveDpr));

        const masterCanvas = document.createElement('canvas');
        masterCanvas.width = Math.round(scanWidth * effectiveDpr);
        masterCanvas.height = Math.round(boundedTotalHeight * effectiveDpr);
        let masterCtx = masterCanvas.getContext('2d');
        if (!masterCtx) {
          masterCanvas.width = Math.round(scanWidth);
          masterCanvas.height = Math.round(boundedTotalHeight);
          masterCtx = masterCanvas.getContext('2d');
        }
        if (!masterCtx) {
          throw new Error('Trình duyệt không đủ bộ nhớ đồ họa để phân bổ Canvas chụp ảnh.');
        }

        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        const pageBgColor = (bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)') ? bodyBg : '#ffffff';
        masterCtx.fillStyle = pageBgColor;
        masterCtx.fillRect(0, 0, masterCanvas.width, masterCanvas.height);

        const viewportH = window.innerHeight;
        let currentScrollY = scanTop;

        let lastCaptureError = '';
        const safeCaptureVisibleTab = async () => {
          for (let attempt = 0; attempt < 8; attempt++) {
            const captureRes = await new Promise((resolve) => {
              chrome.runtime.sendMessage({
                action: 'CAPTURE_TAB_VIEWPORT',
                format: 'jpeg',
                quality: 90
              }, (resp) => {
                if (chrome.runtime.lastError) {
                  resolve({ success: false, error: chrome.runtime.lastError.message });
                } else {
                  resolve(resp || { success: false, error: 'Phản hồi rỗng từ Background Worker' });
                }
              });
            });
            if (captureRes && captureRes.success && captureRes.dataUrl) {
              return captureRes.dataUrl;
            }
            lastCaptureError = (captureRes && captureRes.error) || 'Lỗi chụp màn hình không xác định';
            console.warn(`[OmniLoader] Thử lại chụp màn hình (Lần ${attempt + 1}):`, lastCaptureError);
            await new Promise((r) => setTimeout(r, 600));
          }
          throw new Error(`Trình duyệt không thể chụp màn hình: "${lastCaptureError}". Vui lòng đảm bảo tab đang hiển thị.`);
        };

        currentStep = 'Bước 2: Chụp cuộn từng màn hình';
        while (currentScrollY < scanTop + boundedTotalHeight) {
          window.scrollTo(scanLeft, currentScrollY);
          await new Promise(r => setTimeout(r, 380));

          // Ẩn overlay trước khi chụp để ảnh trong veo, sạch sẽ không dính khung điều khiển
          if (this.overlay) this.overlay.style.visibility = 'hidden';
          await new Promise(r => requestAnimationFrame(r));

          const dataUrl = await safeCaptureVisibleTab();

          // Hiện lại overlay ngay sau khi chụp để người dùng theo dõi thanh tiến trình
          if (this.overlay) this.overlay.style.visibility = 'visible';

          const capturedImg = await loadImage(dataUrl);

          const scaleX = capturedImg.width / window.innerWidth;
          const scaleY = capturedImg.height / window.innerHeight;

          const actualScrollX = window.scrollX;
          const actualScrollY = window.scrollY;

          const viewLeft = scanLeft - actualScrollX;
          const viewTop = currentScrollY - actualScrollY;
          const viewWidth = scanWidth;
          const viewHeight = Math.min(viewportH, (scanTop + boundedTotalHeight) - currentScrollY);

          const cropX = Math.max(0, Math.round(viewLeft * scaleX));
          const cropY = Math.max(0, Math.round(viewTop * scaleY));
          const cropW = Math.min(capturedImg.width - cropX, Math.round(viewWidth * scaleX));
          const cropH = Math.min(capturedImg.height - cropY, Math.round(viewHeight * scaleY));

          const destX = 0;
          const destY = Math.round((currentScrollY - scanTop) * effectiveDpr);
          const destW = Math.round(cropW * (effectiveDpr / scaleX));
          const destH = Math.round(cropH * (effectiveDpr / scaleY));

          masterCtx.drawImage(
            capturedImg,
            cropX, cropY, cropW, cropH,
            destX, destY, destW, destH
          );

          currentScrollY += viewportH;
          const progressPercent = Math.min(70, Math.round(25 + ((currentScrollY - scanTop) / boundedTotalHeight) * 45));
          this.updateProgress(progressPercent, '📸 Bước 2: Chụp ảnh từng phần', `Đang chụp dữ liệu: ${progressPercent}%...`);
        }

        if (this.overlay) this.overlay.style.visibility = 'visible';
        currentStep = 'Bước 3: Phân tích DOM chống cắt chữ';
        this.updateProgress(75, '✂️ Bước 3: Phân tích chống cắt dòng chữ', 'Đang nhận diện các phần tử DOM & ngắt trang A4 thông minh...');

        const targetPageH = Math.round(scanWidth * 1.4142);
        const slices = computeSmartPageSlices(
          { left: scanLeft, top: scanTop, width: scanWidth, height: boundedTotalHeight },
          boundedTotalHeight,
          targetPageH
        );

        currentStep = 'Bước 4: Chia trang & render Canvas từng trang';
        this.updateProgress(85, '📑 Bước 4: Đóng gói PDF', `Đang tạo ${slices.length} trang PDF chuẩn A4...`);

        const pdfPages = [];

        for (let i = 0; i < slices.length; i++) {
          const sl = slices[i];
          const sliceHeight = sl.bottom - sl.top;

          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = Math.round(scanWidth * effectiveDpr);
          pageCanvas.height = Math.round(targetPageH * effectiveDpr);
          const pCtx = pageCanvas.getContext('2d');
          if (!pCtx) {
            throw new Error(`Không thể tạo ngữ cảnh vẽ cho trang ${i + 1}`);
          }

          pCtx.fillStyle = pageBgColor;
          pCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

          pCtx.drawImage(
            masterCanvas,
            0, Math.round(sl.top * effectiveDpr), Math.round(scanWidth * effectiveDpr), Math.round(sliceHeight * effectiveDpr),
            0, 0, Math.round(scanWidth * effectiveDpr), Math.round(sliceHeight * effectiveDpr)
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

        currentStep = 'Bước 5: Xuất cấu trúc PDF nhị phân';
        this.updateProgress(92, '⏳ Bước 5: Tạo file tải về', 'Đang nén dữ liệu & xuất file PDF...');

        const pdfBlob = createPdfFromImages(pdfPages);
        if (!pdfBlob) throw new Error('Không tạo được file PDF từ các trang.');

        const pageTitle = sanitizeFilename(document.title || 'Tai_Lieu_Web');
        const cleanName = `${pageTitle}_QuetVung_${Date.now()}.pdf`;

        currentStep = 'Bước 6: Kích hoạt tải file xuống máy';
        this.updateProgress(96, '⏳ Bước 6: Lưu file', 'Đang lưu file PDF về máy tính...');

        // 1. Chuyển Blob sang Data URL để gửi cho background downloader
        const pdfDataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Lỗi chuyển đổi dữ liệu PDF sang dạng tải về'));
          reader.readAsDataURL(pdfBlob);
        });

        // 2. Tải qua Chrome Downloads API chính thức từ background
        let downloadSuccess = false;
        try {
          const dlResult = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              action: 'DOWNLOAD_DIRECT',
              url: pdfDataUrl,
              filename: cleanName
            }, (resp) => {
              if (chrome.runtime.lastError) {
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(resp || { success: false });
              }
            });
          });
          if (dlResult && dlResult.success) {
            downloadSuccess = true;
          }
        } catch (e) {
          console.warn('[OmniLoader] Background download failed, using fallback:', e);
        }

        // 3. Dự phòng bằng thẻ <a> download qua Blob URL
        if (!downloadSuccess) {
          try {
            const blobUrl = URL.createObjectURL(pdfBlob);
            const downloadLink = document.createElement('a');
            downloadLink.href = blobUrl;
            downloadLink.download = cleanName;
            downloadLink.style.display = 'none';
            (document.body || document.documentElement).appendChild(downloadLink);
            downloadLink.click();
            setTimeout(() => {
              downloadLink.remove();
              URL.revokeObjectURL(blobUrl);
            }, 20000);
            downloadSuccess = true;
          } catch (e) {
            throw new Error('Không thể kích hoạt tải file PDF về máy: ' + (e.message || e));
          }
        }

        const spinner = this.statusPanel.querySelector('#omni-status-spinner');
        if (spinner) spinner.style.display = 'none';
        this.updateProgress(100, '✓ Đã xuất PDF thành công!', `Đã tải về máy: ${cleanName} (${pdfPages.length} trang chuẩn A4)`);

        setTimeout(() => {
          this.destroy();
        }, 4000);

      } catch (err) {
        console.error('OmniLoader Region Scan Error at:', currentStep, err);
        // Hiển thị hộp chẩn đoán lỗi chi tiết và KHÔNG tự đóng để người dùng sao chép
        this.showDiagnosticError(currentStep, err, {
          scanWidth,
          scanHeight: scanTotalHeight,
          mode: this.mode
        });
      } finally {
        if (this.overlay) {
          this.overlay.style.visibility = 'visible';
        }
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

  // Chỉ khởi động khi được yêu cầu qua window.__omniStartRegionCapture hoặc START_REGION_CAPTURE

})();
