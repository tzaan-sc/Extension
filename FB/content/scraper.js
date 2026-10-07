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

// Hàm trích xuất thông tin người dùng từ DOM trang profile hiện tại
function extractProfileFromDOM() {
  let uid = null;
  let name = '';
  let avatarUrl = '';

  // Tên
  const h1 = document.querySelector('h1');
  if (h1) name = h1.innerText.trim();

  // Avatar
  const avatarImg = document.querySelector('svg[aria-label] image, image[preserveAspectRatio], img[alt*="ảnh đại diện"], img[alt*="profile picture"]');
  if (avatarImg) {
    avatarUrl = avatarImg.getAttribute('xlink:href') || avatarImg.getAttribute('src') || '';
  }

  // UID
  const entityMatch = document.documentElement.innerHTML.match(/"entity_id":"(\d+)"/) ||
                      document.documentElement.innerHTML.match(/"userID":"(\d+)"/) ||
                      document.documentElement.innerHTML.match(/"profile_id":"(\d+)"/);
  if (entityMatch) uid = entityMatch[1];

  return { uid, name, avatarUrl };
}

// Hàm quét tất cả bài viết, bình luận, ảnh trên DOM hiện tại
function scanCurrentDOM() {
  const posts = [];
  const comments = [];
  const photos = [];
  const seenUrls = new Set();

  // 1. Quét các bài viết (role="article" hoặc feed units)
  const articleNodes = document.querySelectorAll('div[role="article"], div[data-pagelet^="ProfileTimeline"], div[data-pagelet^="FeedUnit"]');
  
  articleNodes.forEach(art => {
    // Tìm link permalink trong bài
    const links = art.querySelectorAll('a[href*="/posts/"], a[href*="/share/p/"], a[href*="permalink.php"], a[href*="pfbid0"], a[href*="/photo"]');
    let postUrl = '';

    for (const a of links) {
      let href = a.href;
      if (!href) continue;

      if (href.includes('pfbid0')) {
        const match = href.match(/https:\/\/[^\/]+(?:\/[^\/]+)?\/posts\/pfbid0[a-zA-Z0-9]+/);
        if (match) { postUrl = match[0]; break; }
      } else if (href.includes('/share/p/')) {
        const match = href.match(/https:\/\/[^\/]+\/share\/p\/[a-zA-Z0-9]+/);
        if (match) { postUrl = match[0]; break; }
      } else if (href.includes('permalink.php')) {
        const match = href.match(/https:\/\/[^\/]+\/permalink\.php\?story_fbid=[^&]+&id=\d+/);
        if (match) { postUrl = match[0]; break; }
      } else if (href.includes('/posts/')) {
        const match = href.match(/https:\/\/[^\/]+(?:\/[^\/]+)?\/posts\/\d+/);
        if (match) { postUrl = match[0]; break; }
      }
    }

    // Nếu không tìm thấy trong bài, quét các thẻ link phụ
    if (!postUrl && links.length > 0) {
      postUrl = links[0].href.split('?')[0];
    }

    if (postUrl && !seenUrls.has(postUrl)) {
      seenUrls.add(postUrl);

      // Trích xuất nội dung văn bản
      const textNodes = art.querySelectorAll('div[data-ad-preview="message"], div[dir="auto"][style*="text-align"], div[dir="auto"]');
      let textSnippet = '';
      for (const tn of textNodes) {
        const t = tn.innerText.trim();
        if (t && t.length > textSnippet.length && !t.includes('Thích') && !t.includes('Bình luận') && !t.includes('Chia sẻ')) {
          textSnippet = t;
        }
      }

      // Trích xuất tên tác giả
      const authorNode = art.querySelector('h2, h3, strong, a[role="link"] > span[dir="auto"]');
      const authorName = authorNode ? authorNode.innerText.trim() : '';

      posts.push({
        url: postUrl,
        textSnippet: textSnippet.slice(0, 500),
        authorName: authorName
      });
    }

    // 2. Quét bình luận nằm trong article
    const commentNodes = art.querySelectorAll('div[aria-label*="Bình luận"], div[aria-label*="Comment"], div[role="article"]');
    commentNodes.forEach(cNode => {
      if (cNode === art) return;
      const cTextNode = cNode.querySelector('div[dir="auto"]');
      const cAuthorNode = cNode.querySelector('a[role="link"] span, strong, span[dir="auto"]');
      const cText = cTextNode ? cTextNode.innerText.trim() : '';
      const cAuthor = cAuthorNode ? cAuthorNode.innerText.trim() : '';

      if (cText && cText !== textSnippet) {
        comments.push({
          commentText: cText,
          authorName: cAuthor,
          postUrl: postUrl || window.location.href
        });
      }
    });
  });

  // 3. Quét các thẻ a độc lập nếu cấu trúc DOM phức tạp
  const allAnchors = document.querySelectorAll('a[href*="pfbid0"], a[href*="/share/p/"], a[href*="permalink.php?"]');
  allAnchors.forEach(a => {
    let href = a.href;
    if (href.includes('pfbid0')) {
      const match = href.match(/https:\/\/[^\/]+(?:\/[^\/]+)?\/posts\/pfbid0[a-zA-Z0-9]+/);
      if (match) href = match[0];
    } else if (href.includes('/share/p/')) {
      const match = href.match(/https:\/\/[^\/]+\/share\/p\/[a-zA-Z0-9]+/);
      if (match) href = match[0];
    } else {
      href = href.split('?')[0];
    }

    if (href && !seenUrls.has(href)) {
      seenUrls.add(href);
      const container = a.closest('div[role="article"], div[data-ad-preview="message"], div[dir="auto"]');
      posts.push({
        url: href,
        textSnippet: container ? container.innerText.slice(0, 300).trim() : '',
        authorName: ''
      });
    }
  });

  return { posts, comments, photos };
}

// Lắng nghe các yêu cầu từ Side Panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_FB_TOKENS') {
    const tokens = extractFacebookTokens();
    const profile = extractProfileFromDOM();
    sendResponse({ success: true, ...tokens, profile });
    return true;
  }

  if (request.action === 'EXTRACT_DOM_POSTS' || request.action === 'EXTRACT_DOM_DEEP') {
    const autoScrollSteps = request.autoScrollSteps || 0;

    (async () => {
      try {
        const profile = extractProfileFromDOM();

        // Nếu người dùng yêu cầu cuộn tự động
        if (autoScrollSteps > 0) {
          for (let i = 0; i < autoScrollSteps; i++) {
            window.scrollBy({ top: 800, behavior: 'smooth' });
            await new Promise(r => setTimeout(r, 1200));
          }
        }

        const domData = scanCurrentDOM();
        sendResponse({
          success: true,
          profile,
          posts: domData.posts,
          comments: domData.comments,
          photos: domData.photos
        });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();

    return true; // async response
  }
});
