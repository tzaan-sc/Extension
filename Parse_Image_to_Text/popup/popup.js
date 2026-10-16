// Popup Controller
document.addEventListener('DOMContentLoaded', () => {
  const btnSnip = document.getElementById('btn-snip-capture');
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  const btnToggleSettings = document.getElementById('btn-toggle-settings');
  const settingsPanel = document.getElementById('settings-panel');
  const selectEngine = document.getElementById('select-engine');
  const selectLang = document.getElementById('select-lang');
  const groupTesseractLang = document.getElementById('group-tesseract-lang');
  const groupGoogleKey = document.getElementById('group-google-key');
  const groupGeminiKey = document.getElementById('group-gemini-key');
  const groupOcrSpaceKey = document.getElementById('group-ocrspace-key');
  const inputGoogleKey = document.getElementById('input-google-key');
  const inputGeminiKey = document.getElementById('input-gemini-key');
  const inputOcrspaceKey = document.getElementById('input-ocrspace-key');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const saveStatus = document.getElementById('save-status');

  // Load cài đặt hiện tại
  chrome.storage.sync.get({
    ocrEngine: 'tesseract',
    tesseractLang: 'vie+eng',
    googleApiKey: '',
    geminiApiKey: '',
    ocrSpaceApiKey: ''
  }, (items) => {
    selectEngine.value = items.ocrEngine;
    selectLang.value = items.tesseractLang;
    inputGoogleKey.value = items.googleApiKey;
    inputGeminiKey.value = items.geminiApiKey;
    inputOcrspaceKey.value = items.ocrSpaceApiKey;
    updateEngineFieldsVisibility(items.ocrEngine);
  });

  // Chuyển đổi hiển thị form cài đặt
  btnToggleSettings.addEventListener('click', () => {
    const isHidden = settingsPanel.style.display === 'none';
    settingsPanel.style.display = isHidden ? 'flex' : 'none';
  });

  selectEngine.addEventListener('change', () => {
    updateEngineFieldsVisibility(selectEngine.value);
  });

  function updateEngineFieldsVisibility(engine) {
    groupTesseractLang.style.display = engine === 'tesseract' ? 'flex' : 'none';
    groupGoogleKey.style.display = engine === 'google_vision' ? 'flex' : 'none';
    groupGeminiKey.style.display = engine === 'gemini' ? 'flex' : 'none';
    groupOcrSpaceKey.style.display = engine === 'ocr_space' ? 'flex' : 'none';
  }

  // Lưu cấu hình
  btnSaveSettings.addEventListener('click', () => {
    chrome.storage.sync.set({
      ocrEngine: selectEngine.value,
      tesseractLang: selectLang.value,
      googleApiKey: inputGoogleKey.value.trim(),
      geminiApiKey: inputGeminiKey.value.trim(),
      ocrSpaceApiKey: inputOcrspaceKey.value.trim()
    }, () => {
      saveStatus.textContent = '✓ Đã lưu cài đặt!';
      setTimeout(() => {
        saveStatus.textContent = '';
      }, 2500);
    });
  });

  // 1. Khoanh vùng quét chữ trên trang web hiện tại
  btnSnip.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: "START_SNIPPING_FROM_POPUP" }, (response) => {
      window.close(); // Đóng popup để người dùng tương tác với màn hình
    });
  });

  // 2. Kéo thả hoặc chọn file ảnh
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageFile(file);
    }
  });

  // Hỗ trợ Paste trực tiếp ảnh từ Clipboard (Ctrl + V)
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || window.clipboardData).items;
    for (let index in items) {
      const item = items[index];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        handleImageFile(blob);
        break;
      }
    }
  });

  function handleImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0] && tabs[0].id) {
          // Bơm content scripts vào tab đang mở và hiển thị Studio
          await chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: [
              "libs/tesseract.min.js",
              "content/ocr_engine.js",
              "content/lens_overlay.js"
            ]
          });
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "SCAN_DIRECT_IMAGE_URL",
            imageUrl: dataUrl
          });
          window.close();
        }
      });
    };
    reader.readAsDataURL(file);
  }
});
