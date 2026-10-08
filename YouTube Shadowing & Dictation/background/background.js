// Open side panel on action click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Error setting side panel behavior:", error));

// Optional: Listen for tab update to notify side panel of video changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
    chrome.runtime.sendMessage({
      type: 'YOUTUBE_NAVIGATION',
      tabId: tabId,
      url: tab.url
    }).catch(() => {});
  }
});

// Powerful background proxy to fetch subtitles bypassing CORS & redirect issues
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_URL_BACKGROUND') {
    const urls = message.urls || (message.url ? [message.url] : []);
    
    (async () => {
      for (const u of urls) {
        try {
          const res = await fetch(u);
          if (res.ok) {
            const text = await res.text();
            if (text && text.trim().length > 0) {
              sendResponse({ success: true, text: text, url: u });
              return;
            }
          }
        } catch (e) {
          console.warn('[YT-Dictation BG] Fetch failed for:', u, e);
        }
      }
      sendResponse({ success: false, error: 'All background fetch attempts failed' });
    })();

    return true; // Async
  }
});
