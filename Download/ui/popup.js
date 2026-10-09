// OmniLoader - Popup UI Controller (Hoàn thiện & Ổn định tuyệt đối 100%)

function convertTimedTextToSrt(xmlText) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const textNodes = xmlDoc.getElementsByTagName('text');
    if (!textNodes || textNodes.length === 0) return xmlText;

    let srtOutput = '';
    for (let i = 0; i < textNodes.length; i++) {
      const node = textNodes[i];
      const startSec = parseFloat(node.getAttribute('start') || '0');
      const durationSec = parseFloat(node.getAttribute('dur') || '2');
      const endSec = startSec + durationSec;

      const txt = document.createElement('textarea');
      txt.innerHTML = node.textContent || '';
      const cleanText = txt.value;

      const pad = (n, len = 2) => String(n).padStart(len, '0');
      const formatTime = (total) => {
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = Math.floor(total % 60);
        const ms = Math.floor((total % 1) * 1000);
        return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
      };

      srtOutput += `${i + 1}\n${formatTime(startSec)} --> ${formatTime(endSec)}\n${cleanText.trim()}\n\n`;
    }
    return srtOutput;
  } catch (e) {
    return xmlText;
  }
}

function createPdfFromImages(images) {
  if (!images || images.length === 0) return null;

  let pdfContent = '%PDF-1.4\n';
  const objectOffsets = [];

  function addLine(str) { pdfContent += str + '\n'; }
  function markObject(objNum) {
    objectOffsets[objNum] = pdfContent.length;
    addLine(`${objNum} 0 obj`);
  }

  markObject(1);
  addLine('<< /Type /Catalog /Pages 2 0 R >>');
  addLine('endobj');

  const totalPages = images.length;
  const pageObjectRefs = [];
  for (let i = 0; i < totalPages; i++) {
    pageObjectRefs.push(`${3 + i * 3} 0 R`);
  }

  markObject(2);
  addLine(`<< /Type /Pages /Kids [${pageObjectRefs.join(' ')}] /Count ${totalPages} >>`);
  addLine('endobj');

  for (let i = 0; i < totalPages; i++) {
    const img = images[i];
    const pageObjNum = 3 + i * 3;
    const contentObjNum = pageObjNum + 1;
    const imageObjNum = pageObjNum + 2;

    const pageWidth = img.width || 600;
    const pageHeight = img.height || 750;

    markObject(pageObjNum);
    addLine(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObjNum} 0 R /Resources << /XObject << /Im${i + 1} ${imageObjNum} 0 R >> >> >>`);
    addLine('endobj');

    const streamContent = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${i + 1} Do\nQ`;
    markObject(contentObjNum);
    addLine(`<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`);
    addLine('endobj');

    const base64Data = img.dataUrl.split(',')[1];
    const rawBinary = atob(base64Data);

    markObject(imageObjNum);
    addLine(`<< /Type /XObject /Subtype /Image /Width ${img.width || 600} /Height ${img.height || 750} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${rawBinary.length} >>\nstream`);
    pdfContent += rawBinary + '\nendstream\nendobj\n';
  }

  const startXref = pdfContent.length;
  addLine('xref');
  addLine(`0 ${3 + totalPages * 3}`);
  addLine('0000000000 65535 f ');

  for (let i = 1; i < 3 + totalPages * 3; i++) {
    const offset = String(objectOffsets[i] || 0).padStart(10, '0');
    addLine(`${offset} 00000 n `);
  }

  addLine('trailer');
  addLine(`<< /Size ${3 + totalPages * 3} /Root 1 0 R >>`);
  addLine('startxref');
  addLine(String(startXref));
  addLine('%%EOF');

  const buffer = new Uint8Array(pdfContent.length);
  for (let i = 0; i < pdfContent.length; i++) {
    buffer[i] = pdfContent.charCodeAt(i) & 0xff;
  }
  return new Blob([buffer], { type: 'application/pdf' });
}

