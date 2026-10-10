// OmniUI - Popup Controller

document.addEventListener('DOMContentLoaded', async () => {
  let currentTab = null;
  let currentElementData = null;
  let activeCodeType = 'figma';

  const tabButtons = document.querySelectorAll('.filter-tabs .tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const btnStartInspect = document.getElementById('btnStartInspect');
  const codeTabs = document.querySelectorAll('.code-tab');
  const codeArea = document.getElementById('popupCodeArea');
  const btnCopyCode = document.getElementById('btnCopyCode');
  const btnDownloadCode = document.getElementById('btnDownloadCode');
  const colorGrid = document.getElementById('colorGrid');
  const fontList = document.getElementById('fontList');
  const btnExportFigma = document.getElementById('btnExportFigma');
  const btnExportHtml = document.getElementById('btnExportHtml');

  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs.length > 0) {
      currentTab = tabs[0];
      await ensureContentScript(currentTab.id);
    }
  } catch (e) {}

  async function ensureContentScript(tabId) {
    if (!currentTab || currentTab.url?.startsWith('chrome://') || currentTab.url?.startsWith('edge://')) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/figma_parser.js', 'content/inspector.js']
      }).catch(() => {});
    } catch (e) {}
  }

  // 1. Chuyển Tab chính
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetTab = btn.dataset.tab;
      document.getElementById(`tab${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`).classList.add('active');

      if (targetTab === 'theme') {
        loadPageTheme();
      }
    });
  });

  // 2. Bắt đầu chế độ Soi phần tử
  btnStartInspect.addEventListener('click', async () => {
    if (!currentTab) return;
    chrome.tabs.sendMessage(currentTab.id, { action: 'START_INSPECTOR' }, () => {
      window.close(); // Đóng popup để người dùng tương tác trực tiếp trên trang web
    });
  });

  // 3. Đọc dữ liệu phần tử vừa soi gần nhất
  chrome.storage.local.get(['omniui_last_inspected'], (res) => {
    if (res && res.omniui_last_inspected) {
      currentElementData = res.omniui_last_inspected;
      renderCode();
    }
  });

  // 4. Chuyển đổi định dạng Code (Figma, CSS, HTML, React)
  codeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      codeTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeCodeType = tab.dataset.type;
      renderCode();
    });
  });

  function renderCode() {
    if (!currentElementData) return;

    if (activeCodeType === 'figma') {
      codeArea.value = JSON.stringify(currentElementData.figmaJson, null, 2);
    } else if (activeCodeType === 'css') {
      codeArea.value = currentElementData.css || '';
    } else if (activeCodeType === 'html') {
      codeArea.value = currentElementData.cleanHtml || currentElementData.html || '';
    } else if (activeCodeType === 'react') {
      codeArea.value = currentElementData.reactJsx || '';
    }
  }

  // 5. Nút Copy Code
  btnCopyCode.addEventListener('click', () => {
    if (!codeArea.value) return;
    navigator.clipboard.writeText(codeArea.value);
    const oldText = btnCopyCode.innerHTML;
    btnCopyCode.innerHTML = '<span>✓ Đã sao chép!</span>';
    setTimeout(() => { btnCopyCode.innerHTML = oldText; }, 1500);
  });

  // 6. Nút Tải file code
  btnDownloadCode.addEventListener('click', () => {
    if (!codeArea.value) return;
    const exts = { figma: 'json', css: 'css', html: 'html', react: 'jsx' };
    const ext = exts[activeCodeType] || 'txt';
    const blob = new Blob([codeArea.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `component_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 7. Quét Bảng màu & Typography toàn trang (Tab 2)
  function loadPageTheme() {
    if (!currentTab) return;
    chrome.tabs.sendMessage(currentTab.id, { action: 'GET_PAGE_THEME' }, (res) => {
      if (res && res.success && res.theme) {
        // Render Colors
        colorGrid.innerHTML = '';
        if (res.theme.colors.length === 0) {
          colorGrid.innerHTML = '<span class="muted-text">Không tìm thấy màu sắc</span>';
        } else {
          res.theme.colors.forEach(col => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = col;
            swatch.title = `Click để copy: ${col}`;
            swatch.textContent = col.startsWith('#') ? col : 'COLOR';
            swatch.addEventListener('click', () => {
              navigator.clipboard.writeText(col);
              swatch.textContent = 'COPIED!';
              setTimeout(() => { swatch.textContent = col.startsWith('#') ? col : 'COLOR'; }, 1000);
            });
            colorGrid.appendChild(swatch);
          });
        }

        // Render Fonts
        fontList.innerHTML = '';
        if (res.theme.fonts.length === 0) {
          fontList.innerHTML = '<span class="muted-text">Không tìm thấy font chữ</span>';
        } else {
          res.theme.fonts.forEach(font => {
            const item = document.createElement('div');
            item.className = 'font-item';
            item.style.fontFamily = font;
            item.textContent = `Aa — ${font}`;
            fontList.appendChild(item);
          });
        }
      }
    });
  }

  // 8. Xuất Toàn Bộ Trang Sang Figma JSON (Tab 3)
  btnExportFigma.addEventListener('click', () => {
    if (!currentTab) return;
    const oldText = btnExportFigma.innerHTML;
    btnExportFigma.innerHTML = '<span>⏳ Đang phân tích DOM...</span>';

    chrome.tabs.sendMessage(currentTab.id, { action: 'GET_PAGE_FIGMA' }, (res) => {
      if (res && res.success && res.figma) {
        const jsonStr = JSON.stringify(res.figma, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const cleanTitle = (res.title || 'webpage').replace(/[\\/:*?"<>|]/g, '_');
        a.download = `${cleanTitle}_figma.json`;
        a.click();
        URL.revokeObjectURL(url);

        btnExportFigma.innerHTML = '<span>✓ Đã tải file Figma JSON!</span>';
        setTimeout(() => { btnExportFigma.innerHTML = oldText; }, 2000);
      } else {
        btnExportFigma.innerHTML = '<span>Lỗi xuất Figma</span>';
        setTimeout(() => { btnExportFigma.innerHTML = oldText; }, 2000);
      }
    });
  });

  // 9. Tải trọn bộ HTML của trang (Tab 3)
  btnExportHtml.addEventListener('click', async () => {
    if (!currentTab) return;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => document.documentElement.outerHTML
      });

      if (results && results[0] && results[0].result) {
        const htmlStr = results[0].result;
        const blob = new Blob([htmlStr], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(currentTab.title || 'page').replace(/[\\/:*?"<>|]/g, '_')}.html`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {}
  });
});
