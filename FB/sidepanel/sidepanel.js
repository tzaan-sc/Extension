import { FacebookScannerEngine } from '../utils/fb_api.js';
import { saveProfile, saveActivities, getActivitiesTree, getAllProfiles, getProfile, deleteProfile, clearActivitiesOfUid, clearAllDatabase } from '../utils/storage.js';
import { exportToJSON, exportToCSV, exportToHTMLReport, formatTimestamp } from '../utils/parser.js';

// DOM Elements
const inputUrl = document.getElementById('inputUrl');
const btnPasteUrl = document.getElementById('btnPasteUrl');
const btnStartScan = document.getElementById('btnStartScan');
const btnPauseScan = document.getElementById('btnPauseScan');
const btnStopScan = document.getElementById('btnStopScan');
const btnHistory = document.getElementById('btnHistory');
const btnCloseHistory = document.getElementById('btnCloseHistory');
const historyModal = document.getElementById('historyModal');
const historyList = document.getElementById('historyList');

const chkAuthorPosts = document.getElementById('chkAuthorPosts');
const chkComments = document.getElementById('chkComments');
const chkTaggedPosts = document.getElementById('chkTaggedPosts');
const chkPhotosVideos = document.getElementById('chkPhotosVideos');

const statusSection = document.getElementById('statusSection');
const statusTitle = document.getElementById('statusTitle');
const statusDetail = document.getElementById('statusDetail');
const progressBar = document.getElementById('progressBar');

const targetInfoBox = document.getElementById('targetInfoBox');
const targetAvatar = document.getElementById('targetAvatar');
const targetName = document.getElementById('targetName');
const targetUidText = document.getElementById('targetUidText');
const targetProfileLink = document.getElementById('targetProfileLink');

const statsSection = document.getElementById('statsSection');
const statAuthorPosts = document.getElementById('statAuthorPosts');
const statComments = document.getElementById('statComments');
const statTaggedPosts = document.getElementById('statTaggedPosts');
const statPhotos = document.getElementById('statPhotos');

const filterSection = document.getElementById('filterSection');
const inputKeyword = document.getElementById('inputKeyword');
const btnExportJson = document.getElementById('btnExportJson');
const btnExportCsv = document.getElementById('btnExportCsv');
const btnExportHtml = document.getElementById('btnExportHtml');

const treeContainer = document.getElementById('treeContainer');
const emptyState = document.getElementById('emptyState');
const treeContent = document.getElementById('treeContent');

// State
let scanner = null;
let currentProfile = null;
let currentTreeData = null;
let currentRawList = [];
let selectedCategory = 'all';

// Khởi chạy
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  // Thử tự động điền URL nếu tab hiện tại là Facebook profile
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && tab.url.includes('facebook.com')) {
      inputUrl.value = tab.url;
    }
  } catch (e) {}
});

function setupEventListeners() {
  // Nút Dán Clipboard
  btnPasteUrl.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) inputUrl.value = text.trim();
    } catch (e) {
      alert('Vui lòng cấp quyền đọc clipboard hoặc dán thủ công.');
    }
  });

  // Bắt đầu quét
  btnStartScan.addEventListener('click', handleStartScan);

  // Tạm dừng / Tiếp tục
  btnPauseScan.addEventListener('click', () => {
    if (!scanner) return;
    if (scanner.isPaused) {
      scanner.resume();
      btnPauseScan.textContent = 'Tạm dừng';
      statusTitle.textContent = 'Đang tiếp tục quét...';
    } else {
      scanner.pause();
      btnPauseScan.textContent = 'Tiếp tục';
      statusTitle.textContent = 'Đã tạm dừng';
    }
  });

  // Dừng quét
  btnStopScan.addEventListener('click', () => {
    if (scanner) scanner.stop();
    setScanningState(false);
    statusTitle.textContent = 'Đang dừng quá trình quét.';
  });

  // Bộ lọc từ khóa
  inputKeyword.addEventListener('input', (e) => {
    const keyword = e.target.value.toLowerCase().trim();
    filterAndRenderTree(keyword);
  });

  // Xuất dữ liệu
  btnExportJson.addEventListener('click', () => {
    if (currentProfile && currentRawList.length > 0) {
      exportToJSON(currentProfile, currentRawList);
    }
  });

  btnExportCsv.addEventListener('click', () => {
    if (currentProfile && currentRawList.length > 0) {
      exportToCSV(currentProfile, currentRawList);
    }
  });

  btnExportHtml.addEventListener('click', () => {
    if (currentProfile && currentTreeData) {
      exportToHTMLReport(currentProfile, currentTreeData.tree, currentTreeData.counts);
    }
  });

  // Modal Lịch sử
  btnHistory.addEventListener('click', openHistoryModal);
  btnCloseHistory.addEventListener('click', () => historyModal.classList.add('hidden'));

  // Xử lý chuyển đổi Tab danh mục
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCategory = btn.dataset.category || 'all';
      filterAndRenderTree(inputKeyword.value.toLowerCase().trim());
    });
  });
}

