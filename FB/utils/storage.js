/**
 * utils/storage.js - Quản lý IndexedDB lưu trữ hồ sơ và hoạt động Facebook không giới hạn dung lượng
 */

const DB_NAME = 'FBActivityScannerDB';
const DB_VERSION = 1;

let dbInstance = null;

export async function initDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Bảng lưu trữ hồ sơ mục tiêu (Profiles)
      if (!db.objectStoreNames.contains('profiles')) {
        const profileStore = db.createObjectStore('profiles', { keyPath: 'uid' });
        profileStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 2. Bảng lưu trữ toàn bộ hoạt động (Activities)
      if (!db.objectStoreNames.contains('activities')) {
        const actStore = db.createObjectStore('activities', { keyPath: 'id' });
        actStore.createIndex('targetUid', 'targetUid', { unique: false });
        actStore.createIndex('type', 'type', { unique: false });
        actStore.createIndex('year', 'year', { unique: false });
        actStore.createIndex('timestamp', 'timestamp', { unique: false });
        actStore.createIndex('targetUid_type', ['targetUid', 'type'], { unique: false });
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
 * Lưu hoặc cập nhật thông tin hồ sơ mục tiêu
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

/**
 * Lấy thông tin 1 profile theo UID
 */
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

/**
 * Lấy tất cả danh sách profile đã từng quét
 */
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

/**
 * Xóa một hồ sơ và toàn bộ hoạt động liên quan
 */
export async function deleteProfile(uid) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['profiles', 'activities'], 'readwrite');
    const profileStore = tx.objectStore('profiles');
    const actStore = tx.objectStore('activities');

    profileStore.delete(uid);

    const index = actStore.index('targetUid');
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
 * Lưu danh sách các hoạt động (Tránh trùng lặp qua id)
 */
export async function saveActivities(activities) {
  if (!Array.isArray(activities) || activities.length === 0) return 0;
  const db = await initDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['activities', 'profiles'], 'readwrite');
    const actStore = tx.objectStore('activities');
    let insertedCount = 0;

    for (const item of activities) {
      if (!item.id) {
        item.id = `${item.targetUid}_${item.type}_${item.timestamp || Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      }
      actStore.put(item);
      insertedCount++;
    }

    tx.oncomplete = () => resolve(insertedCount);
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Lấy toàn bộ hoạt động của target UID và cấu trúc thành cây (Tree):
 * [Loại hoạt động] -> [Năm] -> [Danh sách hoạt động sắp xếp giảm dần theo thời gian]
 */
export async function getActivitiesTree(uid) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('activities', 'readonly');
    const store = tx.objectStore('activities');
    const index = store.index('targetUid');
    const req = index.getAll(IDBKeyRange.only(uid));

    req.onsuccess = () => {
      const rawList = req.result || [];
      // Sắp xếp thời gian giảm dần (mới nhất trước)
      rawList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

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
        total: rawList.length
      };

      for (const item of rawList) {
        const type = tree[item.type] ? item.type : 'others';
        const year = item.year ? String(item.year) : (item.timestamp ? new Date(item.timestamp).getFullYear().toString() : 'Không rõ');

        if (!tree[type][year]) {
          tree[type][year] = [];
        }
        tree[type][year].push(item);
        counts[type]++;
      }

      resolve({ tree, counts, rawList });
    };

    req.onerror = () => reject(req.error);
  });
}
