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

function formatPdfFilename(title, fallback = 'Tai_Lieu') {
  let name = (title || fallback).trim();
  name = name.replace(/(\.pdf)+$/i, '').trim();
  name = name.replace(/[\x00-\x1f\x7f-\x9f\\/:*?"<>|]/g, '_').trim();
  name = name.replace(/[\s.]+$/, '').trim();
  if (!name) name = fallback;
  return `${name}.pdf`;
}

async function ensureJpegDataUrl(page) {
  if (page.dataUrl && page.dataUrl.startsWith('data:image/jpeg')) {
    return page;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth || page.width || 800;
      const h = img.naturalHeight || page.height || 1100;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      resolve({
        ...page,
        width: w,
        height: h,
        dataUrl: jpegDataUrl
      });
    };
    img.onerror = () => {
      resolve(page);
    };
    img.src = page.dataUrl || page.url;
  });
}

async function downloadFileDirectly(url, filename) {
  if (!url) return false;
  const safeFilename = formatPdfFilename(filename);

  if (url.startsWith('file:///')) {
    alert('Đây là tệp PDF cục bộ đã có sẵn trên máy tính của bạn.\nĐường dẫn: ' + decodeURIComponent(url.replace('file:///', '')));
    return true;
  }

  // Tầng 1: Thử Chrome Downloads API trực tiếp
  try {
    const downloadId = await new Promise((resolve) => {
      chrome.downloads.download({
        url: url,
        filename: safeFilename,
        saveAs: false
      }, (id) => {
        if (chrome.runtime.lastError || !id) resolve(null);
        else resolve(id);
      });
    });
    if (downloadId) return true;
  } catch (e) {}

  // Tầng 2: Thử fetch qua quyền mở rộng và tải qua Object URL
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const dlId = await new Promise((resolve) => {
        chrome.downloads.download({
          url: blobUrl,
          filename: safeFilename,
          saveAs: false
        }, (id) => {
          if (chrome.runtime.lastError || !id) resolve(null);
          else resolve(id);
        });
      });
      if (!dlId) {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = safeFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      return true;
    }
  } catch (e) {}

  // Tầng 3: Thẻ A dự phòng
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFilename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } catch (e) {
    return false;
  }
}

