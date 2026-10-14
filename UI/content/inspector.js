// OmniUI - Visual Inspector & Floating Code/Figma Studio

(function () {
  'use strict';

  let isInspectMode = false;
  let hoveredElement = null;
  let currentTargetElement = null;
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
      border: 2px solid #38bdf8;
      background: rgba(56, 189, 248, 0.18);
      border-radius: 4px;
      transition: all 0.05s ease-out;
      display: none;
      box-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
    `;

    badgeLabel = document.createElement('div');
    badgeLabel.id = 'omniui-badge-label';
    badgeLabel.style.cssText = `
      position: absolute;
      top: -26px;
      left: 0;
      background: #0f172a;
      color: #38bdf8;
      font-size: 11px;
      font-family: monospace;
      font-weight: bold;
      padding: 3px 8px;
      border-radius: 4px;
      border: 1px solid #38bdf8;
      white-space: nowrap;
      pointer-events: none;
      box-shadow: 0 4px 10px rgba(0,0,0,0.5);
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
      top: 14px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(12px);
      color: #f8fafc;
      border: 1px solid #38bdf8;
      border-radius: 40px;
      padding: 8px 20px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      display: flex;
      align-items: center;
      gap: 14px;
      cursor: default;
      user-select: none;
    `;

    inspectorHUD.innerHTML = `
      <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#10b981;box-shadow:0 0 10px #10b981;"></span>
      <span>🎯 <b>OmniUI Inspector:</b> Click vào bất kỳ phần tử nào để lấy <b>Figma & Code</b></span>
      <span style="color:#94a3b8;font-size:11px;">[Phím tắt: ESC để thoát]</span>
      <button id="omniui-close-btn" style="background:#334155;border:none;color:#e2e8f0;cursor:pointer;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600;">✕ Đóng</button>
    `;

    inspectorHUD.querySelector('#omniui-close-btn').addEventListener('click', stopInspector);
    document.documentElement.appendChild(inspectorHUD);
  }

  // Cập nhật vị trí Highlight Overlay
  function updateHighlight(target) {
    if (!target || !overlayBox) return;
    const rect = target.getBoundingClientRect();
    overlayBox.style.display = 'block';
    overlayBox.style.top = `${rect.top}px`;
    overlayBox.style.left = `${rect.left}px`;
    overlayBox.style.width = `${rect.width}px`;
    overlayBox.style.height = `${rect.height}px`;

    const className = target.className && typeof target.className === 'string' ? '.' + target.className.split(' ')[0] : '';
    badgeLabel.textContent = `<${target.tagName.toLowerCase()}${target.id ? '#' + target.id : className}>  ${Math.round(rect.width)} × ${Math.round(rect.height)}px`;
  }

  // Rê chuột
  function handleMouseMove(e) {
    if (!isInspectMode) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target === overlayBox || target === badgeLabel || target === inspectorHUD || target.closest('#omniui-hud') || target.closest('#omniui-drawer')) {
      return;
    }

    hoveredElement = target;
    updateHighlight(target);
  }

  // Click chọn phần tử
  function handleClick(e) {
    if (!isInspectMode) return;
    e.preventDefault();
    e.stopPropagation();

    if (!hoveredElement) return;
    inspectTarget(hoveredElement);
  }

  // Phân tích và hiển thị code phần tử
  function inspectTarget(element) {
    currentTargetElement = element;
    stopInspector();

    const figmaNode = window.domToFigmaNode ? window.domToFigmaNode(element) : {};
    const svgCode = window.domToSvg ? window.domToSvg(element) : '';
    const figmaScript = window.generateFigmaConsoleScript ? window.generateFigmaConsoleScript(figmaNode) : '';
    const tailwindHtml = window.domToTailwindTree ? window.domToTailwindTree(element) : '';
    const reactJsx = window.domToReactJsx ? window.domToReactJsx(element) : '';
    const vueSfc = window.domToVue ? window.domToVue(element) : '';
    const scoped = window.domToScopedHtmlCss ? window.domToScopedHtmlCss(element) : { html: '', css: '', fullCode: '' };

    // Tạo Breadcrumb từ thẻ gốc
    const breadcrumb = [];
    let curr = element;
    while (curr && curr !== document.documentElement && breadcrumb.length < 5) {
      const tag = curr.tagName.toLowerCase();
      const cls = curr.className && typeof curr.className === 'string' ? '.' + curr.className.split(' ')[0] : '';
      breadcrumb.unshift({ el: curr, name: `${tag}${cls}` });
      curr = curr.parentElement;
    }

    const elementData = {
      tagName: element.tagName.toLowerCase(),
      breadcrumb,
      figmaNode,
      svgCode,
      figmaScript,
      tailwindHtml,
      reactJsx,
      vueSfc,
      scopedCssHtml: scoped.fullCode,
      rawHtml: element.outerHTML
    };

    chrome.storage.local.set({ omniui_last_inspected: elementData }, () => {
      showFloatingDrawer(elementData);
    });
  }

  // Hiển thị Floating Drawer chuyên nghiệp
  function showFloatingDrawer(data) {
    if (drawerElement) drawerElement.remove();

    drawerElement = document.createElement('div');
    drawerElement.id = 'omniui-drawer';
    drawerElement.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 540px;
      max-height: 620px;
      background: #0b0f19;
      color: #f8fafc;
      border: 1px solid #1e293b;
      border-radius: 16px;
      box-shadow: 0 16px 50px rgba(0,0,0,0.7);
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      overflow: hidden;
      animation: omniSlideUp 0.25s ease-out;
    `;

    // Render Breadcrumb HTML
    let breadcrumbHtml = '';
    data.breadcrumb.forEach((b, index) => {
      const isCurrent = index === data.breadcrumb.length - 1;
      breadcrumbHtml += `
        <span class="omni-crumb ${isCurrent ? 'active' : ''}" data-index="${index}" style="cursor:pointer;padding:2px 6px;border-radius:4px;font-size:11px;font-family:monospace;${isCurrent ? 'background:#3b82f6;color:#fff;font-weight:700;' : 'color:#94a3b8;background:rgba(255,255,255,0.05);'}">
          ${b.name}
        </span>
        ${index < data.breadcrumb.length - 1 ? '<span style="color:#64748b;font-size:10px;">›</span>' : ''}
      `;
    });

    drawerElement.innerHTML = `
      <!-- Header (Draggable) -->
      <div id="omni-drawer-header" style="display:flex;justify-content:space-between;align-items:center;padding:12px 18px;background:#131b2e;border-bottom:1px solid #1e293b;cursor:move;user-select:none;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:18px;">✨</span>
          <b style="font-size:14px;color:#38bdf8;">OmniUI Code & Figma Studio</b>
          <span style="background:rgba(56, 189, 248, 0.15);color:#38bdf8;border:1px solid #38bdf8;font-size:10px;padding:2px 8px;border-radius:6px;font-weight:700;">
            ${data.tagName.toUpperCase()}
          </span>
        </div>
        <button id="omni-drawer-close" style="background:transparent;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:2px 6px;">✕</button>
      </div>

      <!-- Breadcrumbs Bar (Cho phép click chọn thẻ cha/con) -->
      <div style="display:flex;align-items:center;gap:6px;padding:8px 16px;background:#0d1322;border-bottom:1px solid #1e293b;overflow-x:auto;">
        <span style="color:#64748b;font-size:11px;font-weight:600;">Chọn lớp:</span>
        ${breadcrumbHtml}
      </div>

      <!-- Navigation Tabs -->
      <div style="display:flex;background:#131b2e;padding:6px 12px;gap:6px;border-bottom:1px solid #1e293b;overflow-x:auto;">
        <button class="omni-tab active" data-tab="figma" style="background:#3b82f6;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">🎨 Figma</button>
        <button class="omni-tab" data-tab="tailwind" style="background:transparent;color:#94a3b8;border:none;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">🌊 Tailwind HTML</button>
        <button class="omni-tab" data-tab="react" style="background:transparent;color:#94a3b8;border:none;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">⚛️ React JSX</button>
        <button class="omni-tab" data-tab="vue" style="background:transparent;color:#94a3b8;border:none;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">💚 Vue 3</button>
        <button class="omni-tab" data-tab="scoped" style="background:transparent;color:#94a3b8;border:none;padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">💻 HTML + CSS</button>
      </div>

      <!-- Sub Actions for Figma -->
      <div id="omni-figma-actions" style="display:flex;gap:8px;padding:8px 16px;background:#0f172a;border-bottom:1px solid #1e293b;">
        <button id="omni-copy-figma-svg" style="flex:1;background:linear-gradient(135deg, #06b6d4, #3b82f6);color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">
          ⚡ Copy SVG (Dán vào Figma Ctrl+V)
        </button>
        <button id="omni-copy-figma-script" style="background:#1e293b;color:#cbd5e1;border:1px solid #334155;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">
          💻 Figma Script
        </button>
        <button id="omni-download-figma-json" style="background:#1e293b;color:#cbd5e1;border:1px solid #334155;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">
          💾 Tải .json
        </button>
      </div>

      <!-- Code Area -->
      <div style="padding:12px 16px;flex:1;overflow-y:auto;max-height:360px;">
        <textarea id="omni-code-content" readonly style="width:100%;height:330px;background:#060911;color:#38bdf8;border:1px solid #1e293b;border-radius:8px;padding:12px;font-family:Consolas, Monaco, monospace;font-size:12px;line-height:1.55;resize:none;outline:none;box-sizing:border-box;"></textarea>
      </div>

      <!-- Footer Buttons -->
      <div style="padding:12px 18px;background:#131b2e;border-top:1px solid #1e293b;display:flex;gap:10px;align-items:center;">
        <button id="omni-main-copy-btn" style="flex:1;background:linear-gradient(135deg, #10b981, #059669);color:#fff;border:none;padding:10px 14px;border-radius:8px;font-weight:700;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">
          <span>📋</span> <span id="omni-copy-label">Sao Chép Mã Nguồn</span>
        </button>
        <button id="omni-reinspect-btn" style="background:#1e293b;color:#cbd5e1;border:1px solid #334155;padding:10px 14px;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;">
          🎯 Soi Thẻ Khác
        </button>
      </div>
    `;

    const codeArea = drawerElement.querySelector('#omni-code-content');
    const tabs = drawerElement.querySelectorAll('.omni-tab');
    const figmaActionsBar = drawerElement.querySelector('#omni-figma-actions');
    const copyLabel = drawerElement.querySelector('#omni-copy-label');
    let currentTab = 'figma';

    function updateCodeView() {
      if (currentTab === 'figma') {
        figmaActionsBar.style.display = 'flex';
        codeArea.value = JSON.stringify(data.figmaNode, null, 2);
        copyLabel.textContent = 'Sao Chép Figma JSON';
      } else {
        figmaActionsBar.style.display = 'none';
        if (currentTab === 'tailwind') {
          codeArea.value = data.tailwindHtml;
          copyLabel.textContent = 'Sao Chép Tailwind HTML';
        } else if (currentTab === 'react') {
          codeArea.value = data.reactJsx;
          copyLabel.textContent = 'Sao Chép React JSX';
        } else if (currentTab === 'vue') {
          codeArea.value = data.vueSfc;
          copyLabel.textContent = 'Sao Chép Vue Component';
        } else if (currentTab === 'scoped') {
          codeArea.value = data.scopedCssHtml;
          copyLabel.textContent = 'Sao Chép HTML & CSS';
        }
      }
    }
    updateCodeView();

    // Tab Switching
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

    // Breadcrumb clicks
    drawerElement.querySelectorAll('.omni-crumb').forEach(crumb => {
      crumb.addEventListener('click', () => {
        const idx = parseInt(crumb.dataset.index, 10);
        const target = data.breadcrumb[idx]?.el;
        if (target) {
          inspectTarget(target);
        }
      });
    });

    // Copy SVG trực tiếp cho Figma (Ctrl+V)
    drawerElement.querySelector('#omni-copy-figma-svg').addEventListener('click', (e) => {
      navigator.clipboard.writeText(data.svgCode);
      const oldText = e.target.textContent;
      e.target.textContent = '✓ Đã copy SVG! Vào Figma bấm Ctrl+V';
      setTimeout(() => { e.target.textContent = oldText; }, 2000);
    });

    // Copy Figma Script runner
    drawerElement.querySelector('#omni-copy-figma-script').addEventListener('click', (e) => {
      navigator.clipboard.writeText(data.figmaScript);
      const oldText = e.target.textContent;
      e.target.textContent = '✓ Đã copy Script Console!';
      setTimeout(() => { e.target.textContent = oldText; }, 1800);
    });

    // Tải JSON Figma
    drawerElement.querySelector('#omni-download-figma-json').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(data.figmaNode, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${data.tagName}_figma.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Nút Copy Code chính
    drawerElement.querySelector('#omni-main-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(codeArea.value);
      const original = copyLabel.textContent;
      copyLabel.textContent = '✓ Đã sao chép vào bộ nhớ!';
      setTimeout(() => { copyLabel.textContent = original; }, 1500);
    });

    // Nút đóng
    drawerElement.querySelector('#omni-drawer-close').addEventListener('click', () => {
      drawerElement.remove();
    });

    // Nút Soi thẻ khác
    drawerElement.querySelector('#omni-reinspect-btn').addEventListener('click', () => {
      drawerElement.remove();
      startInspector();
    });

    // Kéo thả Header của Drawer
    makeDraggable(drawerElement, drawerElement.querySelector('#omni-drawer-header'));

    document.documentElement.appendChild(drawerElement);
  }

  // Kéo thả Drawer tự do trên màn hình
  function makeDraggable(element, handle) {
    let posX = 0, posY = 0, mouseX = 0, mouseY = 0;
    handle.onmousedown = function (e) {
      if (e.target.tagName.toLowerCase() === 'button') return;
      e.preventDefault();
      mouseX = e.clientX;
      mouseY = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
    };

    function elementDrag(e) {
      e.preventDefault();
      posX = mouseX - e.clientX;
      posY = mouseY - e.clientY;
      mouseX = e.clientX;
      mouseY = e.clientY;
      element.style.top = `${element.offsetTop - posY}px`;
      element.style.left = `${element.offsetLeft - posX}px`;
      element.style.bottom = 'auto';
      element.style.right = 'auto';
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
    }
  }

  // Khởi động chế độ Inspector
  function startInspector() {
    if (isInspectMode) return;
    isInspectMode = true;
    createOverlay();
    createHUD();

    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
  }

  // Dừng Inspector
  function stopInspector() {
    isInspectMode = false;
    if (overlayBox) overlayBox.style.display = 'none';
    if (inspectorHUD) inspectorHUD.remove();
    inspectorHUD = null;

    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
  }

  // Phím tắt bàn phím
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      stopInspector();
    } else if (isInspectMode && hoveredElement) {
      // Phím Mũi tên lên: chọn thẻ cha
      if (e.key === 'ArrowUp' && hoveredElement.parentElement && hoveredElement.parentElement !== document.documentElement) {
        e.preventDefault();
        hoveredElement = hoveredElement.parentElement;
        updateHighlight(hoveredElement);
      }
      // Phím Mũi tên xuống: chọn thẻ con đầu tiên
      else if (e.key === 'ArrowDown' && hoveredElement.firstElementChild) {
        e.preventDefault();
        hoveredElement = hoveredElement.firstElementChild;
        updateHighlight(hoveredElement);
      }
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
