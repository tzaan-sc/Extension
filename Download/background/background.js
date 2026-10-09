import { MediaSniffer } from './sniffer.js';

const sniffer = new MediaSniffer();

// Cập nhật Badge trên Extension Icon
function updateBadge(tabId) {
  if (tabId < 0) return;
  const items = sniffer.getMedia(tabId);
  const count = items.length;
  
  if (count > 0) {
    chrome.action.setBadgeText({ tabId, text: count > 99 ? '99+' : count.toString() });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#3B82F6' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
}

// 1. Lắng nghe HTTP Web Requests để bắt link ngầm
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    // Bỏ qua request từ chính extension hoặc các URL nội bộ
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

    // Bỏ qua các file ảnh/icon quá nhỏ hoặc script thường
    if (contentLength > 0 && contentLength < 10240 && !mimeType.includes('mpegurl')) {
      return;
    }

    const typeInfo = sniffer.detectType(details.url, mimeType, details.responseHeaders);
    if (!typeInfo) return;

    const filename = sniffer.extractFilename(details.url, details.responseHeaders, typeInfo.ext);

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
      sizeFormatted: sniffer.formatSize(contentLength),
      source: 'network',
      timestamp: Date.now()
    };

    sniffer.addMedia(details.tabId, mediaItem);
    updateBadge(details.tabId);
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// 2. Dọn dẹp dữ liệu khi đóng tab hoặc tải lại tab
chrome.tabs.onRemoved.addListener((tabId) => {
  sniffer.clearTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    sniffer.clearTab(tabId);
    updateBadge(tabId);
  }
});

// 3. Quản lý Offscreen Document (cho việc xử lý luồng m3u8, Canvas-to-PDF)
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['BLOBS', 'DOM_PARSER'],
    justification: 'Xử lý ghép luồng video HLS m3u8 và tạo file PDF từ tài liệu học tập'
  });
}

// 4. Xử lý tin nhắn (Message Passing) giữa UI, Content Script và Background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : message.tabId;

  switch (message.action) {
    // Lấy danh sách media của tab hiện tại
    case 'GET_MEDIA': {
      const targetTabId = message.tabId;
      const mediaList = sniffer.getMedia(targetTabId);
      sendResponse({ success: true, data: mediaList });
      return true;
    }

    // Thêm media từ Content Script (như YouTube Parser, TikTok, DOM video, Canvas)
    case 'ADD_CUSTOM_MEDIA': {
      if (tabId && message.item) {
        const item = {
          ...message.item,
          id: message.item.id || `${tabId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          tabId: tabId,
          sizeFormatted: sniffer.formatSize(message.item.size || 0),
          timestamp: Date.now()
        };
        sniffer.addMedia(tabId, item);
        updateBadge(tabId);
        sendResponse({ success: true, item });
      }
      return true;
    }

    // Tải file trực tiếp
    case 'DOWNLOAD_DIRECT': {
      const { url, filename } = message;
      chrome.downloads.download(
        {
          url: url,
          filename: filename || 'downloaded_file',
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

    // Bắt đầu tải HLS m3u8 Stream
    case 'START_HLS_DOWNLOAD': {
      (async () => {
        try {
          await ensureOffscreenDocument();
          chrome.runtime.sendMessage({
            action: 'OFFSCREEN_START_HLS',
            payload: message.payload
          });
          sendResponse({ success: true, message: 'Đã gửi tác vụ tới Offscreen Worker' });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    // Bắt đầu cào học liệu sang PDF
    case 'EXPORT_CANVAS_PDF': {
      (async () => {
        try {
          await ensureOffscreenDocument();
          chrome.runtime.sendMessage({
            action: 'OFFSCREEN_GENERATE_PDF',
            payload: message.payload
          });
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      })();
      return true;
    }

    default:
      break;
  }
});
