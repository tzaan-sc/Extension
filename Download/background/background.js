import { MediaSniffer } from './sniffer.js';

// Cập nhật Badge trên Extension Icon
async function updateBadge(tabId) {
  if (!tabId || tabId < 0) return;
  const items = await MediaSniffer.getMedia(tabId);
  const count = items.length;
  
  if (count > 0) {
    chrome.action.setBadgeText({ tabId, text: count > 99 ? '99+' : count.toString() });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#3B82F6' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}

// 1. Lắng nghe HTTP Web Requests để bắt link ngầm (Audio / Video / PDF)
chrome.webRequest.onHeadersReceived.addListener(
  async (details) => {
    if (!details.url || details.url.startsWith('chrome-extension://') || details.tabId < 0) {
      return;
    }

    let mimeType = '';
    let contentLength = 0;

    if (details.responseHeaders) {
      for (const header of details.responseHeaders) {
        const name = header.name.toLowerCase();
        if (name === 'content-type') {
          mimeType = header.value || '';
        } else if (name === 'content-length') {
          contentLength = parseInt(header.value, 10) || 0;
        }
      }
    }

    const typeInfo = MediaSniffer.detectType(details.url, mimeType, details.responseHeaders);
    if (!typeInfo) return;

    const filename = MediaSniffer.extractFilename(details.url, details.responseHeaders, typeInfo.ext);

    const mediaItem = {
      id: `${details.tabId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      url: details.url,
      tabId: details.tabId,
      filename: filename,
      type: typeInfo.type,
      category: typeInfo.category,
      ext: typeInfo.ext,
      format: typeInfo.format,
      mimeType: mimeType,
      size: contentLength,
      sizeFormatted: MediaSniffer.formatSize(contentLength),
      source: 'network',
      timestamp: Date.now()
    };

    await MediaSniffer.addMedia(details.tabId, mediaItem);
    await updateBadge(details.tabId);
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// 2. Dọn dẹp dữ liệu khi đóng tab hoặc tải lại tab
chrome.tabs.onRemoved.addListener((tabId) => {
  MediaSniffer.clearTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    MediaSniffer.clearTab(tabId);
    updateBadge(tabId);
  }
});

// 3. Xử lý tin nhắn
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : message.tabId;

  if (message.action === 'GET_MEDIA') {
    (async () => {
      const mediaList = await MediaSniffer.getMedia(message.tabId);
      sendResponse({ success: true, data: mediaList });
    })();
    return true;
  }

  if (message.action === 'ADD_CUSTOM_MEDIA') {
    (async () => {
      if (tabId && message.item) {
        const item = {
          ...message.item,
          id: message.item.id || `${tabId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          tabId: tabId,
          sizeFormatted: message.item.sizeFormatted || MediaSniffer.formatSize(message.item.size || 0),
          timestamp: Date.now()
        };
        await MediaSniffer.addMedia(tabId, item);
        await updateBadge(tabId);
        sendResponse({ success: true, item });
      }
    })();
    return true;
  }

  if (message.action === 'DOWNLOAD_DIRECT') {
    const { url, filename } = message;
    const safeFilename = (filename || 'download_file')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim();

    chrome.downloads.download(
      {
        url: url,
        filename: safeFilename,
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, downloadId });
        }
      }
    );
    return true;
  }

  return false;
});
