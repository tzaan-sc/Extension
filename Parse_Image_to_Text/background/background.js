// Lens OCR Service Worker (MV3)
chrome.runtime.onInstalled.addListener(() => {
  // Tạo menu chuột phải tiện dụng
  chrome.contextMenus.create({
    id: "lens_ocr_capture_area",
    title: "🔍 Quét chữ vùng chọn (Google Lens OCR)",
    contexts: ["all"]
  });

  chrome.contextMenus.create({
    id: "lens_ocr_image_target",
    title: "🔍 Quét chữ từ hình ảnh này",
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === "lens_ocr_capture_area") {
    triggerSnipping(tab.id);
  } else if (info.menuItemId === "lens_ocr_image_target" && info.srcUrl) {
    try {
      await injectScriptsIfNeeded(tab.id);
      
      // Nếu là data url thì gửi trực tiếp
      if (info.srcUrl.startsWith('data:')) {
        chrome.tabs.sendMessage(tab.id, {
          action: "SCAN_DIRECT_IMAGE_URL",
          imageUrl: info.srcUrl
        });
        return;
      }

      // Tải ảnh qua Service Worker (Background) để không bị chặn bởi CORS của trang web
      const res = await fetch(info.srcUrl);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        chrome.tabs.sendMessage(tab.id, {
          action: "SCAN_DIRECT_IMAGE_URL",
          imageUrl: reader.result
        });
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.warn("Không tải được ảnh trực tiếp qua background, chuyển URL cho content script:", err);
      chrome.tabs.sendMessage(tab.id, {
        action: "SCAN_DIRECT_IMAGE_URL",
        imageUrl: info.srcUrl
      });
    }
  }
});

// Lắng nghe messages từ Popup hoặc Content Script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START_SNIPPING_FROM_POPUP") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        triggerSnipping(tabs[0].id);
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, error: "No active tab" });
      }
    });
    return true;
  }

  if (request.action === "CAPTURE_VISIBLE_TAB") {
    // Chụp lại toàn bộ viewport để content script cắt vùng chọn
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ success: false, error: chrome.runtime.lastError?.message || "Capture failed" });
      } else {
        sendResponse({ success: true, dataUrl: dataUrl });
      }
    });
    return true; // async sendResponse
  }
});

async function triggerSnipping(tabId) {
  try {
    await injectScriptsIfNeeded(tabId);
    chrome.tabs.sendMessage(tabId, { action: "START_SNIPPING_CAPTURE" });
  } catch (err) {
    console.error("Failed to trigger snipping:", err);
  }
}

async function injectScriptsIfNeeded(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: [
        "libs/tesseract.min.js",
        "content/ocr_engine.js",
        "content/lens_overlay.js"
      ]
    });
  } catch (e) {
    // Script có thể đã nạp sẵn hoặc trang không cho phép inject (e.g. chrome://)
    console.warn("Script injection note:", e);
  }
}
