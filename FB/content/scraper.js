/**
 * content/scraper.js - Content Script chạy trên tab Facebook để trích xuất token & dữ liệu DOM thời gian thực
 */

console.log('[Social Activity Lens] Content Script sẵn sàng trên Facebook.');

// Hàm trích xuất token fb_dtsg và jazoest từ trang Facebook
function extractFacebookTokens() {
  let fb_dtsg = null;
  let jazoest = null;
  let userId = null;

  // 1. Tìm trong DOM inputs
  const dtsgInput = document.querySelector('input[name="fb_dtsg"]');
  if (dtsgInput) fb_dtsg = dtsgInput.value;

  const jazoestInput = document.querySelector('input[name="jazoest"]');
  if (jazoestInput) jazoest = jazoestInput.value;

  // 2. Tìm trong inline scripts
  if (!fb_dtsg) {
    const dtsgMatch = document.documentElement.innerHTML.match(/\["DTSGInitialData",\[\],{"token":"([^"]+)"}/) ||
                      document.documentElement.innerHTML.match(/"DTSGInitialData":\{"token":"([^"]+)"\}/) ||
                      document.documentElement.innerHTML.match(/"token":"([a-zA-Z0-9_\-:]+)"/);
    if (dtsgMatch) fb_dtsg = dtsgMatch[1];
  }

  // 3. Lấy User ID từ cookie c_user
  const cookieMatch = document.cookie.match(/c_user=(\d+)/);
  if (cookieMatch) userId = cookieMatch[1];

  return { fb_dtsg, jazoest, userId };
}

// Lắng nghe các yêu cầu từ Side Panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_FB_TOKENS') {
    const tokens = extractFacebookTokens();
    sendResponse({ success: true, ...tokens });
    return true;
  }

  if (request.action === 'EXTRACT_DOM_POSTS') {
    try {
      const items = [];
      const seenUrls = new Set();

      // 1. Quét tất cả liên kết bài viết / ảnh / video
      const anchors = document.querySelectorAll('a[href*="/posts/"], a[href*="/share/p/"], a[href*="permalink.php"], a[href*="pfbid0"], a[href*="/photos/"], a[href*="/photo.php"]');
      
      anchors.forEach(a => {
        let href = a.href;
        if (!href) return;
        
        // Bỏ query tracking thừa
        if (href.includes('pfbid0')) {
          const match = href.match(/https:\/\/[^\/]+\/[^\/]+\/posts\/pfbid0[a-zA-Z0-9]+/) || href.match(/https:\/\/[^\/]+\/posts\/pfbid0[a-zA-Z0-9]+/);
          if (match) href = match[0];
        } else if (href.includes('/share/p/')) {
          const match = href.match(/https:\/\/[^\/]+\/share\/p\/[a-zA-Z0-9]+/);
          if (match) href = match[0];
        } else {
          href = href.split('?')[0].split('&')[0];
        }
        
        if ((href.includes('/posts/') || href.includes('/share/p/') || href.includes('permalink.php') || href.includes('pfbid0')) && !seenUrls.has(href)) {
          seenUrls.add(href);

          // Trích xuất đoạn văn bản thật của bài viết
          let storyContainer = a.closest('div[role="article"], div[data-ad-preview="message"], div[dir="auto"]');
          let textSnippet = storyContainer ? storyContainer.innerText.slice(0, 300).trim() : '';

          items.push({
            url: href,
            textSnippet: textSnippet
          });
        }
      });

      sendResponse({
        success: true,
        items
      });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }
});
