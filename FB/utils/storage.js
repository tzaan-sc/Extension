/**
 * utils/storage.js - Quản lý IndexedDB theo mô hình quan hệ chuẩn hóa: USERS -> ACTIVITIES -> POSTS
 */

const DB_NAME = 'SocialActivityLensDB';
const DB_VERSION = 2; // Nâng cấp version để tạo bảng quan hệ chuẩn

let dbInstance = null;

export async function initDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Bảng USERS (Hồ sơ mục tiêu)
      if (!db.objectStoreNames.contains('profiles')) {
        const profileStore = db.createObjectStore('profiles', { keyPath: 'uid' });
        profileStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 2. Bảng POSTS (Bài viết gốc - Single Source of Truth)
      if (!db.objectStoreNames.contains('posts')) {
        const postStore = db.createObjectStore('posts', { keyPath: 'post_id' });
        postStore.createIndex('author_id', 'author_id', { unique: false });
        postStore.createIndex('created_at', 'created_at', { unique: false });
      }

      // 3. Bảng ACTIVITIES (Hoạt động comment, tag, mention trỏ về post_id)
      if (!db.objectStoreNames.contains('activities')) {
        const actStore = db.createObjectStore('activities', { keyPath: 'activity_id' });
        actStore.createIndex('target_user_id', 'target_user_id', { unique: false });
        actStore.createIndex('post_id', 'post_id', { unique: false });
        actStore.createIndex('activity_type', 'activity_type', { unique: false });
        actStore.createIndex('activity_created_at', 'activity_created_at', { unique: false });
        actStore.createIndex('target_type', ['target_user_id', 'activity_type'], { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[Storage] Lỗi mở IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Lưu hồ sơ người dùng (USERS)
 */
export async function saveProfile(profile) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('profiles', 'readwrite');
    const store = tx.objectStore('profiles');
    const data = {
      ...profile,
      updatedAt: Date.now()
    };
    const req = store.put(data);
    req.onsuccess = () => resolve(data);
    req.onerror = () => reject(req.error);
  });
}

export async function getProfile(uid) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('profiles', 'readonly');
    const store = tx.objectStore('profiles');
    const req = store.get(uid);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllProfiles() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('profiles', 'readonly');
    const store = tx.objectStore('profiles');
    const req = store.getAll();
    req.onsuccess = () => {
      const list = req.result || [];
      list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteProfile(uid) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['profiles', 'activities'], 'readwrite');
    const profileStore = tx.objectStore('profiles');
    const actStore = tx.objectStore('activities');

    profileStore.delete(uid);

    const index = actStore.index('target_user_id');
    const req = index.openCursor(IDBKeyRange.only(uid));

    req.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Lưu đồng thời danh sách POSTS và ACTIVITIES theo quan hệ chuẩn hóa
 */
export async function saveActivitiesAndPosts(activities = [], posts = []) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['posts', 'activities'], 'readwrite');
    const postStore = tx.objectStore('posts');
    const actStore = tx.objectStore('activities');

    // 1. Lưu các bài viết gốc (tránh trùng lặp qua post_id)
    for (const post of posts) {
      if (post && post.post_id) {
        postStore.put(post);
      }
    }

    // 2. Lưu từng activity trỏ về post_id
    for (const act of activities) {
      if (act && act.activity_id) {
        actStore.put(act);
      }
    }

    tx.oncomplete = () => resolve({ savedActivities: activities.length, savedPosts: posts.length });
    tx.onerror = () => reject(tx.error);
  });
}

// Giữ tương thích ngược với luồng cũ
export async function saveActivities(activities = []) {
  const posts = [];
  const normalizedActs = [];

  for (const item of activities) {
    const postId = item.post_id || item.id || `post_${Math.random().toString(36).slice(2, 9)}`;
    const actId = item.activity_id || item.id || `act_${Math.random().toString(36).slice(2, 9)}`;

    posts.push({
      post_id: postId,
      author_id: item.post_author_id || '',
      author_name: item.authorName || 'Người đăng công khai',
      url: item.postUrl || '',
      content: item.content || '',
      created_at: item.post_created_at || item.timestamp || Date.now()
    });

    normalizedActs.push({
      activity_id: actId,
      target_user_id: item.target_user_id || item.targetUid,
      activity_type: item.activity_type || item.type || 'comments',
      post_id: postId,
      activity_created_at: item.activity_created_at || item.timestamp || Date.now(),
      comment_text: item.commentText || '',
      verified: item.verified !== undefined ? item.verified : true
    });
  }

  return saveActivitiesAndPosts(normalizedActs, posts);
}

/**
 * Truy vấn toàn bộ hoạt động của target UID, JOIN với bảng POSTS theo post_id
 * và nhóm thành Cây theo [activity_type] -> [year]
 */
export async function getActivitiesTree(uid) {
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['activities', 'posts'], 'readonly');
    const actStore = tx.objectStore('activities');
    const postStore = tx.objectStore('posts');

    const index = actStore.index('target_user_id');
    const actReq = index.getAll(IDBKeyRange.only(uid));

    actReq.onsuccess = () => {
      const activities = actReq.result || [];
      const postReq = postStore.getAll();

      postReq.onsuccess = () => {
        const postsList = postReq.result || [];
        const postMap = new Map();
        for (const p of postsList) {
          postMap.set(p.post_id, p);
        }

        // Ghép nối (JOIN) Activity với Post gốc
        const joinedList = activities.map(act => {
          const post = postMap.get(act.post_id) || {};
          const time = act.activity_created_at || post.created_at || Date.now();
          const yr = new Date(time).getFullYear();

          return {
            id: act.activity_id,
            activity_id: act.activity_id,
            targetUid: act.target_user_id,
            type: act.activity_type,
            year: yr,
            timestamp: time,
            post_id: act.post_id,
            postUrl: post.url || '',
            authorName: post.author_name || 'Bài viết công khai',
            author_id: post.author_id || '',
            content: post.content || '',
            commentText: act.comment_text || '',
            verified: act.verified !== false
          };
        });

        // Sắp xếp thời gian giảm dần
        joinedList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        const tree = {
          author_posts: {},
          comments: {},
          tagged_posts: {},
          mentions: {},
          tagged_photos: {},
          tagged_videos: {},
          others: {}
        };

        const counts = {
          author_posts: 0,
          comments: 0,
          tagged_posts: 0,
          mentions: 0,
          tagged_photos: 0,
          tagged_videos: 0,
          others: 0,
          total: joinedList.length
        };

        for (const item of joinedList) {
          const type = tree[item.type] ? item.type : 'others';
          const yrStr = String(item.year || 'Không rõ');

          if (!tree[type][yrStr]) {
            tree[type][yrStr] = [];
          }
          tree[type][yrStr].push(item);
          counts[type]++;
        }

        resolve({ tree, counts, rawList: joinedList });
      };
    };

    tx.onerror = () => reject(tx.error);
  });
}
