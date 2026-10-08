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
    }).catch(() => {
      // Side panel might not be open yet, ignore error
    });
  }
});
