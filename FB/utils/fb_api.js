/**
 * utils/fb_api.js - Lõi giao tiếp, trích xuất JSON sâu và tạo truy vấn dữ liệu Facebook
 */

import { parseFacebookUrl } from './parser.js';

export class FacebookScannerEngine {
  constructor() {
    this.isPaused = false;
    this.isStopped = false;
  }

  pause() { this.isPaused = true; }
  resume() { this.isPaused = false; }
  stop() { this.isStopped = true; }

  async delay(minMs = 1200, maxMs = 2500) {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise(r => setTimeout(r, ms));
  }

  async checkFlowState() {
    while (this.isPaused && !this.isStopped) {
      await new Promise(r => setTimeout(r, 500));
    }
    if (this.isStopped) {
      throw new Error('Đã dừng tiến trình quét bởi người dùng.');
    }
  }

  /**
   * Bóc tách toàn bộ JSON nhúng trong HTML của Facebook (Relay cache, ScheduledServerJS, comet data)
   */
  extractJsonBlobs(html) {
    const blobs = [];
    // Tìm các thẻ script chứa JSON
    const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const content = match[1].trim();
      if (content.startsWith('{') && content.endsWith('}')) {
        try {
          blobs.push(JSON.parse(content));
        } catch (e) {}
      } else if (content.includes('require(') || content.includes('{"require":')) {
        const jsonMatch = content.match(/\{"require":[\s\S]*\}/);
        if (jsonMatch) {
          try {
            blobs.push(JSON.parse(jsonMatch[0]));
          } catch (e) {}
        }
      }
    }
    return blobs;
  }

  /**
   * Tìm đệ quy các bài post, ảnh hoặc comment trong cây JSON phức tạp của Facebook
   */
  findNodesRecursively(obj, condition, results = []) {
    if (!obj || typeof obj !== 'object') return results;
    if (condition(obj)) {
      results.push(obj);
    }
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object') {
        this.findNodesRecursively(obj[key], condition, results);
      }
    }
    return results;
  }

  /**
   * Bước 1: Phân giải URL hoặc Username thành Profile Info (UID, Tên, Avatar)
   */
  async resolveProfile(input) {
    const parsed = parseFacebookUrl(input);
    if (!parsed) {
      throw new Error('Định dạng liên kết hoặc UID không hợp lệ. Vui lòng kiểm tra lại URL.');
    }

    let targetUrl = '';
    if (parsed.type === 'uid') {
      targetUrl = `https://www.facebook.com/profile.php?id=${parsed.value}`;
    } else {
      targetUrl = `https://www.facebook.com/${parsed.value}`;
    }

    try {
      const resp = await fetch(targetUrl, {
        credentials: 'include',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!resp.ok) {
        throw new Error(`Không thể kết nối tới Facebook (HTTP ${resp.status}). Vui lòng đảm bảo bạn đang đăng nhập Facebook trên trình duyệt.`);
      }

      const html = await resp.text();

      // Bóc tách UID từ HTML
      let uid = parsed.type === 'uid' ? parsed.value : null;

      if (!uid) {
        const uidPatterns = [
          /"userID":"(\d+)"/,
          /"entity_id":"(\d+)"/,
          /"profile_id":"(\d+)"/,
          /fb:\/\/profile\/(\d+)/,
          /"author_id":(\d+)/,
          /"target_id":"(\d+)"/,
          /props\.id="(\d+)"/,
          /"actorID":"(\d+)"/
        ];

        for (const pattern of uidPatterns) {
          const m = html.match(pattern);
          if (m && m[1]) {
            uid = m[1];
            break;
          }
        }
      }

      if (!uid) {
        throw new Error('Không thể tự động bóc tách UID từ trang cá nhân này. Bạn có thể nhập trực tiếp dãy số UID (VD: 1000...).');
      }

      // Bóc tách Tên
      let name = 'Người dùng Facebook';
      const titleMatch = html.match(/<title id="pageTitle">([^<]+)<\/title>/) || html.match(/<title>([^<]+)<\/title>/);
      if (titleMatch && titleMatch[1]) {
        name = titleMatch[1].replace(' | Facebook', '').trim();
      }

      // Bóc tách Avatar
      let avatarUrl = 'https://via.placeholder.com/64';
      const metaOgImage = html.match(/<meta property="og:image" content="([^"]+)"/);
      if (metaOgImage && metaOgImage[1]) {
        avatarUrl = metaOgImage[1].replace(/&amp;/g, '&');
      }

      return {
        uid,
        name,
        avatarUrl,
        profileUrl: `https://www.facebook.com/${uid}`,
        username: parsed.type === 'username' ? parsed.value : ''
      };
    } catch (err) {
      console.error('[FB API] Lỗi resolveProfile:', err);
      throw err;
    }
  }

  /**
   * Bước 2: Quét Bài viết đã đăng (Bài viết do chính người này đăng trên trang cá nhân, Group, Page hoặc bài đã ẩn nhưng còn công khai)
   */
  async scanAuthorPosts(uid, authorName, onProgress) {
    const activities = [];
    await this.checkFlowState();
    if (onProgress) onProgress(`Đang quét bài viết do ${authorName || uid} đăng (kể cả bài ẩn nhưng còn công khai)...`, 20);

    try {
      // 1. Quét từ Profile Timeline chính
      const profileUrl = `https://www.facebook.com/${uid}`;
      const resp = await fetch(profileUrl, { credentials: 'include' });
      if (resp.ok) {
        const html = await resp.text();
        const jsonBlobs = this.extractJsonBlobs(html);

        // Tìm các story node do chính author_id == uid đăng
        const stories = this.findNodesRecursively(jsonBlobs, node => {
          return node && (node.__typename === 'Story' || node.__typename === 'CometStory' || (node.comet_sections && node.comet_sections.content));
        });

        for (const st of stories.slice(0, 15)) {
          const postId = st.id || st.post_id || Math.random().toString(36).slice(2, 9);
          const postText = (st.message && st.message.text) || (st.comet_sections && st.comet_sections.content && st.comet_sections.content.story && st.comet_sections.content.story.message && st.comet_sections.content.story.message.text) || 'Bài viết được chia sẻ công khai.';
          const postUrl = st.url || st.permalink_url || `https://www.facebook.com/${uid}/posts/${postId}`;
          const time = st.creation_time ? st.creation_time * 1000 : Date.now();
          const yr = new Date(time).getFullYear();

          activities.push({
            id: `${uid}_author_posts_${postId}`,
            targetUid: uid,
            type: 'author_posts',
            year: yr,
            timestamp: time,
            postUrl,
            authorName: authorName || 'Chính chủ đăng tải',
            content: postText,
            commentText: ''
          });
        }

        // Regex fallback trích xuất link dạng /share/p/... hoặc /posts/...
        const postMatches = [...html.matchAll(/(https:\/\/[www\.]*facebook\.com\/(?:share\/p\/|[^\/]+\/posts\/|permalink\.php\?story_fbid=)[\w\d_\-\.\?=\&]+)/g)];
        const seenLinks = new Set();

        for (const pm of postMatches.slice(0, 10)) {
          const rawLink = pm[1].replace(/&amp;/g, '&');
          if (seenLinks.has(rawLink)) continue;
          seenLinks.add(rawLink);

          activities.push({
            id: `${uid}_author_posts_${Math.random().toString(36).slice(2, 9)}`,
            targetUid: uid,
            type: 'author_posts',
            year: new Date().getFullYear(),
            timestamp: Date.now(),
            postUrl: rawLink,
            authorName: authorName || 'Chính chủ đăng tải',
            content: 'Bài viết công khai được tìm thấy trên Facebook.',
            commentText: ''
          });
        }
      }

      // 2. Quét từ bộ lọc Search Posts by Author (Tìm các bài đăng trong Groups/Pages hoặc bài đã ẩn khỏi timeline grid)
      const authorFilterSearchUrl = `https://www.facebook.com/search/posts/?q=${uid}`;
      const searchResp = await fetch(authorFilterSearchUrl, { credentials: 'include' });
      if (searchResp.ok) {
        const sHtml = await searchResp.text();
        const sMatches = [...sHtml.matchAll(/(https:\/\/[www\.]*facebook\.com\/(?:share\/p\/|[^\/]+\/posts\/)[\w\d_\-]+)/g)];
        for (const sm of sMatches.slice(0, 8)) {
          const sLink = sm[1].replace(/&amp;/g, '&');
          activities.push({
            id: `${uid}_author_posts_${Math.random().toString(36).slice(2, 9)}`,
            targetUid: uid,
            type: 'author_posts',
            year: new Date().getFullYear(),
            timestamp: Date.now(),
            postUrl: sLink,
            authorName: authorName || 'Bài viết công khai của tài khoản',
            content: 'Bài viết công khai được tìm thấy trên các nhóm hoặc trang Facebook.',
            commentText: ''
          });
        }
      }

    } catch (e) {
      console.warn('[FB API] Lỗi quét bài viết đã đăng:', e);
    }

    // Lối tắt trực tiếp
    activities.push({
      id: `${uid}_author_posts_shortcut`,
      targetUid: uid,
      type: 'author_posts',
      year: new Date().getFullYear(),
      timestamp: Date.now(),
      postUrl: `https://www.facebook.com/${uid}`,
      authorName: 'Trang cá nhân & Lịch sử đăng bài',
      content: '📝 Mở toàn bộ dòng thời gian và các bài đăng công khai của tài khoản.',
      commentText: ''
    });

    await this.delay(1000, 2000);
    return activities;
  }

  /**
   * Bước 3: Quét Ảnh & Video được gắn thẻ (Tagged Media)
   */
  async scanTaggedMedia(uid, onProgress) {
    const activities = [];
    const mediaSources = [
      { type: 'tagged_photos', label: 'ảnh', url: `https://www.facebook.com/${uid}/photos_of`, directSearch: `https://www.facebook.com/${uid}/photos_of` },
      { type: 'tagged_videos', label: 'video', url: `https://www.facebook.com/${uid}/videos_of`, directSearch: `https://www.facebook.com/${uid}/videos_of` }
    ];

    for (const src of mediaSources) {
      await this.checkFlowState();
      if (onProgress) onProgress(`Đang quét ${src.label} được gắn thẻ của UID ${uid}...`, 25);

      try {
        const resp = await fetch(src.url, { credentials: 'include' });
        if (resp.ok) {
          const html = await resp.text();
          const jsonBlobs = this.extractJsonBlobs(html);

          // Tìm các node ảnh / video trong Relay tree
          const mediaNodes = this.findNodesRecursively(jsonBlobs, node => {
            return (node && (node.__typename === 'Photo' || node.__typename === 'Video' || node.image || node.photo_id));
          });

          if (mediaNodes.length > 0) {
            for (const node of mediaNodes.slice(0, 20)) {
              const photoId = node.id || node.photo_id || Math.random().toString(36).slice(2, 8);
              const postUrl = node.url || node.permalink_url || `https://www.facebook.com/photo.php?fbid=${photoId}&set=a.${uid}`;
              const time = node.creation_time ? node.creation_time * 1000 : (node.publish_time ? node.publish_time * 1000 : Date.now());
              const yr = new Date(time).getFullYear();

              activities.push({
                id: `${uid}_${src.type}_${photoId}`,
                targetUid: uid,
                type: src.type,
                year: yr,
                timestamp: time,
                postUrl,
                authorName: (node.owner && node.owner.name) || (node.actors && node.actors[0] && node.actors[0].name) || 'Bài đăng gắn thẻ công khai',
                content: node.accessibility_caption || (node.message && node.message.text) || `Hình ảnh/Video công khai có gắn thẻ tài khoản ${uid}`,
                commentText: ''
              });
            }
          } else {
            // Regex fallback tìm kiếm các liên kết ảnh trực tiếp trong HTML
            const photoMatches = [...html.matchAll(/\/photo(\.php\?fbid=|\/)([\d]+)[^"'\s]*/g)];
            const seenIds = new Set();

            for (const match of photoMatches) {
              const fbid = match[2];
              if (!fbid || seenIds.has(fbid)) continue;
              seenIds.add(fbid);

              const photoUrl = `https://www.facebook.com/photo.php?fbid=${fbid}`;
              activities.push({
                id: `${uid}_${src.type}_${fbid}`,
                targetUid: uid,
                type: src.type,
                year: new Date().getFullYear(),
                timestamp: Date.now(),
                postUrl: photoUrl,
                authorName: 'Được gắn thẻ trong bài đăng ảnh',
                content: `Ảnh công khai có sự xuất hiện hoặc được tag bởi bạn bè (Photo ID: ${fbid}).`,
                commentText: ''
              });
            }
          }
        }
      } catch (e) {
        console.warn(`[FB API] Lỗi quét ${src.type}:`, e);
      }

      // Thêm lối tắt truy vấn trực tiếp vào bộ sưu tập
      activities.push({
        id: `${uid}_${src.type}_shortcut`,
        targetUid: uid,
        type: src.type,
        year: new Date().getFullYear(),
        timestamp: Date.now(),
        postUrl: src.directSearch,
        authorName: 'Bộ sưu tập Facebook',
        content: `🔍 Mở toàn bộ danh sách ${src.label} được gắn thẻ của tài khoản này trên Facebook.`,
        commentText: ''
      });

      await this.delay(1000, 2000);
    }

    return activities;
  }

  /**
   * Bước 3: Quét Bài viết được gắn thẻ & Nhắc tên (Tagged Posts & Mentions)
   */
  async scanTaggedPostsAndMentions(uid, onProgress) {
    const activities = [];
    await this.checkFlowState();
    if (onProgress) onProgress('Đang tìm bài viết công khai có gắn thẻ hoặc nhắc tên...', 50);

    const searchUrl = `https://www.facebook.com/search/posts/?q=${uid}`;

    try {
      const resp = await fetch(searchUrl, { credentials: 'include' });
      if (resp.ok) {
        const html = await resp.text();
        const jsonBlobs = this.extractJsonBlobs(html);

        // Tìm các story nodes trong feed kết quả tìm kiếm
        const storyNodes = this.findNodesRecursively(jsonBlobs, node => {
          return node && (node.__typename === 'Story' || node.__typename === 'CometStory' || (node.message && node.message.text));
        });

        for (const story of storyNodes.slice(0, 15)) {
          const storyId = story.id || story.post_id || Math.random().toString(36).slice(2, 8);
          const author = (story.actors && story.actors[0] && story.actors[0].name) || 'Người đăng công khai';
          const postText = (story.message && story.message.text) || 'Bài viết công khai có liên kết tới tài khoản.';
          const postUrl = story.url || story.permalink_url || `https://www.facebook.com/${uid}`;
          const time = story.creation_time ? story.creation_time * 1000 : Date.now();

          activities.push({
            id: `${uid}_tagged_posts_${storyId}`,
            targetUid: uid,
            type: 'tagged_posts',
            year: new Date(time).getFullYear(),
            timestamp: time,
            postUrl,
            authorName: author,
            content: postText,
            commentText: ''
          });
        }

        // Regex fallback nếu JSON bị mã hóa sâu
        if (activities.length === 0) {
          const postLinks = [...html.matchAll(/href="(https:\/\/[www\.]*facebook\.com\/[^/]+\/posts\/[^"]+)"/g)];
          for (const pl of postLinks.slice(0, 10)) {
            activities.push({
              id: `${uid}_tagged_posts_${Math.random().toString(36).slice(2, 9)}`,
              targetUid: uid,
              type: 'tagged_posts',
              year: new Date().getFullYear(),
              timestamp: Date.now(),
              postUrl: pl[1].replace(/&amp;/g, '&'),
              authorName: 'Bài viết công khai có tag',
              content: 'Bài viết công khai nhắc tới hoặc có liên quan đến tài khoản này.',
              commentText: ''
            });
          }
        }
      }
    } catch (e) {
      console.warn('[FB API] Lỗi quét bài viết tag:', e);
    }

    // Luôn bổ sung Deep Search Link dẫn tới trang tìm kiếm chính xác bài viết tag trên FB
    activities.push({
      id: `${uid}_tagged_posts_direct_search`,
      targetUid: uid,
      type: 'tagged_posts',
      year: new Date().getFullYear(),
      timestamp: Date.now(),
      postUrl: `https://www.facebook.com/search/posts/?q=${uid}`,
      authorName: 'Bộ lọc tìm kiếm Facebook',
      content: '🔍 Xem tất cả các bài viết công khai trên toàn Facebook có gắn thẻ hoặc nhắc đến UID này.',
      commentText: ''
    });

    await this.delay(1200, 2200);
    return activities;
  }

  /**
   * Bước 4: Quét Bình luận (Comments)
   */
  async scanComments(uid, onProgress) {
    const activities = [];
    await this.checkFlowState();
    if (onProgress) onProgress('Đang phân tích các cuộc trò chuyện và bình luận công khai...', 75);

    try {
      // 1. Quét từ endpoint posts-commented
      const commentSearchUrl = `https://www.facebook.com/search/${uid}/posts-commented`;
      const resp = await fetch(commentSearchUrl, { credentials: 'include' });

      if (resp.ok) {
        const html = await resp.text();
        const jsonBlobs = this.extractJsonBlobs(html);

        // Tìm các bình luận hoặc bài viết có tương tác
        const commentNodes = this.findNodesRecursively(jsonBlobs, node => {
          return node && (node.__typename === 'Comment' || (node.body && node.body.text));
        });

        for (const c of commentNodes.slice(0, 10)) {
          const cText = c.body && c.body.text ? c.body.text : 'Bình luận công khai';
          const cTime = c.created_time ? c.created_time * 1000 : Date.now();
          const author = (c.author && c.author.name) || 'Tài khoản mục tiêu';
          const postUrl = c.url || c.permalink_url || `https://www.facebook.com/${uid}`;

          activities.push({
            id: `${uid}_comments_${c.id || Math.random().toString(36).slice(2, 8)}`,
            targetUid: uid,
            type: 'comments',
            year: new Date(cTime).getFullYear(),
            timestamp: cTime,
            postUrl,
            authorName: `Bài viết trên Facebook`,
            content: `Bài viết công khai nơi tài khoản đã để lại bình luận.`,
            commentText: cText
          });
        }
      }
    } catch (e) {
      console.warn('[FB API] Lỗi quét comment:', e);
    }

    // Thêm các lối tắt Deep Filter cho bình luận và tương tác
    activities.push(
      {
        id: `${uid}_comments_filter_direct`,
        targetUid: uid,
        type: 'comments',
        year: new Date().getFullYear(),
        timestamp: Date.now(),
        postUrl: `https://www.facebook.com/search/${uid}/posts-commented`,
        authorName: 'Lối tắt Facebook Graph',
        content: '💬 Xem tất cả bài viết công khai mà người này từng bình luận.',
        commentText: 'Nhấp để xem toàn bộ danh sách bài viết người này đã để lại bình luận trên Facebook.'
      },
      {
        id: `${uid}_likes_filter_direct`,
        targetUid: uid,
        type: 'others',
        year: new Date().getFullYear(),
        timestamp: Date.now(),
        postUrl: `https://www.facebook.com/search/${uid}/stories-liked`,
        authorName: 'Lối tắt Tương tác Like',
        content: '👍 Xem các bài viết công khai mà người này đã bấm Like/Thả tim.',
        commentText: ''
      }
    );

    await this.delay(1000, 2000);
    return activities;
  }
}
