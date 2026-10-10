// OmniUI - Background Service Worker

chrome.runtime.onInstalled.addListener(() => {
  console.log('OmniUI - UI Inspector & Figma Exporter đã sẵn sàng!');
});

// Lắng nghe các thông điệp từ content script hoặc popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'PING') {
    sendResponse({ status: 'OK' });
  }
});
