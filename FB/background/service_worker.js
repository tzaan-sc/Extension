// Background Service Worker for Facebook Activity Scanner

chrome.runtime.onInstalled.addListener(() => {
  console.log('[FB Scanner] Extension đã cài đặt thành công.');
  // Tự động mở Side Panel khi người dùng click vào icon extension trên toolbar
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error('[FB Scanner] Lỗi thiết lập Side Panel:', error));
  }
});

// Lắng nghe các thông điệp từ Side Panel hoặc Content Scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ status: 'PONG', timestamp: Date.now() });
    return true;
  }
  
  if (message.type === 'OPEN_SIDE_PANEL') {
    if (sender.tab && sender.tab.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => sendResponse({ success: true }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;
    }
  }
});
