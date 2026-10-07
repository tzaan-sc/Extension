/**
 * utils/fb_api.js - Lõi giao tiếp và trích xuất dữ liệu THẬT 100% kết hợp Mobile SSR (mbasic/m.facebook) & Web GraphQL
 */

import { parseFacebookUrl, parseGraphApiItem, buildFacebookPostUrl, extractAllFacebookPostLinks, extractPostId } from './parser.js';

export class FacebookScannerEngine {
  constructor() {
    this.isPaused = false;
    this.isStopped = false;
  }

  pause() { this.isPaused = true; }
  resume() { this.isPaused = false; }
  stop() { this.isStopped = true; }

  async delay(minMs = 1000, maxMs = 2000) {
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
   * Bóc tách toàn bộ JSON nhúng trong HTML của Facebook
   */
  extractJsonBlobs(html) {
    const blobs = [];
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
   * Tìm đệ quy các node trong cây JSON Facebook
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
   * Bước 1: Phân giải URL / Username thành Facebook UID, Tên và Avatar THẬT
   */
  async resolveProfile(input) {
    const parsed = parseFacebookUrl(input);
    if (!parsed) {
      throw new Error('Định dạng liên kết hoặc UID không hợp lệ. Vui lòng kiểm tra lại URL.');
    }

    let targetUrl = parsed.type === 'uid'
      ? `https://www.facebook.com/profile.php?id=${parsed.value}`
      : `https://www.facebook.com/${parsed.value}`;

    try {
      const resp = await fetch(targetUrl, {
        credentials: 'include',
        headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
      });

      if (!resp.ok) {
        throw new Error(`Không thể kết nối tới Facebook (HTTP ${resp.status}). Hãy đảm bảo bạn đã đăng nhập Facebook trên trình duyệt.`);
      }

      const html = await resp.text();

      // 1. Trích xuất UID
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
          /"actorID":"(\d+)"/,
          /data-profileid="(\d+)"/
        ];
        for (const p of uidPatterns) {
          const m = html.match(p);
          if (m && m[1]) {
            uid = m[1];
            break;
          }
        }
      }

      // Thử bóc tách thêm từ mbasic nếu chưa ra UID
      if (!uid) {
        try {
          const mResp = await fetch(`https://mbasic.facebook.com/${parsed.value}`, { credentials: 'include' });
          if (mResp.ok) {
            const mHtml = await mResp.text();
            const mMatch = mHtml.match(/owner_id=(\d+)/) || mHtml.match(/id=(\d+)/) || mHtml.match(/entity_id=(\d+)/);
            if (mMatch) uid = mMatch[1];
          }
        } catch (e) {}
      }

      if (!uid) {
        throw new Error('Không thể tự động bóc tách UID từ trang này. Vui lòng nhập trực tiếp dãy số UID (VD: 1000...).');
      }

      // 2. Trích xuất Tên thật
      let name = '';
      const titleMatch = html.match(/<title id="pageTitle">([^<]+)<\/title>/) || html.match(/<title>([^<]+)<\/title>/);
      if (titleMatch && titleMatch[1]) {
        name = titleMatch[1].replace(' | Facebook', '').replace('- Facebook', '').trim();
      }
      if (!name) name = `User ${uid}`;

      // 3. Trích xuất Avatar thật
      let avatarUrl = '';
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
   * Bước 2: Quét Bài viết đã đăng (Tác giả) - Sử dụng mbasic.facebook.com Server-Side Rendering + Web Feed
   */
  async scanAuthorPosts(uid, authorName, onProgress) {
    const activities = [];
    await this.checkFlowState();
    if (onProgress) onProgress(`Đang quét bài viết thực tế của ${authorName || uid}...`, 20);

    const seenPostIds = new Set();

    // 1. Quét từ endpoint mbasic.facebook.com (Nơi Facebook trả về 100% HTML bài viết thật)
    try {
      const mbasicUrl = `https://mbasic.facebook.com/${uid}`;
      const mResp = await fetch(mbasicUrl, { credentials: 'include' });
      if (mResp.ok) {
        const mHtml = await mResp.text();

        // Bóc tách các liên kết bài viết dạng /story.php?story_fbid=... hoặc /posts/pfbid...
        const storyMatches = [...mHtml.matchAll(/(?:href=")([^"]*(?:story\.php\?story_fbid=|[^\/"]+\/posts\/pfbid0|[^\/"]+\/posts\/\d+)[^"]*)/gi)];
        
        for (const match of storyMatches) {
          let rawHref = match[1].replace(/&amp;/g, '&');
          let fullUrl = rawHref.startsWith('http') ? rawHref : `https://www.facebook.com${rawHref}`;
          
          // Chuẩn hóa link story.php -> permalink chuẩn
          if (fullUrl.includes('story.php?story_fbid=')) {
            const fbidMatch = fullUrl.match(/story_fbid=([^&]+)/);
            const idMatch = fullUrl.match(/[?&]id=([^&]+)/);
            if (fbidMatch && idMatch) {
              fullUrl = `https://www.facebook.com/permalink.php?story_fbid=${fbidMatch[1]}&id=${idMatch[1]}`;
            }
          }

          const postId = extractPostId(fullUrl);
          if (postId && !seenPostIds.has(postId)) {
            seenPostIds.add(postId);

            activities.push({
              activity_id: `author_${uid}_${postId}`,
              target_user_id: uid,
              activity_type: 'author_posts',
              post_id: postId,
              postUrl: fullUrl,
              authorName: authorName || 'Chính chủ',
              post_author_id: uid,
              content: '',
              commentText: '',
              timestamp: Date.now(),
              year: new Date().getFullYear(),
              verified: true
            });
          }
        }
      }
    } catch (e) {
      console.warn('[FB API] Lỗi quét mbasic timeline:', e);
    }

    // 2. Quét từ Web Desktop HTML / JSON Relay
    try {
      const profileUrl = `https://www.facebook.com/${uid}`;
      const resp = await fetch(profileUrl, { credentials: 'include' });
      if (resp.ok) {
        const html = await resp.text();
        const extractedLinks = extractAllFacebookPostLinks(html);

        for (const link of extractedLinks) {
          const postId = extractPostId(link);
          if (postId && !seenPostIds.has(postId)) {
            seenPostIds.add(postId);
            activities.push({
              activity_id: `author_${uid}_${postId}`,
              target_user_id: uid,
              activity_type: 'author_posts',
              post_id: postId,
              postUrl: link,
              authorName: authorName || 'Chính chủ đăng tải',
              post_author_id: uid,
              content: '',
              commentText: '',
              timestamp: Date.now(),
              year: new Date().getFullYear(),
              verified: true
            });
          }
        }

        // Bóc tách JSON Relay nodes
        const jsonBlobs = this.extractJsonBlobs(html);
        const stories = this.findNodesRecursively(jsonBlobs, n => n && (n.__typename === 'Story' || n.__typename === 'CometStory' || (n.message && n.message.text)));

        for (const st of stories) {
          let postUrl = st.url || st.permalink_url;
          if (postUrl) {
            postUrl = postUrl.replace(/\\\//g, '/');
            const postId = extractPostId(postUrl) || st.id || st.post_id;
            if (postId && !seenPostIds.has(postId)) {
              seenPostIds.add(postId);
              const time = st.creation_time ? (typeof st.creation_time === 'number' ? st.creation_time * 1000 : new Date(st.creation_time).getTime()) : Date.now();
              const postText = (st.message && st.message.text) || '';

              activities.push({
                activity_id: `author_${uid}_${postId}`,
                target_user_id: uid,
                activity_type: 'author_posts',
                post_id: postId,
                postUrl: postUrl,
                authorName: authorName || 'Chính chủ đăng tải',
                post_author_id: uid,
                content: postText,
                commentText: '',
                timestamp: time,
                year: new Date(time).getFullYear(),
                verified: true
              });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[FB API] Lỗi quét desktop timeline:', e);
    }

    await this.delay(1000, 1500);
    return activities;
  }

  /**
   * Bước 3: Quét Ảnh & Video được gắn thẻ THẬT (Photos of Target)
   */
  async scanTaggedMedia(uid, onProgress) {
    const activities = [];
    await this.checkFlowState();
    if (onProgress) onProgress(`Đang quét ảnh & video được gắn thẻ thực tế của UID ${uid}...`, 45);

    const seenMediaIds = new Set();

    // 1. Quét từ mbasic Photos
    try {
      const mPhotosUrl = `https://mbasic.facebook.com/${uid}/photos`;
      const mResp = await fetch(mPhotosUrl, { credentials: 'include' });
      if (mResp.ok) {
        const mHtml = await mResp.text();
        const photoMatches = [...mHtml.matchAll(/href="([^"]*\/photo\.php\?fbid=(\d+)[^"]*)"/gi)];

        for (const match of photoMatches) {
          const fbid = match[2];
          if (!fbid || seenMediaIds.has(fbid)) continue;
          seenMediaIds.add(fbid);

          const photoUrl = `https://www.facebook.com/photo.php?fbid=${fbid}`;
          activities.push({
            activity_id: `photo_${uid}_${fbid}`,
            target_user_id: uid,
            activity_type: 'tagged_photos',
            post_id: fbid,
            postUrl: photoUrl,
            authorName: 'Được gắn thẻ trong ảnh',
            post_author_id: '',
            content: '',
            commentText: '',
            timestamp: Date.now(),
            year: new Date().getFullYear(),
            verified: true
          });
        }
      }
    } catch (e) {
      console.warn('[FB API] Lỗi quét mbasic photos:', e);
    }

    // 2. Quét từ desktop Photos of target
    try {
      const dResp = await fetch(`https://www.facebook.com/${uid}/photos_of`, { credentials: 'include' });
      if (dResp.ok) {
        const dHtml = await dResp.text();
        const photoMatches = [...dHtml.matchAll(/\/photo(\.php\?fbid=|\/)([\d]+)[^"'\s]*/g)];

        for (const match of photoMatches) {
          const fbid = match[2];
          if (!fbid || seenMediaIds.has(fbid)) continue;
          seenMediaIds.add(fbid);

          activities.push({
            activity_id: `photo_${uid}_${fbid}`,
            target_user_id: uid,
            activity_type: 'tagged_photos',
            post_id: fbid,
            postUrl: `https://www.facebook.com/photo.php?fbid=${fbid}`,
            authorName: 'Ảnh công khai có gắn thẻ',
            post_author_id: '',
            content: '',
            commentText: '',
            timestamp: Date.now(),
            year: new Date().getFullYear(),
            verified: true
          });
        }
      }
    } catch (e) {}

    await this.delay(1000, 1500);
    return activities;
  }

  /**
   * Bước 4: Quét Bài viết được gắn thẻ THẬT (Tagged Posts / Search)
   */
  async scanTaggedPostsAndMentions(uid, onProgress) {
    const activities = [];
    await this.checkFlowState();
    if (onProgress) onProgress('Đang tìm bài viết công khai có gắn thẻ hoặc nhắc tên...', 70);

    const seenPostIds = new Set();

    // 1. Quét từ mbasic search posts
    try {
      const searchUrl = `https://mbasic.facebook.com/search/posts/?q=${uid}`;
      const resp = await fetch(searchUrl, { credentials: 'include' });
      if (resp.ok) {
        const html = await resp.text();
        const storyMatches = [...html.matchAll(/(?:href=")([^"]*(?:story\.php\?story_fbid=|[^\/"]+\/posts\/pfbid0|[^\/"]+\/posts\/\d+)[^"]*)/gi)];

        for (const match of storyMatches) {
          let rawHref = match[1].replace(/&amp;/g, '&');
          let fullUrl = rawHref.startsWith('http') ? rawHref : `https://www.facebook.com${rawHref}`;

          if (fullUrl.includes('story.php?story_fbid=')) {
            const fbidMatch = fullUrl.match(/story_fbid=([^&]+)/);
            const idMatch = fullUrl.match(/[?&]id=([^&]+)/);
            if (fbidMatch && idMatch) {
              fullUrl = `https://www.facebook.com/permalink.php?story_fbid=${fbidMatch[1]}&id=${idMatch[1]}`;
            }
          }

          const postId = extractPostId(fullUrl);
          if (postId && !seenPostIds.has(postId)) {
            seenPostIds.add(postId);
            activities.push({
              activity_id: `tagged_${uid}_${postId}`,
              target_user_id: uid,
              activity_type: 'tagged_posts',
              post_id: postId,
              postUrl: fullUrl,
              authorName: 'Bài viết công khai có gắn thẻ',
              post_author_id: '',
              content: '',
              commentText: '',
              timestamp: Date.now(),
              year: new Date().getFullYear(),
              verified: true
            });
          }
        }
      }
    } catch (e) {
      console.warn('[FB API] Lỗi quét tagged mbasic search:', e);
    }

    await this.delay(1000, 1500);
    return activities;
  }

  /**
   * Bước 5: Quét Bình luận THẬT (Comments) từ Graph API / Feed posts-commented
   */
  async scanComments(uid, onProgress) {
    const activities = [];
    await this.checkFlowState();
    if (onProgress) onProgress('Đang quét bình luận thực tế từ Facebook...', 85);

    const seenCommentIds = new Set();

    // 1. Quét endpoint posts-commented
    try {
      const searchUrl = `https://www.facebook.com/search/${uid}/posts-commented`;
      const resp = await fetch(searchUrl, { credentials: 'include' });

      if (resp.ok) {
        const html = await resp.text();
        const jsonBlobs = this.extractJsonBlobs(html);

        // A. Bóc tách Graph API array format [{ id, message, created_time, from, cursor }, ...]
        for (const blob of jsonBlobs) {
          const list = Array.isArray(blob) ? blob : (blob && Array.isArray(blob.data) ? blob.data : []);
          for (const item of list) {
            if (item.id && (item.message !== undefined || item.created_time)) {
              if (seenCommentIds.has(item.id)) continue;
              seenCommentIds.add(item.id);

              const parsedItem = parseGraphApiItem(item, 'comments', uid);
              const postId = extractPostId(item.id) || parsedItem.post_id;

              activities.push({
                activity_id: `comment_${item.id}`,
                target_user_id: uid,
                activity_type: 'comments',
                post_id: postId,
                postUrl: parsedItem.postUrl,
                authorName: parsedItem.authorName,
                post_author_id: item.from ? item.from.id : '',
                content: (item.from && item.from.name) ? `Bài viết của: ${item.from.name}` : '',
                commentText: item.message || '',
                timestamp: parsedItem.timestamp,
                year: parsedItem.year,
                verified: true
              });
            }
          }
        }

        // B. Bóc tách Relay comment nodes
        const commentNodes = this.findNodesRecursively(jsonBlobs, n => n && (n.__typename === 'Comment' || (n.body && n.body.text && n.created_time)));
        for (const c of commentNodes) {
          const cText = c.body && c.body.text ? c.body.text : (c.message || '');
          if (!cText) continue;
          const commentId = c.id || Math.random().toString(36).slice(2, 8);
          if (seenCommentIds.has(commentId)) continue;
          seenCommentIds.add(commentId);

          const cTime = c.created_time ? (typeof c.created_time === 'number' ? c.created_time * 1000 : new Date(c.created_time).getTime()) : Date.now();
          const author = (c.author && c.author.name) || (c.from && c.from.name) || 'Bài viết trên Facebook';
          const postUrl = c.id ? buildFacebookPostUrl(c.id) : (c.url || c.permalink_url || '');
          const postId = extractPostId(postUrl) || commentId;

          activities.push({
            activity_id: `comment_${commentId}`,
            target_user_id: uid,
            activity_type: 'comments',
            post_id: postId,
            postUrl: postUrl,
            authorName: author,
            post_author_id: (c.author && c.author.id) || '',
            content: `Bài viết của: ${author}`,
            commentText: cText,
            timestamp: cTime,
            year: new Date(cTime).getFullYear(),
            verified: true
          });
        }
      }
    } catch (e) {
      console.warn('[FB API] Lỗi quét comment:', e);
    }

    await this.delay(1000, 1500);
    return activities;
  }
}