function detectVipDocPlatform(url) {
  if (!url) return null;
  const u = url.toLowerCase();

  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                     url.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
  if (driveMatch) {
    const fileId = driveMatch[1];
    return {
      name: 'Google Drive Document',
      type: 'googledrive',
      fileId: fileId,
      directUrl: `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
      getUrl: () => `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`
    };
  }

  const docsMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docsMatch) {
    const docId = docsMatch[1];
    return {
      name: 'Google Docs Document',
      type: 'googledocs',
      fileId: docId,
      directUrl: `https://docs.google.com/document/d/${docId}/export?format=pdf`,
      getUrl: () => `https://docs.google.com/document/d/${docId}/export?format=pdf`
    };
  }

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
  const btnHeaderRegionScan = document.getElementById('btnHeaderRegionScan');
  const btnQuickAreaScan = document.getElementById('btnQuickAreaScan');

  async function triggerRegionScan() {
    try {
      let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      }
      const targetTab = (tabs && tabs[0]) || currentTab;

      if (!targetTab || !targetTab.id) {
        alert('Không tìm thấy tab trình duyệt đang hoạt động.');
        return;
      }

      if (targetTab.url?.startsWith('chrome://') || targetTab.url?.startsWith('edge://') || targetTab.url?.startsWith('about:')) {
        alert('Trình duyệt không cho phép chạy tiện ích trên trang cài đặt hệ thống (chrome:// hoặc edge://).\nVui lòng thử trên một bài viết hoặc trang web thông thường.');
        return;
      }

      // Nạp script chọn vùng trực tiếp
      await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        files: ['content/region_selector.js']
      });

      // Gọi hàm khởi động ngay trên trang
      await chrome.scripting.executeScript({
        target: { tabId: targetTab.id },
        func: () => {
          if (window.__omniStartRegionCapture) {
            window.__omniStartRegionCapture();
          }
        }
      });

      window.close();
    } catch (e) {
      console.error('Lỗi bật quét vùng:', e);
      if (e.message && e.message.includes('file://')) {
        alert('Để dùng trên file cục bộ (file:///), vui lòng vào chrome://extensions -> Chi tiết tiện ích -> Bật "Cho phép truy cập vào các URL tệp" (Allow access to file URLs).');
      } else {
        alert('Lỗi khởi động quét vùng: ' + (e.message || e));
      }
    }
  }

  if (btnHeaderRegionScan) {
    btnHeaderRegionScan.addEventListener('click', triggerRegionScan);
  }
  if (btnQuickAreaScan) {
    btnQuickAreaScan.addEventListener('click', triggerRegionScan);
  }

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
      let items = (res && res.success && res.data) ? res.data : [];

      // Tự động kiểm tra và bổ sung tài liệu nếu Tab hiện tại là file PDF hoặc Google Drive
      if (currentTab.url) {
        const u = currentTab.url;
        const lowerU = u.toLowerCase();
        const cleanU = lowerU.split('?')[0];
        const isPdf = cleanU.endsWith('.pdf') || lowerU.includes('.pdf?') || (lowerU.startsWith('file:///') && lowerU.endsWith('.pdf'));

        const driveMatch = u.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                           u.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
        const docsMatch = u.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);

        if (isPdf && !items.some(m => m.url === u || (m.ext === 'pdf' && m.source === 'tab_url'))) {
          items.unshift({
            id: `tab_direct_pdf_${currentTab.id}`,
            url: u,
            filename: formatPdfFilename(currentTab.title || 'Tai_Lieu'),
            title: currentTab.title || 'Tài liệu PDF gốc',
            type: 'document',
            category: 'document',
            ext: 'pdf',
            format: 'Tài liệu PDF (Tab hiện tại)',
            sizeFormatted: 'Trực tiếp',
            source: 'tab_url'
          });
        } else if (driveMatch && !items.some(m => m.source === 'google_drive')) {
          const fileId = driveMatch[1];
          items.unshift({
            id: `tab_gdrive_${fileId}`,
            url: `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`,
            filename: formatPdfFilename(currentTab.title || 'GoogleDrive_File'),
            title: currentTab.title || 'Tài liệu Google Drive',
            type: 'document',
            category: 'document',
            ext: 'pdf',
            format: 'Google Drive Document (Gốc)',
            sizeFormatted: 'Google Drive',
            source: 'google_drive'
          });
        } else if (docsMatch && !items.some(m => m.source === 'google_drive')) {
          items.unshift({
            id: `tab_gdocs_${docsMatch[1]}`,
            url: `https://docs.google.com/document/d/${docsMatch[1]}/export?format=pdf`,
            filename: formatPdfFilename(currentTab.title || 'GoogleDoc'),
            title: currentTab.title || 'Google Docs',
            type: 'document',
            category: 'document',
            ext: 'pdf',
            format: 'Google Docs (Xuất PDF)',
            sizeFormatted: 'Google Docs',
            source: 'google_drive'
          });
        }
      }

      allMedia = items;
      updateCounts();
      renderMedia();
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

  // Quét chuyên sâu toàn bộ trang (Auto-scroll container/window & Thu thập cả Canvas + Ảnh blob + Drive)
  async function triggerExportPdf(btnElement) {
    if (!currentTab) return;
    const oldText = btnElement ? btnElement.innerHTML : '';
    if (btnElement) btnElement.innerHTML = `<span>⏳ Đang cuộn nạp tất cả trang...</span>`;

    try {
      // Thực thi trên tất cả frames để hỗ trợ cả iframe viewer của Google Drive / PDF
      const results = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id, allFrames: true },
        func: async () => {
          const capturedPages = new Map();

          // 1. Tìm container cuộn chứa tài liệu
          const scrollableElements = [];
          const driveViewer = document.querySelector('.drive-viewer-scrollable, [role="main"], .ndfHFb-c4YZDc-bN97Pc, [data-target="viewer"], [role="document"]');
          if (driveViewer && driveViewer.scrollHeight > driveViewer.clientHeight + 80) {
            scrollableElements.push(driveViewer);
          }

          document.querySelectorAll('div, section, main, article').forEach(el => {
            const s = window.getComputedStyle(el);
            if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 120) {
              if (!scrollableElements.includes(el)) scrollableElements.push(el);
            }
          });

          const scroller = scrollableElements[0] || null;

          // 2. Hàm quét các trang hiện đang hiển thị trong DOM (In-Flight Capture)
          async function scanCurrentView() {
            const scrollOffset = scroller ? scroller.scrollTop : window.scrollY;

            // A. Quét Canvas (PDF.js, Scribd, Studocu, test_document.html...)
            const canvases = document.querySelectorAll('canvas');
            for (const c of canvases) {
              if (c.width > 120 && c.height > 120) {
                const rect = c.getBoundingClientRect();
                const topPos = Math.round(rect.top + scrollOffset);
                const key = `cv_${topPos}_${c.width}_${c.height}`;
                if (!capturedPages.has(key)) {
                  try {
                    const dataUrl = c.toDataURL('image/jpeg', 0.92);
                    capturedPages.set(key, {
                      top: topPos,
                      width: c.width,
                      height: c.height,
                      dataUrl: dataUrl
                    });
                  } catch (e) {}
                }
              }
            }

            // B. Quét Ảnh (Google Drive blob images, CDN images, SlideShare...)
            const allImgs = Array.from(document.querySelectorAll('img')).filter(img => {
              const src = img.currentSrc || img.src || '';
              if (!src || src.startsWith('data:image/svg')) return false;
              const isDoc = src.startsWith('blob:') ||
                            src.includes('googleusercontent.com') ||
                            src.includes('drive.google.com') ||
                            src.includes('slidesharecdn') ||
                            src.includes('studocu') ||
                            src.includes('scribd') ||
                            img.closest('.page, .page-container, .drive-viewer, .doc-page, [data-page-index], [role="region"]');
              const w = img.naturalWidth || img.width || 0;
              const h = img.naturalHeight || img.height || 0;
              return (isDoc || (w > 250 && h > 250)) && w > 120 && h > 120;
            });

            for (const img of allImgs) {
              const src = img.currentSrc || img.src || '';
              const rect = img.getBoundingClientRect();
              const topPos = Math.round(rect.top + scrollOffset);
              const w = img.naturalWidth || img.width || 600;
              const h = img.naturalHeight || img.height || 850;
              const key = `im_${topPos}_${w}_${h}`;

              if (!capturedPages.has(key)) {
                let dataUrl = null;

                // Nếu là blob URL: fetch cùng origin và đọc qua FileReader (100% không bị chặn hoặc taint canvas)
                if (src.startsWith('blob:')) {
                  try {
                    const resp = await fetch(src);
                    if (resp.ok) {
                      const b = await resp.blob();
                      dataUrl = await new Promise((res) => {
                        const fr = new FileReader();
                        fr.onloadend = () => res(fr.result);
                        fr.readAsDataURL(b);
                      });
                    }
                  } catch (e) {}
                }

                // Nếu chưa có dataUrl, thử vẽ lên canvas
                if (!dataUrl) {
                  try {
                    const offCanvas = document.createElement('canvas');
                    offCanvas.width = w;
                    offCanvas.height = h;
                    const ctx = offCanvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, w, h);
                    ctx.drawImage(img, 0, 0, w, h);
                    dataUrl = offCanvas.toDataURL('image/jpeg', 0.92);
                  } catch (e) {
                    // Nếu bị tainted do cross-origin, ta lưu link src để popup tải ngoài
                  }
                }

                capturedPages.set(key, {
                  top: topPos,
                  width: w,
                  height: h,
                  dataUrl: dataUrl,
                  url: dataUrl ? null : src
                });
              }
            }
          }

          // 3. Quét ngay vị trí hiện tại
          await scanCurrentView();

          // 4. Cuộn từ từ từ trên xuống dưới và quét tại TỪNG BƯỚC (trước khi DOM bị unmount)
          const totalHeight = scroller ? scroller.scrollHeight : Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 2500);
          const viewportH = scroller ? scroller.clientHeight : window.innerHeight;
          const step = Math.max(Math.round(viewportH * 0.75), 400);

          let currentY = 0;
          while (currentY < totalHeight) {
            currentY += step;
            if (scroller) {
              scroller.scrollTop = currentY;
              scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
            }
            window.scrollTo(0, currentY);
            window.dispatchEvent(new Event('scroll', { bubbles: true }));

            await new Promise(r => setTimeout(r, 200));
            await scanCurrentView();
          }

          // Đợi thêm và quét lần cuối ở chân trang
          await new Promise(r => setTimeout(r, 250));
          await scanCurrentView();

          // 5. Sắp xếp danh sách trang theo toạ độ dọc từ trên xuống dưới
          const rawPages = Array.from(capturedPages.values());
          rawPages.sort((a, b) => a.top - b.top);

          // Loại bỏ các ảnh trùng lặp có toạ độ quá sát nhau (dưới 50px)
          const finalPages = [];
          for (const p of rawPages) {
            const exists = finalPages.some(ex => Math.abs(ex.top - p.top) < 50);
            if (!exists) {
              finalPages.push(p);
            }
          }

          return { pages: finalPages, title: document.title };
        }
      });

      // Lấy kết quả từ frame thu thập được nhiều trang nhất
      let bestResult = null;
      if (results && results.length > 0) {
        for (const r of results) {
          if (r && r.result && r.result.pages && r.result.pages.length > 0) {
            if (!bestResult || r.result.pages.length > bestResult.pages.length) {
              bestResult = r.result;
            }
          }
        }
      }

      if (bestResult && bestResult.pages && bestResult.pages.length > 0) {
        if (btnElement) btnElement.innerHTML = `<span>⏳ Đang xử lý ${bestResult.pages.length} trang...</span>`;

        // Chuẩn hóa và chuyển đổi tất cả trang thành JPEG chất lượng cao
        const preparedPages = [];
        for (const p of bestResult.pages) {
          if (p.dataUrl) {
            const ready = await ensureJpegDataUrl(p);
            preparedPages.push(ready);
          } else if (p.url) {
            try {
              const resp = await fetch(p.url);
              if (resp.ok) {
                const b = await resp.blob();
                const dUrl = await new Promise((res) => {
                  const fr = new FileReader();
                  fr.onloadend = () => res(fr.result);
                  fr.readAsDataURL(b);
                });
                const ready = await ensureJpegDataUrl({ ...p, dataUrl: dUrl });
                preparedPages.push(ready);
              }
            } catch (err) {}
          }
        }

        if (preparedPages.length === 0) {
          if (btnElement) {
            btnElement.innerHTML = `<span>Không thể xuất trang</span>`;
            setTimeout(() => { btnElement.innerHTML = oldText; }, 2500);
          }
          return;
        }

        if (btnElement) btnElement.innerHTML = `<span>⏳ Đang đóng gói PDF (${preparedPages.length} trang)...</span>`;
        const pdfBlob = createPdfFromImages(preparedPages);
        if (!pdfBlob) {
          if (btnElement) {
            btnElement.innerHTML = `<span>Lỗi tạo PDF</span>`;
            setTimeout(() => { btnElement.innerHTML = oldText; }, 2500);
          }
          return;
        }

        const safeFilename = formatPdfFilename(bestResult.title || currentTab.title || 'Tai_Lieu');
        const blobUrl = URL.createObjectURL(pdfBlob);

        chrome.downloads.download({
          url: blobUrl,
          filename: safeFilename,
          saveAs: false
        }, (downloadId) => {
          if (chrome.runtime.lastError || !downloadId) {
            // Dự phòng: Click qua thẻ A trong popup
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = safeFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }

          if (btnElement) {
            btnElement.innerHTML = `<span>✓ Đã tải PDF (${preparedPages.length} trang)!</span>`;
            setTimeout(() => { btnElement.innerHTML = oldText; }, 3500);
          }
          setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
        });
      } else {
        if (btnElement) {
          btnElement.innerHTML = `<span>Không tìm thấy trang tài liệu</span>`;
          setTimeout(() => { btnElement.innerHTML = oldText; }, 3000);
        }
      }
    } catch (err) {
      if (btnElement) {
        btnElement.innerHTML = `<span>Lỗi xuất PDF: ${err.message || 'Thử lại'}</span>`;
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
      const isCurrentDrive = currentTab?.url && (currentTab.url.includes('drive.google.com') || currentTab.url.includes('docs.google.com'));
      const isCurrentPdf = currentTab?.url && (currentTab.url.toLowerCase().split('?')[0].endsWith('.pdf') || currentTab.url.toLowerCase().includes('.pdf?') || (currentTab.url.startsWith('file:///') && currentTab.url.toLowerCase().endsWith('.pdf')));

      // A. Thẻ ngữ cảnh chính (Hero Card) nếu đang ở trang Google Drive hoặc Direct PDF
      if (isCurrentDrive) {
        const driveInfo = detectVipDocPlatform(currentTab.url);
        const gdriveCard = document.createElement('div');
        gdriveCard.className = 'doc-context-card gdrive';
        gdriveCard.innerHTML = `
          <div class="context-card-top">
            <span class="context-icon">📁</span>
            <div class="context-info">
              <span class="context-badge">GOOGLE DRIVE</span>
              <span class="context-title" title="${currentTab.title || 'Google Drive File'}">${currentTab.title || 'Tài liệu Google Drive'}</span>
            </div>
          </div>
          <div class="context-actions">
            ${driveInfo && driveInfo.directUrl ? `
              <button id="btnGdriveHeroDirect" class="btn-primary">
                <span>⚡ Tải File Gốc</span>
              </button>
            ` : ''}
            <button id="btnGdriveHeroBypass" class="btn-secondary">
              <span>🔓 Vượt Chặn Tải PDF</span>
            </button>
          </div>
        `;

        const btnDirect = gdriveCard.querySelector('#btnGdriveHeroDirect');
        if (btnDirect && driveInfo?.directUrl) {
          btnDirect.addEventListener('click', async () => {
            const oldText = btnDirect.innerHTML;
            btnDirect.disabled = true;
            btnDirect.innerHTML = `<span>⏳ Đang tải file gốc...</span>`;
            const ok = await downloadFileDirectly(driveInfo.directUrl, currentTab.title || 'GoogleDrive_File');
            if (ok) {
              btnDirect.innerHTML = `<span>✓ Đã tải file gốc!</span>`;
              setTimeout(() => { btnDirect.disabled = false; btnDirect.innerHTML = oldText; }, 2500);
            } else {
              // File bị chủ sở hữu chặn tải trực tiếp (View-only) -> Tự động chuyển sang quét & gom PDF
              btnDirect.innerHTML = `<span>🔒 File bị khóa -> Đang vượt chặn...</span>`;
              await triggerExportPdf(btnDirect);
              btnDirect.disabled = false;
              btnDirect.innerHTML = oldText;
            }
          });
        }

        const btnBypass = gdriveCard.querySelector('#btnGdriveHeroBypass');
        if (btnBypass) {
          btnBypass.addEventListener('click', () => {
            triggerExportPdf(btnBypass);
          });
        }

        mediaContainer.appendChild(gdriveCard);
        renderedCount++;
      } else if (isCurrentPdf) {
        const directPdfCard = document.createElement('div');
        directPdfCard.className = 'doc-context-card pdf';
        directPdfCard.innerHTML = `
          <div class="context-card-top">
            <span class="context-icon">📄</span>
            <div class="context-info">
              <span class="context-badge">TÀI LIỆU PDF</span>
              <span class="context-title" title="${currentTab.title || 'PDF Document'}">${currentTab.title || 'Tài liệu PDF'}</span>
            </div>
          </div>
          <div class="context-actions">
            <button id="btnDirectPdfDownload" class="btn-primary">
              <span>📥 Tải File PDF Về Máy</span>
            </button>
          </div>
        `;

        const btnPdf = directPdfCard.querySelector('#btnDirectPdfDownload');
        btnPdf.addEventListener('click', async () => {
          const oldText = btnPdf.innerHTML;
          btnPdf.disabled = true;
          btnPdf.innerHTML = `<span>⏳ Đang tải file PDF...</span>`;
          const ok = await downloadFileDirectly(currentTab.url, currentTab.title || 'Tai_Lieu');
          btnPdf.innerHTML = ok ? `<span>✓ Đã tải file PDF!</span>` : `<span>Lỗi tải</span>`;
          setTimeout(() => { btnPdf.disabled = false; btnPdf.innerHTML = oldText; }, 2500);
        });

        mediaContainer.appendChild(directPdfCard);
        renderedCount++;
      }

      // B. Thanh công cụ tiện ích xử lý trang tinh gọn (Quick Tools)
      const quickTools = document.createElement('div');
      quickTools.className = 'doc-quick-tools';
      quickTools.innerHTML = `
        <button id="btnUnblurDoc" class="tool-chip" title="Gỡ bỏ lớp mờ, mở khóa bài đọc bị che">
          <span>🔓 Mở mờ</span>
        </button>
        <button id="btnScanCanvas" class="tool-chip" title="Tự động cuộn nạp tất cả trang và xuất file PDF">
          <span>📄 Gom PDF</span>
        </button>
        <button id="btnPrintDoc" class="tool-chip" title="Lưu giao diện trang qua hộp thoại In">
          <span>🖨️ In trang</span>
        </button>
        <button id="btnToggleVip" class="tool-chip" title="Dán link từ Scribd, Studocu, Drive...">
          <span>🔗 Link VIP</span>
        </button>
      `;

      // C. Hộp nhập link VIP (Ẩn/Hiện linh hoạt, không chiếm diện tích)
      const vipBox = document.createElement('div');
      vipBox.className = 'vip-input-box';
      const isKnownVip = currentTab?.url && detectVipDocPlatform(currentTab.url);
      vipBox.style.display = isKnownVip ? 'flex' : 'none';
      vipBox.innerHTML = `
        <input type="text" id="inputVipUrl" class="vip-input" placeholder="Dán link Drive / Scribd / Studocu...">
        <button id="btnVipResolve" class="btn-vip-go">Tải VIP</button>
      `;

      const inputVipUrl = vipBox.querySelector('#inputVipUrl');
      const btnVipResolve = vipBox.querySelector('#btnVipResolve');
      if (currentTab && currentTab.url && isKnownVip) {
        inputVipUrl.value = currentTab.url;
      }

      quickTools.querySelector('#btnToggleVip').addEventListener('click', () => {
        vipBox.style.display = vipBox.style.display === 'none' ? 'flex' : 'none';
        if (vipBox.style.display === 'flex') inputVipUrl.focus();
      });

      btnVipResolve.addEventListener('click', async () => {
        const targetUrl = (inputVipUrl.value || currentTab?.url || '').trim();
        if (!targetUrl) {
          alert('Vui lòng dán link tài liệu cần tải!');
          return;
        }

        const oldBtnText = btnVipResolve.innerHTML;
        btnVipResolve.disabled = true;
        btnVipResolve.innerHTML = `⏳`;

        chrome.runtime.sendMessage({
          action: 'RESOLVE_VIP_DOC',
          url: targetUrl,
          tabId: currentTab ? currentTab.id : null
        }, async (res) => {
          if (res && res.success && res.downloadId) {
            btnVipResolve.innerHTML = `✓`;
            setTimeout(() => {
              btnVipResolve.disabled = false;
              btnVipResolve.innerHTML = oldBtnText;
            }, 3000);
          } else {
            btnVipResolve.innerHTML = `⏳`;
            await triggerExportPdf(btnVipResolve);
            btnVipResolve.disabled = false;
            btnVipResolve.innerHTML = oldBtnText;
          }
        });
      });

      // Mở mờ & Tải Full
      quickTools.querySelector('#btnUnblurDoc').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const oldText = btn.innerHTML;
        btn.innerHTML = `<span>⏳ Đang gỡ...</span>`;
        try {
          await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: () => {
              document.querySelectorAll('*').forEach(el => {
                const s = window.getComputedStyle(el);
                if (s.filter && s.filter.includes('blur')) el.style.setProperty('filter', 'none', 'important');
                if (s.userSelect === 'none') el.style.setProperty('user-select', 'text', 'important');
                if (s.pointerEvents === 'none') el.style.setProperty('pointer-events', 'auto', 'important');
              });
              document.querySelectorAll('[class*="paywall"], [class*="overlay"], [class*="modal-backdrop"], [class*="blur-overlay"], [id*="paywall"]').forEach(p => {
                p.style.setProperty('display', 'none', 'important');
              });
              document.body.style.setProperty('overflow', 'auto', 'important');
              document.documentElement.style.setProperty('overflow', 'auto', 'important');
            }
          });
          btn.innerHTML = `<span>✓ Đã gỡ!</span>`;
          setTimeout(() => {
            btn.innerHTML = oldText;
            triggerExportPdf(quickTools.querySelector('#btnScanCanvas'));
          }, 800);
        } catch (err) {
          btn.innerHTML = `<span>Lỗi</span>`;
          setTimeout(() => { btn.innerHTML = oldText; }, 2000);
        }
      });

      // Gom trang PDF
      quickTools.querySelector('#btnScanCanvas').addEventListener('click', (e) => {
        triggerExportPdf(e.currentTarget);
      });

      // In trang
      quickTools.querySelector('#btnPrintDoc').addEventListener('click', async () => {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            func: () => { window.print(); }
          });
        } catch (e) {}
      });

      mediaContainer.appendChild(quickTools);
      mediaContainer.appendChild(vipBox);
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

    const onFinish = (success) => {
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerHTML = success ? `<span>✓ Đã tải!</span>` : `<span>Lỗi tải</span>`;
        setTimeout(() => {
          btnElement.innerHTML = `<span>Tải về</span>`;
        }, 2000);
      }
    };

    // Đối với tài liệu PDF hoặc file từ Google Drive: Tải bằng bộ điều phối 4 tầng
    if (item.category === 'document' || item.ext === 'pdf' || item.source === 'google_drive') {
      const ok = await downloadFileDirectly(item.url, item.filename || `Tai_Lieu_${Date.now()}.${item.ext || 'pdf'}`);
      onFinish(ok);
      return;
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
        }, (res) => {
          onFinish(res && res.success);
        });
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_DIRECT',
        url: item.url,
        filename: item.filename || `media_${Date.now()}.${item.ext || 'mp4'}`
      }, (res) => {
        onFinish(res && res.success);
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