function detectVipDocPlatform(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes('scribd.com/document') || u.includes('scribd.com/doc') || u.includes('scribd.com/presentation')) {
    return { name: 'Scribd Document', getUrl: (target) => `https://downscribd.com/?url=${encodeURIComponent(target)}` };
  }
  if (u.includes('studocu.com') && (u.includes('/document/') || u.includes('/vn/document/'))) {
    return { name: 'Studocu Document', getUrl: (target) => `https://studocudownloader.com/?url=${encodeURIComponent(target)}` };
  }
  if (u.includes('slideshare.net/')) {
    return { name: 'SlideShare Presentation', getUrl: (target) => `https://docdownloader.com/?slideshare=${encodeURIComponent(target)}` };
  }
  if (u.includes('issuu.com/')) {
    return { name: 'Issuu Publication', getUrl: (target) => `https://docdownloader.com/?issuu=${encodeURIComponent(target)}` };
  }
  if (u.includes('academia.edu/')) {
    return { name: 'Academia Research', getUrl: (target) => `https://docdownloader.com/?academia=${encodeURIComponent(target)}` };
  }
  if (u.includes('coursehero.com/file/')) {
    return { name: 'CourseHero Document', getUrl: (target) => `https://chdl.site/?url=${encodeURIComponent(target)}` };
  }
  return null;
}

