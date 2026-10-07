/**
 * content/scraper.js - Content Script chạy trên trang Facebook để trích xuất token & hỗ trợ bóc tách
 */

console.log('[FB Activity Scanner] Content Script đã kích hoạt trên Facebook.');

// Lắng nghe các yêu cầu từ Side Panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'EXTRACT_CURRENT_TAB_PROFILE') {
    try {
      const url = window.location.href;
      // Trích xuất dtsg token nếu có trong trang
      const dtsgMatch = document.documentElement.innerHTML.match(/\["DTSGInitialData",\[\],{"token":"([^"]+)"}/);
      const dtsgToken = dtsgMatch ? dtsgMatch[1] : null;

      // Trích xuất current logged in user ID
      const userMatch = document.cookie.match(/c_user=(\d+)/);
      const loggedInUid = userMatch ? userMatch[1] : null;

      sendResponse({
        success: true,
        currentUrl: url,
        dtsgToken,
        loggedInUid
      });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }

  if (request.action === 'EXTRACT_DOM_POSTS') {
    try {
      const links = new Set();
      // Quét tất cả thẻ a trong DOM
      const anchors = document.querySelectorAll('a[href*="/posts/"], a[href*="/share/p/"], a[href*="permalink.php"], a[href*="/photos/"], a[href*="/photo.php"]');
      anchors.forEach(a => {
        const href = a.href;
        if (href && (href.includes('pfbid0') || href.includes('/share/p/') || href.includes('/posts/'))) {
          // Lọc bỏ query tracking fbclid
          const cleanUrl = href.split('?')[0].split('&')[0];
          links.add(cleanUrl);
        }
      });

      sendResponse({
        success: true,
        links: Array.from(links)
      });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }
});
