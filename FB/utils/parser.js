/**
 * Chuyển đổi ID dạng "USERID_POSTID" hoặc "PAGEID_POSTID" thành Link Facebook trực tiếp
 */
export function buildFacebookPostUrl(idString) {
  if (!idString) return 'https://www.facebook.com';
  const parts = idString.split('_');
  if (parts.length >= 2) {
    const parentId = parts[0];
    const postId = parts[1];
    return `https://www.facebook.com/permalink.php?story_fbid=${postId}&id=${parentId}`;
  }
  return `https://www.facebook.com/${idString}`;
}

/**
 * Trích xuất toàn bộ liên kết bài viết Facebook (bao gồm định dạng pfbid0..., /share/p/..., /posts/...)
 */
export function extractAllFacebookPostLinks(rawText) {
  if (!rawText) return [];
  // 1. Unescape JSON slashes (\/ -> /)
  const text = rawText.replace(/\\\//g, '/');
  const links = new Set();

  // Pattern A: https://www.facebook.com/{username}/posts/pfbid0... (hoặc relative /username/posts/pfbid0...)
  const pfbidRegex = /(?:https?:\/\/(?:www\.)?facebook\.com)?\/([a-zA-Z0-9\._\-]+)\/posts\/(pfbid0[a-zA-Z0-9]+)/gi;
  let m;
  while ((m = pfbidRegex.exec(text)) !== null) {
    const username = m[1];
    const pfbid = m[2];
    links.add(`https://www.facebook.com/${username}/posts/${pfbid}`);
  }

  // Pattern B: /share/p/{id}/
  const shareRegex = /(?:https?:\/\/(?:www\.)?facebook\.com)?\/share\/p\/([a-zA-Z0-9]+)/gi;
  while ((m = shareRegex.exec(text)) !== null) {
    links.add(`https://www.facebook.com/share/p/${m[1]}/`);
  }

  // Pattern C: permalink.php?story_fbid=...&id=...
  const permalinkRegex = /(?:https?:\/\/(?:www\.)?facebook\.com)?\/permalink\.php\?story_fbid=([a-zA-Z0-9_]+)&(?:amp;)?id=(\d+)/gi;
  while ((m = permalinkRegex.exec(text)) !== null) {
    links.add(`https://www.facebook.com/permalink.php?story_fbid=${m[1]}&id=${m[2]}`);
  }

  // Pattern D: /{username}/posts/{numeric_id}
  const numPostRegex = /(?:https?:\/\/(?:www\.)?facebook\.com)?\/([a-zA-Z0-9\._\-]+)\/posts\/(\d{8,25})/gi;
  while ((m = numPostRegex.exec(text)) !== null) {
    links.add(`https://www.facebook.com/${m[1]}/posts/${m[2]}`);
  }

  return Array.from(links);
}
export function parseGraphApiItem(item, defaultType = 'comments', targetUid = '') {
  const time = item.created_time ? new Date(item.created_time).getTime() : Date.now();
  const year = new Date(time).getFullYear();
  const postUrl = buildFacebookPostUrl(item.id);
  const authorName = (item.from && item.from.name) ? item.from.name : 'Bài viết trên Facebook';

  return {
    id: item.id || `${targetUid}_${defaultType}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    targetUid: targetUid,
    type: defaultType,
    year: year,
    timestamp: time,
    postUrl: postUrl,
    authorName: authorName,
    content: (item.from && item.from.name) ? `Đăng bởi: ${item.from.name}` : 'Nội dung bài viết trên Facebook',
    commentText: item.message || '',
    cursor: item.cursor || ''
  };
}

/**
 * Trích xuất username hoặc ID từ URL Facebook
 */
export function parseFacebookUrl(input) {
  if (!input) return null;
  const str = input.trim();

  // Nếu nhập trực tiếp UID dạng số (10-20 chữ số)
  if (/^\d{6,20}$/.test(str)) {
    return { type: 'uid', value: str };
  }

  try {
    let urlStr = str;
    if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
      urlStr = 'https://' + urlStr;
    }
    const url = new URL(urlStr);

    // Dạng facebook.com/profile.php?id=1000123456789
    const idParam = url.searchParams.get('id');
    if (idParam && /^\d+$/.test(idParam)) {
      return { type: 'uid', value: idParam };
    }

    // Dạng facebook.com/people/Ten-Nguoi-Dung/1000123456789/
    const peopleMatch = url.pathname.match(/\/people\/[^\/]+\/(\d+)/);
    if (peopleMatch && peopleMatch[1]) {
      return { type: 'uid', value: peopleMatch[1] };
    }

    // Dạng facebook.com/username
    const pathParts = url.pathname.split('/').filter(p => p && p !== 'profile.php');
    if (pathParts.length > 0) {
      const username = pathParts[0];
      // Loại trừ các đường dẫn mặc định của FB
      const exclude = ['watch', 'groups', 'marketplace', 'events', 'gaming', 'saved', 'messages', 'friends', 'search'];
      if (!exclude.includes(username.toLowerCase())) {
        return { type: 'username', value: username };
      }
    }
  } catch (e) {
    console.warn('[Parser] Lỗi parse URL:', e);
  }

  return null;
}

/**
 * Định dạng Timestamp thành ngày tháng năm dễ đọc
 */
export function formatTimestamp(ts) {
  if (!ts) return 'Không rõ';
  const date = new Date(ts);
  if (isNaN(date.getTime())) return 'Không rõ';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');

  return `${hours}:${mins} - ${day}/${month}/${year}`;
}

/**
 * Xuất dữ liệu ra file JSON
 */
export function exportToJSON(profile, activities) {
  const data = {
    profile,
    exportedAt: new Date().toISOString(),
    totalActivities: activities.length,
    activities
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `FB_Scanner_${profile.uid}_${Date.now()}.json`);
}

/**
 * Xuất dữ liệu ra file CSV
 */
export function exportToCSV(profile, activities) {
  const headers = ['ID', 'Loại hoạt động', 'Năm', 'Thời gian', 'Người đăng', 'Link bài viết', 'Nội dung bài viết', 'Nội dung bình luận / Tương tác'];
  const rows = activities.map(a => [
    `"${a.id || ''}"`,
    `"${a.type || ''}"`,
    `"${a.year || ''}"`,
    `"${formatTimestamp(a.timestamp)}"`,
    `"${(a.authorName || '').replace(/"/g, '""')}"`,
    `"${a.postUrl || ''}"`,
    `"${(a.content || '').replace(/"/g, '""')}"`,
    `"${(a.commentText || a.snippet || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `FB_Scanner_${profile.uid}_${Date.now()}.csv`);
}

/**
 * Xuất dữ liệu ra Báo cáo HTML Offline tương tác
 */
export function exportToHTMLReport(profile, tree, counts) {
  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Báo cáo hoạt động FB - ${profile.name || profile.uid}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; max-width: 900px; margin: 0 auto; line-height: 1.6; }
    h1, h2, h3 { margin: 0; }
    .header { background: #1e293b; padding: 20px; border-radius: 12px; margin-bottom: 20px; display: flex; gap: 16px; align-items: center; border: 1px solid rgba(255,255,255,0.1); }
    .avatar { width: 64px; height: 64px; border-radius: 50%; border: 2px solid #2563eb; object-fit: cover; }
    .stats-bar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .stat-box { background: #1e293b; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid rgba(255,255,255,0.08); }
    .stat-val { font-size: 18px; font-weight: bold; color: #38bdf8; }
    .branch { background: #1e293b; border-radius: 10px; margin-bottom: 14px; border: 1px solid rgba(255,255,255,0.08); overflow: hidden; }
    .branch-title { padding: 12px 16px; background: #334155; font-weight: bold; font-size: 14px; }
    .card { background: #0f172a; border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 12px; margin: 8px 16px; }
    .card-meta { font-size: 11px; color: #94a3b8; margin-bottom: 6px; }
    .card-content { font-size: 13px; color: #e2e8f0; }
    .comment-box { background: rgba(37,99,235,0.15); border-left: 3px solid #2563eb; padding: 8px 10px; border-radius: 4px; margin-top: 6px; }
    a { color: #38bdf8; text-decoration: none; font-size: 12px; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="header">
    <img class="avatar" src="${profile.avatarUrl || 'https://via.placeholder.com/64'}" alt="Avatar">
    <div>
      <h2>${profile.name || 'Người dùng Facebook'}</h2>
      <p style="color: #94a3b8; font-size: 12px;">UID: ${profile.uid} | Xuất lúc: ${new Date().toLocaleString('vi-VN')}</p>
    </div>
  </div>

  <div class="stats-bar">
    <div class="stat-box"><div class="stat-val">${counts.comments}</div><div>Bình luận</div></div>
    <div class="stat-box"><div class="stat-val">${counts.tagged_posts}</div><div>Bài gắn thẻ</div></div>
    <div class="stat-box"><div class="stat-val">${counts.mentions}</div><div>Được nhắc tên</div></div>
    <div class="stat-box"><div class="stat-val">${counts.tagged_photos + counts.tagged_videos}</div><div>Ảnh / Video</div></div>
  </div>

  <div class="content">
    ${renderHTMLTree(tree)}
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  downloadBlob(blob, `FB_Report_${profile.uid}_${Date.now()}.html`);
}

function renderHTMLTree(tree) {
  const typeLabels = {
    author_posts: '📝 Bài viết đã đăng (Tác giả)',
    comments: '💬 Bình luận của người này',
    tagged_posts: '🏷️ Bài viết được gắn thẻ',
    mentions: '@ Được nhắc tên',
    tagged_photos: '📸 Ảnh được gắn thẻ',
    tagged_videos: '🎥 Video được gắn thẻ'
  };

  let html = '';
  for (const [type, years] of Object.entries(tree)) {
    const yearKeys = Object.keys(years).sort((a, b) => b.localeCompare(a));
    if (yearKeys.length === 0) continue;

    html += `<div class="branch"><div class="branch-title">${typeLabels[type] || type}</div>`;
    for (const yr of yearKeys) {
      html += `<div style="padding: 6px 16px; color: #38bdf8; font-weight: bold; font-size: 12px;">📅 Năm ${yr} (${years[yr].length})</div>`;
      for (const item of years[yr]) {
        html += `<div class="card">
          <div class="card-meta">📅 ${formatTimestamp(item.timestamp)} | Người đăng: <strong>${item.authorName || 'Không rõ'}</strong></div>
          ${item.content ? `<div class="card-content">${item.content}</div>` : ''}
          ${item.commentText ? `<div class="comment-box"><div style="font-size: 10px; color: #38bdf8; font-weight: bold;">BÌNH LUẬN:</div>${item.commentText}</div>` : ''}
          ${item.postUrl ? `<div style="margin-top: 6px;"><a href="${item.postUrl}" target="_blank">🔗 Mở bài viết gốc</a></div>` : ''}
        </div>`;
      }
    }
    html += `</div>`;
  }
  return html;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