async function handleStartScan() {
  const urlVal = inputUrl.value.trim();
  if (!urlVal) {
    alert('Vui lòng nhập đường dẫn trang cá nhân hoặc Facebook UID.');
    inputUrl.focus();
    return;
  }

  setScanningState(true);
  updateProgress('Đang phân giải định danh tài khoản...', 5);

  scanner = new FacebookScannerEngine();

  try {
    // 1. Phân giải Profile
    currentProfile = await scanner.resolveProfile(urlVal);
    renderTargetInfo(currentProfile);
    await saveProfile(currentProfile);

    // Xóa sạch dữ liệu cache cũ của UID này để tránh hiển thị dữ liệu thử nghiệm trước đó
    await clearActivitiesOfUid(currentProfile.uid);
    await refreshTreeData();

    // 1.1 Thử trích xuất các link pfbid0... / posts trực tiếp từ tab Facebook đang mở (nếu có)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        const domResp = await chrome.tabs.sendMessage(tab.id, { action: 'EXTRACT_DOM_POSTS' }).catch(() => null);
        if (domResp && domResp.items && domResp.items.length > 0) {
          const domActs = domResp.items.map(item => {
            const postId = item.url ? item.url.match(/pfbid0[a-zA-Z0-9]+/)?.[0] || item.url.match(/\/posts\/(\d+)/)?.[1] || item.url : '';
            return {
              activity_id: `dom_${currentProfile.uid}_${postId || Math.random().toString(36).slice(2, 9)}`,
              target_user_id: currentProfile.uid,
              activity_type: 'author_posts',
              post_id: postId || '',
              postUrl: item.url,
              authorName: currentProfile.name || 'Chính chủ đăng tải',
              post_author_id: currentProfile.uid,
              content: item.textSnippet || '',
              commentText: '',
              timestamp: Date.now(),
              year: new Date().getFullYear(),
              verified: true
            };
          });
          await saveActivities(domActs);
          await refreshTreeData();
        }
      }
    } catch (e) {}

    const allActivities = [];

    // 2. Quét Bài viết đã đăng (Tác giả - cả bài trên tường lẫn bài trong nhóm/bài ẩn)
    if (chkAuthorPosts && chkAuthorPosts.checked) {
      updateProgress('Đang quét bài viết do tài khoản này đăng...', 20);
      const authorActs = await scanner.scanAuthorPosts(currentProfile.uid, currentProfile.name, updateProgress);
      allActivities.push(...authorActs);
      await saveActivities(authorActs);
      await refreshTreeData();
    }

    // 3. Quét Tagged Photos / Videos
    if (chkPhotosVideos.checked) {
      updateProgress('Đang quét ảnh và video được gắn thẻ...', 45);
      const mediaActs = await scanner.scanTaggedMedia(currentProfile.uid, updateProgress);
      allActivities.push(...mediaActs);
      await saveActivities(mediaActs);
      await refreshTreeData();
    }

    // 4. Quét Tagged Posts
    if (chkTaggedPosts.checked) {
      updateProgress('Đang tìm bài viết được gắn thẻ / nhắc tên...', 70);
      const postActs = await scanner.scanTaggedPostsAndMentions(currentProfile.uid, updateProgress);
      allActivities.push(...postActs);
      await saveActivities(postActs);
      await refreshTreeData();
    }

    // 5. Quét Comments
    if (chkComments.checked) {
      updateProgress('Đang thu thập lịch sử bình luận công khai...', 85);
      const commentActs = await scanner.scanComments(currentProfile.uid, updateProgress);
      allActivities.push(...commentActs);
      await saveActivities(commentActs);
      await refreshTreeData();
    }

    updateProgress('Hoàn tất quá trình quét!', 100);
    setTimeout(() => {
      statusSection.classList.add('hidden');
    }, 2000);

  } catch (err) {
    console.error('[SidePanel] Lỗi quét:', err);
    statusTitle.textContent = 'Gặp lỗi khi quét';
    statusDetail.textContent = err.message || 'Không thể lấy dữ liệu';
  } finally {
    setScanningState(false);
  }
}

