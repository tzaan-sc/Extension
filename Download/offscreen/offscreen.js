// OmniLoader - Offscreen Processing Worker
// Xử lý tải luồng m3u8, ghép các chunk .ts và đóng gói PDF tài liệu

class HLSDownloader {
  constructor(m3u8Url, filename, onProgress) {
    this.m3u8Url = m3u8Url;
    this.filename = filename || 'video_stream.mp4';
    this.onProgress = onProgress;
    this.isCancelled = false;
  }

  // Phân tích file m3u8
  async parseM3U8() {
    const res = await fetch(this.m3u8Url);
    const text = await res.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    let segmentUrls = [];
    const baseUrl = this.m3u8Url.substring(0, this.m3u8Url.lastIndexOf('/') + 1);

    // Kiểm tra Master Playlist (chọn luồng có bitrate/resolution cao nhất)
    let isMaster = false;
    let highestBandwidth = 0;
    let highestUrl = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('#EXT-X-STREAM-INF')) {
        isMaster = true;
        const bwMatch = line.match(/BANDWIDTH=(\d+)/);
        const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
        const nextLine = lines[i + 1];
        if (bandwidth >= highestBandwidth && nextLine && !nextLine.startsWith('#')) {
          highestBandwidth = bandwidth;
          highestUrl = nextLine.startsWith('http') ? nextLine : new URL(nextLine, baseUrl).href;
        }
      }
    }

    // Nếu là Master Playlist, gọi đệ quy tải playlist con
    if (isMaster && highestUrl) {
      this.m3u8Url = highestUrl;
      return this.parseM3U8();
    }

    // Thu thập danh sách các Segment (.ts)
    for (const line of lines) {
      if (!line.startsWith('#')) {
        const segUrl = line.startsWith('http') ? line : new URL(line, baseUrl).href;
        segmentUrls.push(segUrl);
      }
    }

    return segmentUrls;
  }

  // Tải đồng thời các segment theo luồng (Concurrent Batching)
  async downloadAndMerge() {
    const segments = await this.parseM3U8();
    if (segments.length === 0) {
      throw new Error('Không tìm thấy đoạn video (segment) nào trong file m3u8.');
    }

    const total = segments.length;
    const downloadedChunks = new Array(total);
    let completed = 0;
    const concurrency = 6; // 6 luồng tải song song

    let index = 0;
    const downloadWorker = async () => {
      while (index < total && !this.isCancelled) {
        const currentIndex = index++;
        const url = segments[currentIndex];

        let retries = 3;
        let success = false;
        while (retries > 0 && !success && !this.isCancelled) {
          try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const buffer = await resp.arrayBuffer();
            downloadedChunks[currentIndex] = new Uint8Array(buffer);
            completed++;
            success = true;

            if (this.onProgress) {
              this.onProgress({
                completed,
                total,
                percent: Math.round((completed / total) * 100)
              });
            }
          } catch (e) {
            retries--;
            if (retries === 0) {
              console.error(`Lỗi tải segment ${currentIndex}:`, e);
              // Tạo empty buffer để không làm đứt đoạn
              downloadedChunks[currentIndex] = new Uint8Array(0);
            } else {
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }
      }
    };

    // Khởi chạy worker pool
    const workers = [];
    for (let i = 0; i < Math.min(concurrency, total); i++) {
      workers.push(downloadWorker());
    }
    await Promise.all(workers);

    if (this.isCancelled) return;

    // Ghép các mảng Uint8Array lại thành 1 Blob lớn
    const mergedBlob = new Blob(downloadedChunks, { type: 'video/mp4' });
    const blobUrl = URL.createObjectURL(mergedBlob);

    // Kích hoạt tải về
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = this.filename.endsWith('.mp4') ? this.filename : `${this.filename}.mp4`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(blobUrl);
    }, 10000);
  }
}

// Lắng nghe lệnh từ Background / Popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'OFFSCREEN_START_HLS') {
    const { url, filename, downloadId } = message.payload;
    const downloader = new HLSDownloader(url, filename, (progress) => {
      chrome.runtime.sendMessage({
        action: 'HLS_PROGRESS_UPDATE',
        downloadId,
        progress
      });
    });

    downloader.downloadAndMerge()
      .then(() => {
        chrome.runtime.sendMessage({
          action: 'HLS_DOWNLOAD_COMPLETE',
          downloadId
        });
      })
      .catch((err) => {
        chrome.runtime.sendMessage({
          action: 'HLS_DOWNLOAD_ERROR',
          downloadId,
          error: err.message
        });
      });

    sendResponse({ started: true });
    return true;
  }
});
