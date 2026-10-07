/**
 * sidepanel/sidepanel.js - Controller chính điều khiển giao diện Side Panel và luồng quét dữ liệu
 */

import { FacebookScannerEngine } from '../utils/fb_api.js';
import { saveProfile, saveActivities, getActivitiesTree, getAllProfiles, getProfile, deleteProfile } from '../utils/storage.js';
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
const statComments = document.getElementById('statComments');
const statTaggedPosts = document.getElementById('statTaggedPosts');
const statMentions = document.getElementById('statMentions');
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
    statusTitle.textContent = 'Đã dừng quá trình quét.';
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

    const allActivities = [];

    // 2. Quét Tagged Photos / Videos
    if (chkPhotosVideos.checked) {
      updateProgress('Đang quét ảnh và video được gắn thẻ...', 25);
      const mediaActs = await scanner.scanTaggedMedia(currentProfile.uid, updateProgress);
      allActivities.push(...mediaActs);
      await saveActivities(mediaActs);
      await refreshTreeData();
    }

    // 3. Quét Tagged Posts
    if (chkTaggedPosts.checked) {
      updateProgress('Đang tìm bài viết được gắn thẻ / nhắc tên...', 55);
      const postActs = await scanner.scanTaggedPostsAndMentions(currentProfile.uid, updateProgress);
      allActivities.push(...postActs);
      await saveActivities(postActs);
      await refreshTreeData();
    }

    // 4. Quét Comments
    if (chkComments.checked) {
      updateProgress('Đang thu thập lịch sử bình luận công khai...', 80);
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

  targetInfoBox.classList.remove('hidden');
  statsSection.classList.remove('hidden');
  filterSection.classList.remove('hidden');
  emptyState.classList.add('hidden');
  treeContent.classList.remove('hidden');
}

async function refreshTreeData() {
  if (!currentProfile) return;
  const result = await getActivitiesTree(currentProfile.uid);
  currentTreeData = result;
  currentRawList = result.rawList;

  // Cập nhật thống kê stats
  statComments.textContent = result.counts.comments;
  statTaggedPosts.textContent = result.counts.tagged_posts;
  statMentions.textContent = result.counts.mentions;
  statPhotos.textContent = result.counts.tagged_photos + result.counts.tagged_videos;

  renderTree(result.tree);
}

const TYPE_CONFIG = {
  comments: { label: 'Bình luận', emoji: '💬' },
  tagged_posts: { label: 'Bài viết được gắn thẻ', emoji: '🏷️' },
  mentions: { label: 'Được nhắc tên', emoji: '@' },
  tagged_photos: { label: 'Ảnh được gắn thẻ', emoji: '📸' },
  tagged_videos: { label: 'Video được gắn thẻ', emoji: '🎥' },
  others: { label: 'Hoạt động khác', emoji: '📌' }
};

function renderTree(tree) {
  treeContent.innerHTML = '';

  for (const [typeKey, config] of Object.entries(TYPE_CONFIG)) {
    const yearsObj = tree[typeKey] || {};
    const yearKeys = Object.keys(yearsObj).sort((a, b) => b.localeCompare(a));
    const totalCount = yearKeys.reduce((sum, yr) => sum + yearsObj[yr].length, 0);

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
}

function createActivityCard(item) {
  const card = document.createElement('div');
  card.className = 'activity-card';

  card.innerHTML = `
    <div class="activity-header">
      <span class="activity-author">${item.authorName || 'Nội dung công khai'}</span>
      <span>${formatTimestamp(item.timestamp)}</span>
    </div>
    ${item.content ? `<div class="activity-content">${escapeHTML(item.content)}</div>` : ''}
    ${item.commentText ? `
      <div class="activity-comment-box">
        <div class="comment-label">BÌNH LUẬN CỦA TÀI KHOẢN:</div>
        <div class="activity-content">${escapeHTML(item.commentText)}</div>
      </div>
    ` : ''}
    ${item.postUrl ? `<a href="${item.postUrl}" target="_blank" class="activity-link">🔗 Xem bài viết gốc trên Facebook</a>` : ''}
  `;

  return card;
}

function filterAndRenderTree(keyword) {
  if (!currentTreeData) return;
  if (!keyword) {
    renderTree(currentTreeData.tree);
    return;
  }

  const filteredTree = {};
  for (const [type, years] of Object.entries(currentTreeData.tree)) {
    filteredTree[type] = {};
    for (const [year, items] of Object.entries(years)) {
      const matched = items.filter(it => 
        (it.content && it.content.toLowerCase().includes(keyword)) ||
        (it.commentText && it.commentText.toLowerCase().includes(keyword)) ||
        (it.authorName && it.authorName.toLowerCase().includes(keyword))
      );
      if (matched.length > 0) {
        filteredTree[type][year] = matched;
      }
    }
  }

  renderTree(filteredTree);
}

async function openHistoryModal() {
  const profiles = await getAllProfiles();
  historyList.innerHTML = '';

  if (profiles.length === 0) {
    historyList.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px 0;">Chưa có hồ sơ nào được lưu.</p>';
  } else {
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