function updateProgress(text, percent) {
  statusSection.classList.remove('hidden');
  statusTitle.textContent = text;
  statusDetail.textContent = `Tiến trình: ${percent}%`;
  progressBar.style.width = `${percent}%`;
}

function setScanningState(isScanning) {
  btnStartScan.classList.toggle('hidden', isScanning);
  btnPauseScan.classList.toggle('hidden', !isScanning);
  btnStopScan.classList.toggle('hidden', !isScanning);
  inputUrl.disabled = isScanning;
  btnPasteUrl.disabled = isScanning;
}

function renderTargetInfo(profile) {
  targetAvatar.src = profile.avatarUrl || 'https://via.placeholder.com/64';
  targetName.textContent = profile.name || 'Người dùng Facebook';
  targetUidText.textContent = profile.uid;
  targetProfileLink.href = profile.profileUrl || `https://www.facebook.com/${profile.uid}`;

  // Gắn liên kết Graph Search nhanh
  const uid = profile.uid;
  const quickActionsBox = document.getElementById('quickActionsBox');
  const quickBtnAuthorPosts = document.getElementById('quickBtnAuthorPosts');
  const quickBtnComments = document.getElementById('quickBtnComments');
  const quickBtnTaggedPosts = document.getElementById('quickBtnTaggedPosts');
  const quickBtnPhotos = document.getElementById('quickBtnPhotos');
  const quickBtnVideos = document.getElementById('quickBtnVideos');
  const quickBtnLikes = document.getElementById('quickBtnLikes');

  if (quickActionsBox) {
    if (quickBtnAuthorPosts) quickBtnAuthorPosts.href = `https://www.facebook.com/${uid}`;
    if (quickBtnComments) quickBtnComments.href = `https://www.facebook.com/search/${uid}/posts-commented`;
    if (quickBtnTaggedPosts) quickBtnTaggedPosts.href = `https://www.facebook.com/search/posts/?q=${uid}`;
    if (quickBtnPhotos) quickBtnPhotos.href = `https://www.facebook.com/${uid}/photos_of`;
    if (quickBtnVideos) quickBtnVideos.href = `https://www.facebook.com/${uid}/videos_of`;
    if (quickBtnLikes) quickBtnLikes.href = `https://www.facebook.com/search/${uid}/stories-liked`;
    quickActionsBox.classList.remove('hidden');
  }

  targetInfoBox.classList.remove('hidden');
  statsSection.classList.remove('hidden');
  filterSection.classList.remove('hidden');
  const categoryTabs = document.getElementById('categoryTabs');
  if (categoryTabs) categoryTabs.classList.remove('hidden');
  emptyState.classList.add('hidden');
  treeContent.classList.remove('hidden');
}

async function refreshTreeData() {
  if (!currentProfile) return;
  const result = await getActivitiesTree(currentProfile.uid);
  currentTreeData = result;
  currentRawList = result.rawList;

  // Cập nhật thống kê stats
  if (statAuthorPosts) statAuthorPosts.textContent = result.counts.author_posts || 0;
  if (statComments) statComments.textContent = result.counts.comments || 0;
  if (statTaggedPosts) statTaggedPosts.textContent = result.counts.tagged_posts || 0;
  if (statPhotos) statPhotos.textContent = (result.counts.tagged_photos || 0) + (result.counts.tagged_videos || 0);

  filterAndRenderTree(inputKeyword.value.toLowerCase().trim());
}

