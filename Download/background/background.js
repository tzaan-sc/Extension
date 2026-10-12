import { MediaSniffer } from './sniffer.js';
import { DocResolverService } from './doc_resolver_service.js';

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

// Cài đặt Context Menu cho phép chuột phải để quét vùng
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'omni_region_scan',
      title: '🎯 Quét vùng xuất PDF chuẩn A4',
      contexts: ['all']
    }, () => {
      if (chrome.runtime.lastError) {}
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'omni_region_scan' && tab && tab.id) {
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('edge://')) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/region_selector.js']
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (window.__omniStartRegionCapture) {
            window.__omniStartRegionCapture();
          }
        }
      });
    } catch (e) {
      console.error('Lỗi chạy quét vùng từ context menu:', e);
    }
  }
});

// 1. Lắng nghe HTTP Web Requests để bắt link ngầm
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

// 2. Dọn dẹp dữ liệu khi đóng hoặc reload tab
chrome.tabs.onRemoved.addListener((tabId) => {
  MediaSniffer.clearTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    MediaSniffer.clearTab(tabId);
    updateBadge(tabId);
  }
});

// 3. Quản lý Offscreen Document
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['BLOBS', 'DOM_PARSER', 'AUDIO_PLAYBACK'],
    justification: 'Xử lý ghép luồng video m3u8 và tách âm thanh MP3 từ video'
  });
}

// 4. Xử lý tin nhắn (Message Passing)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : message.tabId;

  if (message.action === 'PING') {
    sendResponse({
      pong: true,
      success: true,
      time: Date.now(),
      tabId: tabId || null
    });
    return false;
  }

  if (message.action === 'CAPTURE_TAB_VIEWPORT') {
    const winId = (sender.tab && typeof sender.tab.windowId === 'number') ? sender.tab.windowId : null;
    const format = message.format || 'jpeg';
    const quality = typeof message.quality === 'number' ? message.quality : 90;
    const captureOptions = format === 'jpeg' ? { format: 'jpeg', quality } : { format: 'png' };

    let responded = false;
    const respond = (payload) => {
      if (responded) return;
      responded = true;
      try {
        sendResponse(payload);
      } catch (e) {
        console.warn('[OmniLoader] Error calling sendResponse:', e);
      }
    };

    // Tầng 1: Thử chụp với windowId của sender nếu có
    const tryCaptureWithWinId = () => {
      try {
        chrome.tabs.captureVisibleTab(winId, captureOptions, (dataUrl) => {
          const err1 = chrome.runtime.lastError;
          if (!err1 && dataUrl) {
            return respond({ success: true, dataUrl });
          }
          tryCaptureWithNullJpeg((err1 && err1.message) || 'Lỗi chụp với winId');
        });
      } catch (e1) {
        tryCaptureWithNullJpeg(e1.message || 'Exception chụp với winId');
      }
    };

    // Tầng 2: Thử chụp với null (cửa sổ hiện tại) bằng định dạng JPEG
    const tryCaptureWithNullJpeg = (prevErr) => {
      try {
        chrome.tabs.captureVisibleTab(null, captureOptions, (dataUrl) => {
          const err2 = chrome.runtime.lastError;
          if (!err2 && dataUrl) {
            return respond({ success: true, dataUrl });
          }
          tryCaptureWithNullPng(prevErr + ' | ' + ((err2 && err2.message) || 'Lỗi chụp với null JPEG'));
        });
      } catch (e2) {
        tryCaptureWithNullPng(prevErr + ' | ' + (e2.message || 'Exception chụp null JPEG'));
      }
    };

    // Tầng 3: Thử chụp với null bằng định dạng PNG (tương thích tối đa với mọi máy)
    const tryCaptureWithNullPng = (prevErr) => {
      try {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
          const err3 = chrome.runtime.lastError;
          if (!err3 && dataUrl) {
            return respond({ success: true, dataUrl });
          }
          const finalErrMsg = (err3 && err3.message) || 'Không thể chụp ảnh màn hình';
          respond({ success: false, error: `${finalErrMsg} (Chi tiết: ${prevErr})` });
        });
      } catch (e3) {
        respond({ success: false, error: `${e3.message} (Chi tiết: ${prevErr})` });
      }
    };

    tryCaptureWithWinId();
    return true; // Giữ kênh kết nối mở
  }

  if (message.action === 'GET_MEDIA') {
    (async () => {
      const mediaList = await MediaSniffer.getMedia(message.tabId);
      sendResponse({ success: true, data: mediaList });
    })();
    return true;
  }

  // Thêm nhiều media cùng 1 lúc (Tránh race condition)
  if (message.action === 'ADD_BATCH_MEDIA') {
    (async () => {
      if (tabId && message.items && message.items.length > 0) {
        await MediaSniffer.addMediaBatch(tabId, message.items);
        await updateBadge(tabId);
        sendResponse({ success: true });
      }
    })();
    return true;
  }

  if (message.action === 'ADD_CUSTOM_MEDIA') {
    (async () => {
      if (tabId && message.item) {
        await MediaSniffer.addMedia(tabId, message.item);
        await updateBadge(tabId);
        sendResponse({ success: true });
      }
    })();
    return true;
  }

  if (message.action === 'DOWNLOAD_DIRECT') {
    const { url, filename } = message;
    let safeFilename = (filename || 'download_file')
      .replace(/[\x00-\x1f\x7f-\x9f\\/:*?"<>|]/g, '_')
      .replace(/[\s.]+$/, '')
      .trim();

    if (filename && filename.toLowerCase().endsWith('.pdf') && !safeFilename.toLowerCase().endsWith('.pdf')) {
      safeFilename += '.pdf';
    }

    chrome.downloads.download(
      {
        url: url,
        filename: safeFilename,
        saveAs: false
      },
      (downloadId) => {
        if (chrome.runtime.lastError || !downloadId) {
          sendResponse({ success: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'Lỗi tải file' });
        } else {
          sendResponse({ success: true, downloadId });
        }
      }
    );
    return true;
  }

  if (message.action === 'TRIGGER_REGION_SCAN_TAB') {
    (async () => {
      const targetTabId = sender.tab ? sender.tab.id : message.tabId;
      if (targetTabId) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            files: ['content/region_selector.js']
          });
          await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            func: () => {
              if (window.__omniStartRegionCapture) {
                window.__omniStartRegionCapture();
              }
            }
          });
          sendResponse({ success: true });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
      }
    })();
    return true;
  }

  if (message.action === 'EXTRACT_AUDIO') {
    (async () => {
      try {
        await ensureOffscreenDocument();
        chrome.runtime.sendMessage({
          action: 'OFFSCREEN_EXTRACT_AUDIO',
          payload: message.payload
        });
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'START_HLS_DOWNLOAD') {
    (async () => {
      try {
        await ensureOffscreenDocument();
        chrome.runtime.sendMessage({
          action: 'OFFSCREEN_START_HLS',
          payload: message.payload
        });
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'RESOLVE_VIP_DOC') {
    (async () => {
      try {
        const result = await DocResolverService.resolveAndDownload(message.url, tabId);
        if (result.type === 'direct_download') {
          chrome.downloads.download({
            url: result.url,
            filename: result.filename,
            saveAs: false
          }, (dlId) => {
            if (chrome.runtime.lastError || !dlId) {
              sendResponse({ success: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'Lỗi bắt đầu tải file PDF' });
            } else {
              sendResponse({ success: true, downloadId: dlId, message: 'Đã bắt đầu tải file PDF gốc!' });
            }
          });
        } else {
          sendResponse({ success: true, result });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  return false;
});
