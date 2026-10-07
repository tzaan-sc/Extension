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

  // 1. Quét toàn bộ thẻ <a> trên trang Facebook
  const allAnchors = document.querySelectorAll('a[href]');
  
  allAnchors.forEach(a => {
    let href = a.href;
    if (!href || href.startsWith('javascript:') || href === '#' || href.includes('/login') || href.includes('/help/')) return;

    let cleanUrl = '';
    let type = 'post';

    // Nhận diện URL bài viết pfbid0...
    if (href.includes('pfbid0')) {
      const match = href.match(/https:\/\/[^\/]+(?:\/[^\/]+)?\/posts\/pfbid0[a-zA-Z0-9]+/);
      cleanUrl = match ? match[0] : href.split('?')[0];
    } 
    // Nhận diện URL share/p/...
    else if (href.includes('/share/p/')) {
      const match = href.match(/https:\/\/[^\/]+\/share\/p\/[a-zA-Z0-9]+/);
      cleanUrl = match ? match[0] : href.split('?')[0];
    }
    // Nhận diện permalink.php?story_fbid=...
    else if (href.includes('permalink.php')) {
      const match = href.match(/https:\/\/[^\/]+\/permalink\.php\?story_fbid=([^&]+)&id=(\d+)/);
      if (match) {
        cleanUrl = `https://www.facebook.com/permalink.php?story_fbid=${match[1]}&id=${match[2]}`;
      } else {
        cleanUrl = href.split('&__cft__')[0];
      }
    }
    // Nhận diện story.php
    else if (href.includes('story.php')) {
      const fbidMatch = href.match(/story_fbid=([^&]+)/);
      const idMatch = href.match(/[?&]id=([^&]+)/);
      if (fbidMatch && idMatch) {
        cleanUrl = `https://www.facebook.com/permalink.php?story_fbid=${fbidMatch[1]}&id=${idMatch[1]}`;
      }
    }
    // Nhận diện /posts/ số
    else if (href.match(/\/posts\/\d+/)) {
      const match = href.match(/https:\/\/[^\/]+(?:\/[^\/]+)?\/posts\/\d+/);
      cleanUrl = match ? match[0] : href.split('?')[0];
    }
    // Nhận diện /groups/.../posts/...
    else if (href.includes('/groups/') && href.includes('/posts/')) {
      const match = href.match(/https:\/\/[^\/]+\/groups\/[^\/]+\/posts\/[a-zA-Z0-9_]+/);
      cleanUrl = match ? match[0] : href.split('?')[0];
    }
    // Nhận diện ảnh
    else if (href.includes('/photo.php') || href.includes('/photos/') || href.includes('/photo/')) {
      const match = href.match(/fbid=(\d+)/) || href.match(/\/photos\/[^\/]+\/(\d+)/) || href.match(/\/photo\/\?fbid=(\d+)/);
      if (match) {
        cleanUrl = `https://www.facebook.com/photo.php?fbid=${match[1]}`;
        type = 'photo';
      }
    }

    if (cleanUrl && !seenUrls.has(cleanUrl)) {
      seenUrls.add(cleanUrl);

      // Tìm container cha chứa bài viết để trích xuất văn bản thật và tác giả
      let container = a.closest('div[role="article"], div[data-pagelet^="ProfileTimeline"], div[data-pagelet^="FeedUnit"], div[data-pagelet^="Timeline"]') || a.parentElement;
      for (let i = 0; i < 8 && container && !container.getAttribute('role'); i++) {
        if (container.parentElement) container = container.parentElement;
      }

      let textSnippet = '';
      let authorName = '';

      if (container) {
        // Trích xuất văn bản bài viết
        const textElements = container.querySelectorAll('div[data-ad-preview="message"], div[dir="auto"][style*="text-align"], div[dir="auto"], span[dir="auto"]');
        for (const el of textElements) {
          const txt = el.innerText.trim();
          if (txt && txt.length > textSnippet.length && 
              !txt.includes('Thích') && !txt.includes('Bình luận') && !txt.includes('Chia sẻ') && 
              !txt.includes('Gửi') && !txt.startsWith('Xem thêm')) {
            textSnippet = txt;
          }
        }

        // Trích xuất tác giả
        const authorEl = container.querySelector('h2, h3, strong, a[role="link"] > span[dir="auto"]');
        if (authorEl) authorName = authorEl.innerText.trim();
      }

      if (type === 'photo') {
        photos.push({
          url: cleanUrl,
          textSnippet: textSnippet.slice(0, 300),
          authorName: authorName
        });
      } else {
        posts.push({
          url: cleanUrl,
          textSnippet: textSnippet.slice(0, 500),
          authorName: authorName
        });
      }
    }
  });

  // 2. Quét bình luận trên toàn bộ DOM
  const commentContainers = document.querySelectorAll('div[aria-label*="Bình luận"], div[aria-label*="Comment"], ul[role="list"] > li, div[role="article"]');
  commentContainers.forEach(cBox => {
    // Chỉ lấy comment con, tránh lấy toàn bộ bài viết lớn
    if (cBox.querySelector('div[role="article"]')) return;

    const textEl = cBox.querySelector('div[dir="auto"], span[dir="auto"]');
    const authorEl = cBox.querySelector('a[role="link"] span, strong, span[dir="auto"]');
    const cText = textEl ? textEl.innerText.trim() : '';
    const cAuthor = authorEl ? authorEl.innerText.trim() : '';

    if (cText && cText.length > 1 && !cText.includes('Thích') && !cText.includes('Trả lời') && !cText.includes('Chia sẻ')) {
      const permalinkAnchor = cBox.querySelector('a[href*="comment_id="], a[href*="/posts/"], a[href*="pfbid0"]');
      const postUrl = permalinkAnchor ? permalinkAnchor.href.split('&__cft__')[0] : window.location.href;

      comments.push({
        commentText: cText,
        authorName: cAuthor || 'Bình luận trên Facebook',
        postUrl: postUrl
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