const TYPE_CONFIG = {
  author_posts: { label: 'Bài viết đã đăng (Tác giả)', emoji: '📝' },
  comments: { label: 'Bình luận', emoji: '💬' },
  tagged_posts: { label: 'Bài viết được gắn thẻ', emoji: '🏷️' },
  mentions: { label: 'Được nhắc tên', emoji: '@' },
  tagged_photos: { label: 'Ảnh được gắn thẻ', emoji: '📸' },
  tagged_videos: { label: 'Video được gắn thẻ', emoji: '🎥' },
  others: { label: 'Hoạt động khác', emoji: '📌' }
};

function renderTree(tree) {
  treeContent.innerHTML = '';

  let totalAll = 0;
  for (const [typeKey, config] of Object.entries(TYPE_CONFIG)) {
    const yearsObj = tree[typeKey] || {};
    const yearKeys = Object.keys(yearsObj).sort((a, b) => b.localeCompare(a));
    const totalCount = yearKeys.reduce((sum, yr) => sum + yearsObj[yr].length, 0);
    totalAll += totalCount;

    if (totalCount === 0) continue;

    const branch = document.createElement('div');
    branch.className = 'tree-branch';

    const branchHeader = document.createElement('div');
    branchHeader.className = 'branch-header';
    branchHeader.innerHTML = `
      <div class="branch-title">
        <span>${config.emoji}</span>
        <span>${config.label}</span>
      </div>
      <span class="branch-count-badge">${totalCount}</span>
    `;

    const branchBody = document.createElement('div');
    branchBody.className = 'branch-body';

    for (const year of yearKeys) {
      const items = yearsObj[year];
      const yearBranch = document.createElement('div');
      yearBranch.className = 'year-branch';

      const yearHeader = document.createElement('div');
      yearHeader.className = 'year-header';
      yearHeader.innerHTML = `<span>📅 ${year}</span> <span style="font-size:10px;color:var(--text-muted);">(${items.length})</span>`;

      const yearItemsContainer = document.createElement('div');
      yearItemsContainer.className = 'year-items';

      for (const item of items) {
        const card = createActivityCard(item);
        yearItemsContainer.appendChild(card);
      }

      // Collapse toggle cho năm
      yearHeader.addEventListener('click', () => {
        yearItemsContainer.classList.toggle('hidden');
      });

      yearBranch.appendChild(yearHeader);
      yearBranch.appendChild(yearItemsContainer);
      branchBody.appendChild(yearBranch);
    }

    // Collapse toggle cho nhóm hoạt động
    branchHeader.addEventListener('click', () => {
      branchBody.classList.toggle('hidden');
    });

    branch.appendChild(branchHeader);
    branch.appendChild(branchBody);
    treeContent.appendChild(branch);
  }

  if (totalAll === 0) {
    treeContent.innerHTML = `
      <div style="text-align:center;color:var(--text-muted);padding:30px 14px;font-size:12px;line-height:1.6;">
        <div style="font-size:24px;margin-bottom:6px;">🔍</div>
        <strong>Không tìm thấy dữ liệu hoạt động công khai</strong>
        <p style="font-size:11px;margin-top:4px;">Tài khoản này có thể đã ẩn bài viết/ảnh hoặc Facebook không cho phép truy cập công khai.</p>
      </div>
    `;
  }
}

function createActivityCard(item) {
  const card = document.createElement('div');
  card.className = 'activity-card';

  const isVerified = item.verified !== false && item.post_id && !String(item.post_id).startsWith('post_');

  card.innerHTML = `
    <div class="activity-header">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
        <span class="activity-author">${escapeHTML(item.authorName || 'Nội dung công khai')}</span>
        ${item.post_id ? `<span class="post-id-badge" title="ID bài viết gốc">🆔 ${escapeHTML(item.post_id)}</span>` : ''}
        ${isVerified ? `<span class="verified-badge" title="Đã xác thực định danh bài viết gốc">🛡️ Verified</span>` : `<span class="unverified-badge" title="Chưa xác thực trực tiếp">⚠️ Unverified</span>`}
      </div>
      <span>${formatTimestamp(item.timestamp)}</span>
    </div>
    ${item.content ? `<div class="activity-content">${escapeHTML(item.content)}</div>` : ''}
    ${item.commentText ? `
      <div class="activity-comment-box">
        <div class="comment-label">BÌNH LUẬN CỦA TÀI KHOẢN:</div>
        <div class="activity-content">${escapeHTML(item.commentText)}</div>
      </div>
    ` : ''}
    ${item.postUrl ? `
      <div style="margin-top: 5px;">
        <a href="${item.postUrl}" target="_blank" class="activity-link" style="word-break: break-all;">
          🔗 Link bài viết: ${escapeHTML(item.postUrl)}
        </a>
      </div>
    ` : ''}
  `;

  return card;
}

