// OmniUI - Visual Inspector & Floating Code Viewer

(function () {
  'use strict';

  let isInspectMode = false;
  let hoveredElement = null;
  let overlayBox = null;
  let badgeLabel = null;
  let inspectorHUD = null;
  let drawerElement = null;

  // 1. Tạo Overlay Box làm nổi bật phần tử khi rê chuột
  function createOverlay() {
    if (overlayBox) return;

    overlayBox = document.createElement('div');
    overlayBox.id = 'omniui-overlay-box';
    overlayBox.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 2147483640;
      border: 2px solid #3b82f6;
      background: rgba(59, 130, 246, 0.15);
      border-radius: 4px;
      transition: all 0.08s ease-out;
      display: none;
    `;

    badgeLabel = document.createElement('div');
    badgeLabel.id = 'omniui-badge-label';
    badgeLabel.style.cssText = `
      position: absolute;
      top: -24px;
      left: 0;
      background: #1e293b;
      color: #38bdf8;
      font-size: 11px;
      font-family: monospace;
      font-weight: bold;
      padding: 2px 6px;
      border-radius: 3px;
      border: 1px solid #3b82f6;
      white-space: nowrap;
      pointer-events: none;
    `;
    overlayBox.appendChild(badgeLabel);
    document.documentElement.appendChild(overlayBox);
  }

  // 2. Tạo HUD Banner hướng dẫn ở đầu trang
  function createHUD() {
    if (inspectorHUD) return;

    inspectorHUD = document.createElement('div');
    inspectorHUD.id = 'omniui-hud';
    inspectorHUD.style.cssText = `
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #38bdf8;
      border-radius: 30px;
      padding: 8px 18px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: default;
      animation: omniSlideDown 0.3s ease-out;
    `;

    inspectorHUD.innerHTML = `
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;"></span>
      <span>🎯 <b>OmniUI Inspector:</b> Click vào bất kỳ phần tử nào để trích xuất Code & Figma</span>
      <button id="omniui-close-btn" style="background:#334155;border:none;color:#94a3b8;cursor:pointer;padding:3px 8px;border-radius:12px;font-size:11px;">Thoát (ESC)</button>
    `;

    inspectorHUD.querySelector('#omniui-close-btn').addEventListener('click', stopInspector);
    document.documentElement.appendChild(inspectorHUD);
  }

  // Bắt sự kiện rê chuột (Hover)
  function handleMouseMove(e) {
    if (!isInspectMode) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === overlayBox || target === badgeLabel || target === inspectorHUD || target.closest('#omniui-hud') || target.closest('#omniui-drawer')) {
      return;
    }

    hoveredElement = target;
    const rect = target.getBoundingClientRect();

    overlayBox.style.display = 'block';
    overlayBox.style.top = `${rect.top}px`;
    overlayBox.style.left = `${rect.left}px`;
    overlayBox.style.width = `${rect.width}px`;
    overlayBox.style.height = `${rect.height}px`;

    const className = target.className && typeof target.className === 'string' ? '.' + target.className.split(' ')[0] : '';
    badgeLabel.textContent = `<${target.tagName.toLowerCase()}${target.id ? '#' + target.id : className}>  ${Math.round(rect.width)} × ${Math.round(rect.height)}px`;
  }

  // Bắt sự kiện Click để trích xuất phần tử
  function handleClick(e) {
    if (!isInspectMode) return;
    e.preventDefault();
    e.stopPropagation();

    if (!hoveredElement) return;
    const selectedEl = hoveredElement;
    stopInspector();

    // Thu thập toàn bộ dữ liệu code
    const elementData = {
      tagName: selectedEl.tagName.toLowerCase(),
      html: selectedEl.outerHTML,
      cleanHtml: getCleanHtml(selectedEl),
      css: window.extractComputedCss ? window.extractComputedCss(selectedEl) : '',
      tailwind: window.domToTailwind ? window.domToTailwind(selectedEl) : '',
      reactJsx: window.domToReactJsx ? window.domToReactJsx(selectedEl) : '',
      figmaJson: window.domToFigmaNode ? window.domToFigmaNode(selectedEl) : {}
    };

    // Lưu dữ liệu vào storage để popup có thể mở xem
    chrome.storage.local.set({ omniui_last_inspected: elementData }, () => {
      showFloatingDrawer(elementData);
    });
  }

  function getCleanHtml(el) {
    const clone = el.cloneNode(true);
    // Xóa các id/class rác nếu có
    return clone.outerHTML;
  }

  // Hiển thị Floating Drawer trực tiếp trên trang web để người dùng copy ngay
  function showFloatingDrawer(data) {
    if (drawerElement) drawerElement.remove();

    drawerElement = document.createElement('div');
    drawerElement.id = 'omniui-drawer';
    drawerElement.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 480px;
      max-height: 580px;
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.6);
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      animation: omniSlideUp 0.3s ease-out;
    `;

    drawerElement.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:#1e293b;border-bottom:1px solid #334155;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:16px;">✨</span>
          <b style="font-size:14px;color:#38bdf8;">OmniUI Code Inspector</b>
          <span style="background:#3b82f6;color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;font-weight:700;">${data.tagName.toUpperCase()}</span>
        </div>
        <button id="omni-drawer-close" style="background:transparent;border:none;color:#94a3b8;font-size:18px;cursor:pointer;">✕</button>
      </div>

      <div style="display:flex;background:#1e293b;padding:4px 10px;gap:6px;border-bottom:1px solid #334155;">
        <button class="omni-tab active" data-tab="figma" style="background:#3b82f6;color:#fff;border:none;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">🎨 Figma JSON</button>
        <button class="omni-tab" data-tab="css" style="background:transparent;color:#94a3b8;border:none;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">💻 CSS</button>
        <button class="omni-tab" data-tab="html" style="background:transparent;color:#94a3b8;border:none;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">🌐 HTML</button>
        <button class="omni-tab" data-tab="react" style="background:transparent;color:#94a3b8;border:none;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">⚛️ React JSX</button>
      </div>

      <div style="padding:12px;flex:1;overflow-y:auto;max-height:360px;">
        <textarea id="omni-code-content" readonly style="width:100%;height:320px;background:#090d16;color:#38bdf8;border:1px solid #1e293b;border-radius:8px;padding:10px;font-family:monospace;font-size:12px;line-height:1.5;resize:none;outline:none;box-sizing:border-box;"></textarea>
      </div>

      <div style="padding:10px 16px;background:#1e293b;border-top:1px solid #334155;display:flex;gap:8px;">
        <button id="omni-copy-btn" style="flex:1;background:linear-gradient(135deg, #10b981, #3b82f6);color:#fff;border:none;padding:8px 12px;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;">📋 Copy Code</button>
        <button id="omni-reinspect-btn" style="background:#334155;color:#e2e8f0;border:none;padding:8px 12px;border-radius:6px;font-size:12px;cursor:pointer;">🎯 Soi tiếp</button>
      </div>
    `;

    const codeArea = drawerElement.querySelector('#omni-code-content');
    const tabs = drawerElement.querySelectorAll('.omni-tab');
    let currentTab = 'figma';

    function updateCodeView() {
      if (currentTab === 'figma') {
        codeArea.value = JSON.stringify(data.figmaJson, null, 2);
      } else if (currentTab === 'css') {
        codeArea.value = data.css;
      } else if (currentTab === 'html') {
        codeArea.value = data.html;
      } else if (currentTab === 'react') {
        codeArea.value = data.reactJsx;
      }
    }
    updateCodeView();

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => {
          t.style.background = 'transparent';
          t.style.color = '#94a3b8';
        });
        tab.style.background = '#3b82f6';
        tab.style.color = '#fff';
        currentTab = tab.dataset.tab;
        updateCodeView();
      });
    });

    drawerElement.querySelector('#omni-copy-btn').addEventListener('click', (e) => {
      navigator.clipboard.writeText(codeArea.value);
      e.target.textContent = '✓ Đã sao chép!';
      setTimeout(() => { e.target.textContent = '📋 Copy Code'; }, 1500);
    });

    drawerElement.querySelector('#omni-drawer-close').addEventListener('click', () => {
      drawerElement.remove();
    });

    drawerElement.querySelector('#omni-reinspect-btn').addEventListener('click', () => {
      drawerElement.remove();
      startInspector();
    });

    document.documentElement.appendChild(drawerElement);
  }

  // Bắt đầu chế độ Inspector
  function startInspector() {
    if (isInspectMode) return;
    isInspectMode = true;
    createOverlay();
    createHUD();

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
  }

  // Dừng chế độ Inspector
  function stopInspector() {
    isInspectMode = false;
    if (overlayBox) overlayBox.style.display = 'none';
    if (inspectorHUD) inspectorHUD.remove();
    inspectorHUD = null;

    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      stopInspector();
    }
  }

  // Lắng nghe lệnh từ Popup Extension
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_INSPECTOR') {
      startInspector();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'STOP_INSPECTOR') {
      stopInspector();
      sendResponse({ success: true });
      return true;
    }

    if (request.action === 'GET_PAGE_FIGMA') {
      const figmaRoot = window.domToFigmaNode ? window.domToFigmaNode(document.body, 7) : {};
      sendResponse({ success: true, figma: figmaRoot, title: document.title });
      return true;
    }

    if (request.action === 'GET_PAGE_THEME') {
      const theme = window.extractPageTheme ? window.extractPageTheme() : { colors: [], fonts: [] };
      sendResponse({ success: true, theme });
      return true;
    }
  });
})();