document.addEventListener('DOMContentLoaded', async () => {
  let currentTab = null;
  let allMedia = [];
  let currentCategory = 'all';

  const mediaContainer = document.getElementById('mediaContainer');
  const emptyState = document.getElementById('emptyState');
  const pageTitleElem = document.getElementById('pageTitle');
  const tabButtons = document.querySelectorAll('.tab-btn');
  const btnRefresh = document.getElementById('btnRefresh');

  try {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tabs && tabs.length > 0) {
      currentTab = tabs[0];
      pageTitleElem.textContent = currentTab.title || currentTab.url;
      pageTitleElem.title = currentTab.title || currentTab.url;
      await ensureContentScript(currentTab.id);
    }
  } catch (e) {}

  async function ensureContentScript(tabId) {
    if (!currentTab || currentTab.url?.startsWith('chrome://') || currentTab.url?.startsWith('edge://')) return;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content/content.js']
      }).catch(() => {});
    } catch (e) {}
  }

  function loadMedia() {
    if (!currentTab) return;
    chrome.runtime.sendMessage({ action: 'GET_MEDIA', tabId: currentTab.id }, (res) => {
      if (res && res.success) {
        allMedia = res.data || [];
        updateCounts();
        renderMedia();
      }
    });
  }

  function updateCounts() {
    const counts = {
      all: allMedia.length,
      audio: allMedia.filter(m => m.category === 'audio').length,
      video: allMedia.filter(m => m.category === 'video').length,
      document: allMedia.filter(m => m.category === 'document' || m.type === 'subtitle' || m.type === 'canvas_pdf').length,
    };
    document.getElementById('countAll').textContent = counts.all;
    document.getElementById('countAudio').textContent = counts.audio;
    document.getElementById('countVideo').textContent = counts.video;
    document.getElementById('countDoc').textContent = counts.document;
  }

  function groupYouTubeMedia(items) {
    const ytGroups = new Map();
    const otherItems = [];

    items.forEach((item) => {
      if (item.source === 'youtube' && item.title) {
        const key = item.title;
        if (!ytGroups.has(key)) {
          ytGroups.set(key, {
            id: item.id,
            isYouTube: true,
            title: item.title,
            thumbnail: item.thumbnail,
            videos: [],
            audios: [],
            subtitles: []
          });
        }

        const group = ytGroups.get(key);
        if (item.type === 'subtitle') {
          if (!group.subtitles.some(s => s.quality === item.quality)) {
            group.subtitles.push(item);
          }
        } else if (item.category === 'audio') {
          if (!group.audios.some(a => a.quality === item.quality)) {
            group.audios.push(item);
          }
        } else {
          if (!group.videos.some(v => v.resolution === item.resolution)) {
            group.videos.push(item);
          }
        }
      } else {
        otherItems.push(item);
      }
    });

    for (const group of ytGroups.values()) {
      group.videos.sort((a, b) => (parseInt(b.resolution, 10) || 0) - (parseInt(a.resolution, 10) || 0));
    }

    return [...Array.from(ytGroups.values()), ...otherItems];
  }

  // Quét chuyên sâu toàn bộ trang (Auto-scroll & Thu thập cả Canvas + Ảnh nhiều trang)
  async function triggerExportPdf(btnElement) {
    if (!currentTab) return;
    const oldText = btnElement ? btnElement.innerHTML : '';
    if (btnElement) btnElement.innerHTML = `<span>⏳ Đang cuộn nạp tất cả trang...</span>`;

    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: async () => {
          // 1. Tự động cuộn trang để kích hoạt Lazy Load đầy đủ tất cả các trang
          const totalScroll = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 2000);
          const step = Math.max(window.innerHeight * 0.8, 400);
          let currentY = 0;

          while (currentY < totalScroll) {
            window.scrollTo(0, currentY);
            currentY += step;
            await new Promise(r => setTimeout(r, 180));
          }
          window.scrollTo(0, 0);
          await new Promise(r => setTimeout(r, 300));

          const pages = [];
          const seen = new Set();

          // 2. Thu thập thẻ Canvas (Scribd, Studocu, PDF.js, Canva...)
          const canvases = document.querySelectorAll('canvas');
          canvases.forEach((c, idx) => {
            if (c.width > 120 && c.height > 120) {
              try {
                const dataUrl = c.toDataURL('image/jpeg', 0.95);
                if (!seen.has(dataUrl)) {
                  seen.add(dataUrl);
                  pages.push({ pageNumber: idx + 1, width: c.width, height: c.height, dataUrl });
                }
              } catch (err) {}
            }
          });

          // 3. Nếu không có Canvas, quét ảnh tài liệu nhiều trang (.page img, SlideShare...)
          if (pages.length === 0) {
            const pageImgs = document.querySelectorAll('.page img, .page-container img, .doc-page img, img[class*="page"], img[id*="page"], .slide img');
            for (let i = 0; i < pageImgs.length; i++) {
              const img = pageImgs[i];
              const w = img.naturalWidth || img.width;
              const h = img.naturalHeight || img.height;
              if (w > 200 && h > 200) {
                try {
                  const offCanvas = document.createElement('canvas');
                  offCanvas.width = w;
                  offCanvas.height = h;
                  const ctx = offCanvas.getContext('2d');
                  ctx.drawImage(img, 0, 0, w, h);
                  const dataUrl = offCanvas.toDataURL('image/jpeg', 0.95);
                  if (!seen.has(dataUrl)) {
                    seen.add(dataUrl);
                    pages.push({ pageNumber: i + 1, width: w, height: h, dataUrl });
                  }
                } catch (e) {}
              }
            }
          }

          return { pages, title: document.title };
        }
      });

      const res = results && results[0] ? results[0].result : null;
      if (res && res.pages && res.pages.length > 0) {
        if (btnElement) btnElement.innerHTML = `<span>⏳ Đang đóng gói PDF (${res.pages.length} trang)...</span>`;
        const pdfBlob = createPdfFromImages(res.pages);
        const reader = new FileReader();
        reader.onloadend = () => {
          const cleanTitle = (res.title || 'Tai_Lieu').replace(/[\\/:*?"<>|]/g, '_').trim();
          chrome.runtime.sendMessage({
            action: 'DOWNLOAD_DIRECT',
            url: reader.result,
            filename: `${cleanTitle}.pdf`
          }, () => {
            if (btnElement) {
              btnElement.innerHTML = `<span>✓ Đã tải PDF (${res.pages.length} trang)!</span>`;
              setTimeout(() => { btnElement.innerHTML = oldText; }, 3000);
            }
          });
        };
        reader.readAsDataURL(pdfBlob);
      } else {
        if (btnElement) {
          btnElement.innerHTML = `<span>Không tìm thấy trang tài liệu</span>`;
          setTimeout(() => { btnElement.innerHTML = oldText; }, 3000);
        }
      }
    } catch (err) {
      if (btnElement) {
        btnElement.innerHTML = `<span>Lỗi xuất PDF</span>`;
        setTimeout(() => { btnElement.innerHTML = oldText; }, 3000);
      }
    }
  }

  // Render Danh Sách Hoàn Toàn Tách Biệt Theo Tab
  function renderMedia() {
    mediaContainer.innerHTML = '';
    let renderedCount = 0;

    // 1. GIAO DIỆN CHUYÊN BIỆT CHO TAB TÀI LIỆU (DOCUMENTS)
    if (currentCategory === 'document') {
      // A. Khung dán Link / Tải VIP Document
      const vipInputSection = document.createElement('div');
      vipInputSection.className = 'doc-vip-box';
      vipInputSection.innerHTML = `
        <div class="vip-box-header">
          <span class="badge badge-doc">⚡ CỔNG TẢI TÀI LIỆU VIP</span>
          <span class="vip-subtext">Scribd • Studocu • SlideShare • Issuu • CourseHero</span>
        </div>
        <div class="vip-input-row">
          <input type="text" id="inputVipUrl" class="vip-input" placeholder="Dán link tài liệu vào đây...">
          <button id="btnVipResolve" class="btn-download btn-vip-go"><span>Tải Full VIP</span></button>
        </div>
      `;

      const inputVipUrl = vipInputSection.querySelector('#inputVipUrl');
      const btnVipResolve = vipInputSection.querySelector('#btnVipResolve');

      if (currentTab && currentTab.url && detectVipDocPlatform(currentTab.url)) {
        inputVipUrl.value = currentTab.url;
      }

      btnVipResolve.addEventListener('click', () => {
        const targetUrl = (inputVipUrl.value || currentTab?.url || '').trim();
        if (!targetUrl) {
          alert('Vui lòng dán link tài liệu cần tải!');
          return;
        }
        const vip = detectVipDocPlatform(targetUrl);
        if (vip) {
          window.open(vip.getUrl(targetUrl), '_blank');
        } else {
          // Mặc định kết nối cổng trung gian DocDownloader
          window.open(`https://docdownloader.com/?url=${encodeURIComponent(targetUrl)}`, '_blank');
        }
      });

      mediaContainer.appendChild(vipInputSection);

      // B. Thanh công cụ xử lý trên trang hiện tại
      const docToolbar = document.createElement('div');
      docToolbar.className = 'doc-toolbar';
      docToolbar.innerHTML = `
        <button id="btnUnblurDoc" class="tool-btn highlight" title="Xóa bỏ lớp mờ, gỡ bỏ thông báo chặn nạp tài liệu">
          <span>🔓 Mở Mờ & Tải Full</span>
        </button>
        <button id="btnScanCanvas" class="tool-btn" title="Tự động cuộn nạp & gom toàn bộ trang thành 1 file PDF chuẩn">
          <span>📄 Xuất File PDF</span>
        </button>
        <button id="btnPrintDoc" class="tool-btn" title="Lưu toàn bộ giao diện trang web thành tài liệu PDF">
          <span>🖨️ Lưu Trang Web</span>
        </button>
      `;

      // Nút Mở mờ & Tải Full
      docToolbar.querySelector('#btnUnblurDoc').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const oldText = btn.innerHTML;
        btn.innerHTML = `<span>⏳ Đang gỡ bỏ che mờ...</span>`;
        try {
          await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: () => {
              document.querySelectorAll('*').forEach(el => {
                const s = window.getComputedStyle(el);
                if (s.filter && s.filter.includes('blur')) {
                  el.style.setProperty('filter', 'none', 'important');
                }
                if (s.userSelect === 'none') {
                  el.style.setProperty('user-select', 'text', 'important');
                }
                if (s.pointerEvents === 'none') {
                  el.style.setProperty('pointer-events', 'auto', 'important');
                }
              });
              document.querySelectorAll('[class*="paywall"], [class*="overlay"], [class*="modal-backdrop"], [class*="blur-overlay"], [id*="paywall"]').forEach(p => {
                p.style.setProperty('display', 'none', 'important');
              });
              document.body.style.setProperty('overflow', 'auto', 'important');
              document.documentElement.style.setProperty('overflow', 'auto', 'important');
            }
          });
          btn.innerHTML = `<span>✓ Đã mở mờ!</span>`;
          setTimeout(() => {
            btn.innerHTML = oldText;
            triggerExportPdf(docToolbar.querySelector('#btnScanCanvas'));
          }, 800);
        } catch (err) {
          btn.innerHTML = `<span>Lỗi mở mờ</span>`;
          setTimeout(() => { btn.innerHTML = oldText; }, 2000);
        }
      });

      // Nút Xuất PDF Canvas
      docToolbar.querySelector('#btnScanCanvas').addEventListener('click', (e) => {
        triggerExportPdf(e.currentTarget);
      });

      // Nút In / Lưu trang web thành PDF
      docToolbar.querySelector('#btnPrintDoc').addEventListener('click', async () => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: () => { window.print(); }
          });
        } catch (e) {}
      });

      mediaContainer.appendChild(docToolbar);
      renderedCount++;
    }

    const displayList = groupYouTubeMedia(allMedia);

    displayList.forEach((item) => {
      // A. YouTube Item
      if (item.isYouTube) {
        const showVideo = (currentCategory === 'all' || currentCategory === 'video') && item.videos.length > 0;
        const showAudio = (currentCategory === 'all' || currentCategory === 'audio') && item.audios.length > 0;
        const showSub = (currentCategory === 'all' || currentCategory === 'document') && item.subtitles.length > 0;

        if (!showVideo && !showAudio && !showSub) return;
        renderedCount++;

        const card = document.createElement('div');
        card.className = 'yt-master-card';

        let videoOptions = item.videos.map((v, i) => `<option value="v_${i}">${v.quality || v.resolution} (.mp4)</option>`).join('');
        let audioOptions = item.audios.map((a, i) => `<option value="a_${i}">${a.quality} (.mp3)</option>`).join('');
        let subOptions = item.subtitles.map((s, i) => `<option value="s_${i}">${s.quality} (.srt)</option>`).join('');

        card.innerHTML = `
          <div class="media-info">
            <div class="media-thumb">${item.thumbnail ? `<img src="${item.thumbnail}">` : getFallbackIcon('video')}</div>
            <div class="media-details">
              <span class="media-title" title="${item.title}">${item.title}</span>
              <div class="media-tags">
                <span class="badge badge-video">YOUTUBE</span>
                ${item.videos.length > 0 ? `<span class="badge badge-video">${item.videos.length} VIDEO</span>` : ''}
                ${item.audios.length > 0 ? `<span class="badge badge-audio">${item.audios.length} AUDIO</span>` : ''}
                ${item.subtitles.length > 0 ? `<span class="badge badge-doc">${item.subtitles.length} PHỤ ĐỀ</span>` : ''}
              </div>
            </div>
          </div>

          ${showVideo ? `
            <div class="format-section">
              <div class="section-title"><span>ĐỘ PHÂN GIẢI VIDEO (.mp4)</span></div>
              <div class="format-row">
                <select class="res-select sel-video">${videoOptions}</select>
                <button class="btn-download btn-dl-video"><span>Tải Video</span></button>
              </div>
            </div>
          ` : ''}

          ${showAudio ? `
            <div class="format-section">
              <div class="section-title"><span>ÂM THANH (.mp3)</span></div>
              <div class="format-row">
                <select class="res-select sel-audio">${audioOptions}</select>
                <button class="btn-download btn-dl-audio"><span>Tải MP3</span></button>
              </div>
            </div>
          ` : ''}

          ${showSub ? `
            <div class="format-section">
              <div class="section-title"><span>PHỤ ĐỀ (.srt)</span></div>
              <div class="format-row">
                <select class="res-select sel-sub">${subOptions}</select>
                <button class="btn-download btn-dl-sub"><span>Tải Phụ Đề</span></button>
              </div>
            </div>
          ` : ''}
        `;

        const btnDlVid = card.querySelector('.btn-dl-video');
        if (btnDlVid) {
          btnDlVid.addEventListener('click', () => {
            const idx = parseInt(card.querySelector('.sel-video').value.replace('v_', ''), 10);
            executeSecureDownload(item.videos[idx], btnDlVid);
          });
        }

        const btnDlAud = card.querySelector('.btn-dl-audio');
        if (btnDlAud) {
          btnDlAud.addEventListener('click', () => {
            const idx = parseInt(card.querySelector('.sel-audio').value.replace('a_', ''), 10);
            executeSecureDownload(item.audios[idx], btnDlAud);
          });
        }

        const btnDlSub = card.querySelector('.btn-dl-sub');
        if (btnDlSub) {
          btnDlSub.addEventListener('click', async () => {
            const idx = parseInt(card.querySelector('.sel-sub').value.replace('s_', ''), 10);
            downloadSubtitleAsSrt(item.subtitles[idx], btnDlSub);
          });
        }

        mediaContainer.appendChild(card);
        return;
      }

      // B. Media thông thường (Audio / Video / Canvas PDF / Document)
      if (currentCategory !== 'all' && item.category !== currentCategory) return;
      renderedCount++;

      const card = document.createElement('div');
      card.className = 'media-card';

      const isCanvasPdf = item.type === 'canvas_pdf';
      const isAudio = item.category === 'audio';
      const isVideo = item.category === 'video';
      const isHls = item.type === 'hls';
      const badgeClass = isAudio ? 'badge-audio' : (isHls ? 'badge-hls' : (isVideo ? 'badge-video' : 'badge-doc'));

      card.innerHTML = `
        <div class="media-info">
          <div class="media-thumb">${isAudio ? getAudioIcon() : (isCanvasPdf ? getFallbackIcon('document') : (item.thumbnail ? `<img src="${item.thumbnail}">` : getFallbackIcon(item.category)))}</div>
          <div class="media-details">
            <span class="media-title" title="${item.filename || item.title}">${item.filename || item.title || 'Media file'}</span>
            <div class="media-tags">
              <span class="badge ${badgeClass}">${item.quality || item.format || item.ext}</span>
              <span class="media-size">${item.sizeFormatted || 'Tối ưu'}</span>
            </div>
          </div>
        </div>

        ${isAudio ? `
          <div class="audio-player-preview">
            <audio controls preload="none" src="${item.url}"></audio>
          </div>
        ` : ''}

        <div class="card-actions">
          <button class="btn-download btn-dl-normal" data-id="${item.id}">
            <span>${isCanvasPdf ? 'Xuất File PDF' : `Tải ${isAudio ? 'MP3' : (isHls ? 'MP4 (HLS)' : (item.ext ? item.ext.toUpperCase() : 'File'))}`}</span>
          </button>
          <button class="btn-copy" data-url="${item.url}" title="Sao chép link"><span>Copy</span></button>
        </div>
      `;

      const btnDlNormal = card.querySelector('.btn-dl-normal');
      btnDlNormal.addEventListener('click', () => {
        if (isCanvasPdf) {
          triggerExportPdf(btnDlNormal);
        } else {
          executeSecureDownload(item, btnDlNormal);
        }
      });

      card.querySelector('.btn-copy').addEventListener('click', (e) => {
        navigator.clipboard.writeText(item.url);
        const btn = e.currentTarget;
        btn.innerHTML = `<span>✓ Đã chép!</span>`;
        setTimeout(() => { btn.innerHTML = `<span>Copy</span>`; }, 1500);
      });

      mediaContainer.appendChild(card);
    });

    if (renderedCount === 0 && currentCategory !== 'document') {
      mediaContainer.appendChild(emptyState);
      emptyState.style.display = 'flex';
    }
  }

  async function executeSecureDownload(item, btnElement) {
    if (!item || !item.url) return;
    if (btnElement) {
      btnElement.disabled = true;
      btnElement.innerHTML = `<span>⏳ Đang tải...</span>`;
    }

    try {
      const resp = await fetch(item.url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const blob = await resp.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_DIRECT',
          url: reader.result,
          filename: item.filename || `media_${Date.now()}.${item.ext || 'mp4'}`
        }, () => {
          if (btnElement) {
            btnElement.innerHTML = `<span>✓ Đã tải!</span>`;
            setTimeout(() => {
              btnElement.disabled = false;
              btnElement.innerHTML = `<span>Tải về</span>`;
            }, 2000);
          }
        });
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_DIRECT',
        url: item.url,
        filename: item.filename || `media_${Date.now()}.${item.ext || 'mp4'}`
      }, () => {
        if (btnElement) {
          btnElement.disabled = false;
          btnElement.innerHTML = `<span>Tải về</span>`;
        }
      });
    }
  }

  async function downloadSubtitleAsSrt(subItem, btnElement) {
    if (btnElement) btnElement.innerHTML = `<span>⏳ Đang lấy...</span>`;
    try {
      const resp = await fetch(subItem.url);
      const text = await resp.text();
      const srtContent = convertTimedTextToSrt(text);

      const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
      const reader = new FileReader();
      reader.onloadend = () => {
        chrome.runtime.sendMessage({
          action: 'DOWNLOAD_DIRECT',
          url: reader.result,
          filename: subItem.filename || 'subtitles.srt'
        }, () => {
          if (btnElement) {
            btnElement.innerHTML = `<span>✓ Xong!</span>`;
            setTimeout(() => { btnElement.innerHTML = `<span>Tải Phụ Đề</span>`; }, 2000);
          }
        });
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      if (btnElement) btnElement.innerHTML = `<span>Lỗi</span>`;
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category;
      renderMedia();
    });
  });

  btnRefresh.addEventListener('click', () => {
    if (currentTab) {
      chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_DOM_NOW' });
    }
    loadMedia();
  });

  function getAudioIcon() {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
  }

  function getFallbackIcon(category) {
    if (category === 'video') {
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    } else {
      return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 2 2h12a2 2 0 0 2-2V8z"></path></svg>`;
    }
  }

  loadMedia();
  setInterval(loadMedia, 1500);
});