function filterAndRenderTree(keyword) {
  if (!currentTreeData) return;

  const filteredTree = {};
  for (const [type, years] of Object.entries(currentTreeData.tree)) {
    // Nếu có chọn tab danh mục cụ thể (không phải 'all')
    if (selectedCategory !== 'all' && type !== selectedCategory) {
      continue;
    }

    filteredTree[type] = {};
    for (const [year, items] of Object.entries(years)) {
      if (!keyword) {
        filteredTree[type][year] = items;
      } else {
        const matched = items.filter(it => 
          (it.content && it.content.toLowerCase().includes(keyword)) ||
          (it.commentText && it.commentText.toLowerCase().includes(keyword)) ||
          (it.authorName && it.authorName.toLowerCase().includes(keyword)) ||
          (it.postUrl && it.postUrl.toLowerCase().includes(keyword))
        );
        if (matched.length > 0) {
          filteredTree[type][year] = matched;
        }
      }
    }
  }

  renderTree(filteredTree);
}

async function openHistoryModal() {
  const profiles = await getAllProfiles();
  historyList.innerHTML = '';

  if (profiles.length === 0) {
    historyList.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px 0;">Chưa có hồ sơ nào được lưu trong bộ nhớ.</p>';
  } else {
    const clearAllWrap = document.createElement('div');
    clearAllWrap.style.cssText = 'padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;';
    clearAllWrap.innerHTML = `
      <span style="font-size:11px;color:var(--text-muted);">Tổng số: ${profiles.length} hồ sơ</span>
      <button id="btnWipeAllDB" class="mini-btn" style="color:var(--danger);border-color:rgba(239,68,68,0.3);" title="Xóa toàn bộ dữ liệu đã lưu">🗑️ Xóa toàn bộ Cache</button>
    `;
    historyList.appendChild(clearAllWrap);

    clearAllWrap.querySelector('#btnWipeAllDB').addEventListener('click', async () => {
      if (confirm('CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ hồ sơ và bài viết đã lưu trong bộ nhớ máy không?')) {
        await clearAllDatabase();
        currentProfile = null;
        currentTreeData = null;
        currentRawList = [];
        targetInfoBox.classList.add('hidden');
        statsSection.classList.add('hidden');
        filterSection.classList.add('hidden');
        const categoryTabs = document.getElementById('categoryTabs');
        if (categoryTabs) categoryTabs.classList.add('hidden');
        treeContent.classList.add('hidden');
        emptyState.classList.remove('hidden');
        openHistoryModal();
      }
    });

    for (const p of profiles) {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="${p.avatarUrl || 'https://via.placeholder.com/32'}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">
          <div>
            <div style="font-weight:600;font-size:12px;">${escapeHTML(p.name || p.uid)}</div>
            <div style="font-size:10px;color:var(--text-muted);">UID: ${p.uid}</div>
          </div>
        </div>
        <button class="mini-btn" style="color:var(--danger);" title="Xóa">Xóa</button>
      `;

      // Click vào tên để mở hồ sơ
      item.querySelector('div').addEventListener('click', async () => {
        currentProfile = p;
        renderTargetInfo(p);
        await refreshTreeData();
        historyModal.classList.add('hidden');
      });

      // Nút xóa
      item.querySelector('button').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Bạn có chắc muốn xóa hồ sơ ${p.name || p.uid}?`)) {
          await deleteProfile(p.uid);
          openHistoryModal();
        }
      });

      historyList.appendChild(item);
    }
  }

  historyModal.classList.remove('hidden');
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}
