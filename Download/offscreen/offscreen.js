// OmniLoader - Offscreen Processing Worker
// Tải luồng m3u8 và tách âm thanh MP3/WAV từ Video không bị chặn download

import { audioBufferToWav } from './audio_encoder.js';

// Chuyển Blob thành Data URL để gửi về Background tải qua chrome.downloads API
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// 1. Tách âm thanh từ file Video
async function extractAudioFromVideo(videoUrl, filename) {
  try {
    const resp = await fetch(videoUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const arrayBuffer = await resp.arrayBuffer();

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const wavBlob = audioBufferToWav(audioBuffer);
    const dataUrl = await blobToDataUrl(wavBlob);

    const safeFilename = (filename || 'audio_extracted')
      .replace(/\.[^/.]+$/, "") + '.mp3';

    // Gửi về Background để tải bằng chrome.downloads
    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_DIRECT',
      url: dataUrl,
      filename: safeFilename
    });

    chrome.runtime.sendMessage({ action: 'AUDIO_EXTRACT_COMPLETE' });
  } catch (err) {
    console.error('Lỗi tách âm thanh:', err);
    chrome.runtime.sendMessage({ action: 'AUDIO_EXTRACT_ERROR', error: err.message });
  }
}

// 2. Tải và ghép HLS m3u8
class HLSDownloader {
  constructor(m3u8Url, filename, downloadId) {
    this.m3u8Url = m3u8Url;
    this.filename = filename || 'video_stream.mp4';
    this.downloadId = downloadId;
    this.isCancelled = false;
  }

  async parseM3U8() {
    const res = await fetch(this.m3u8Url);
    const text = await res.text();
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    let segmentUrls = [];
    const baseUrl = this.m3u8Url.substring(0, this.m3u8Url.lastIndexOf('/') + 1);

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

    if (isMaster && highestUrl) {
      this.m3u8Url = highestUrl;
      return this.parseM3U8();
    }

    for (const line of lines) {
      if (!line.startsWith('#')) {
        const segUrl = line.startsWith('http') ? line : new URL(line, baseUrl).href;
        segmentUrls.push(segUrl);
      }
    }

    return segmentUrls;
  }

  async downloadAndMerge() {
    const segments = await this.parseM3U8();
    if (segments.length === 0) {
      throw new Error('Không tìm thấy đoạn video nào trong luồng.');
    }

    const total = segments.length;
    const downloadedChunks = new Array(total);
    let completed = 0;
    const concurrency = 6;

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

            chrome.runtime.sendMessage({
              action: 'HLS_PROGRESS_UPDATE',
              downloadId: this.downloadId,
              progress: {
                completed,
                total,
                percent: Math.round((completed / total) * 100)
              }
            });
          } catch (e) {
            retries--;
            if (retries === 0) {
              downloadedChunks[currentIndex] = new Uint8Array(0);
            } else {
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }
      }
    };

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, total); i++) {
      workers.push(downloadWorker());
    }
    await Promise.all(workers);

    if (this.isCancelled) return;

    const mergedBlob = new Blob(downloadedChunks, { type: 'video/mp4' });
    const dataUrl = await blobToDataUrl(mergedBlob);

    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_DIRECT',
      url: dataUrl,
      filename: this.filename.endsWith('.mp4') ? this.filename : `${this.filename}.mp4`
    });

    chrome.runtime.sendMessage({ action: 'HLS_DOWNLOAD_COMPLETE', downloadId: this.downloadId });
  }
}

// 3. Tải qua Range Request Chunks (Chia nhỏ khối byte, tải song song, chống nghẽn & rớt mạng)
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

class RangeChunkDownloader {
  constructor(url, filename, downloadId, options = {}) {
    this.url = url;
    this.filename = filename || 'download_media.mp4';
    this.downloadId = downloadId;
    this.chunkSize = options.chunkSize || (5 * 1024 * 1024); // 5MB mỗi khối
    this.concurrency = options.concurrency || 3; // 3 luồng tải song song
    this.isCancelled = false;
    this.abortControllers = [];
    this.lastProgress = { percent: 0, loaded: 0, total: 0 };
  }

  async getTotalSize() {
    try {
      const controller = new AbortController();
      this.abortControllers.push(controller);
      const resp = await fetch(this.url, {
        method: 'GET',
        headers: { 'Range': 'bytes=0-0' },
        signal: controller.signal
      });

      if (resp.status === 206) {
        const range = resp.headers.get('content-range');
        const match = range ? range.match(/\/(\d+)/) : null;
        if (match) return parseInt(match[1], 10);
      }
      const len = resp.headers.get('content-length');
      if (len) return parseInt(len, 10);
    } catch (e) {
      console.warn('[RangeChunkDownloader] Lỗi lấy kích thước file:', e);
    }
    return 0;
  }

  async downloadAndAssemble() {
    const totalSize = await this.getTotalSize();

    // Nếu không lấy được dung lượng hoặc server không trả Range 206, fallback sang tải stream
    if (totalSize <= 0) {
      console.log('[RangeChunkDownloader] Server không hỗ trợ Range, chuyển sang tải stream trực tiếp...');
      return this.downloadDirectStream();
    }

    const chunkCount = Math.ceil(totalSize / this.chunkSize);
    const chunkBuffers = new Array(chunkCount);
    let loadedBytes = 0;
    const startTime = Date.now();

    const chunkRanges = [];
    for (let i = 0; i < chunkCount; i++) {
      const start = i * this.chunkSize;
      const end = Math.min((i + 1) * this.chunkSize - 1, totalSize - 1);
      chunkRanges.push({ index: i, start, end });
    }

    let currentIndex = 0;
    const worker = async () => {
      while (currentIndex < chunkRanges.length && !this.isCancelled) {
        const task = chunkRanges[currentIndex++];
        let retries = 3;
        let success = false;

        while (retries > 0 && !success && !this.isCancelled) {
          try {
            const controller = new AbortController();
            this.abortControllers.push(controller);

            const resp = await fetch(this.url, {
              headers: { 'Range': `bytes=${task.start}-${task.end}` },
              signal: controller.signal
            });

            if (!resp.ok && resp.status !== 206) {
              throw new Error(`HTTP ${resp.status}`);
            }

            const buffer = await resp.arrayBuffer();
            chunkBuffers[task.index] = new Uint8Array(buffer);
            loadedBytes += buffer.byteLength;
            success = true;

            const elapsedSec = (Date.now() - startTime) / 1000;
            const speedBytes = elapsedSec > 0 ? (loadedBytes / elapsedSec) : 0;
            const percent = Math.min(100, Math.round((loadedBytes / totalSize) * 100));

            this.lastProgress = {
              percent,
              loaded: loadedBytes,
              total: totalSize,
              loadedFormatted: formatBytes(loadedBytes),
              totalFormatted: formatBytes(totalSize),
              speedFormatted: `${formatBytes(speedBytes)}/s`,
              filename: this.filename
            };

            chrome.runtime.sendMessage({
              action: 'CHUNK_PROGRESS',
              downloadId: this.downloadId,
              progress: this.lastProgress
            });
          } catch (err) {
            retries--;
            if (retries === 0) {
              throw new Error(`Lỗi tải khối ${task.index} (${task.start}-${task.end}): ${err.message}`);
            }
            await new Promise(r => setTimeout(r, 600));
          }
        }
      }
    };

    const workers = [];
    for (let w = 0; w < Math.min(this.concurrency, chunkCount); w++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    if (this.isCancelled) return;

    // Ghép các mảng Uint8Array thành Blob
    const ext = (this.filename.split('.').pop() || 'mp4').toLowerCase();
    const mimeType = ext === 'mp3' ? 'audio/mpeg'
      : (ext === 'm4a' ? 'audio/mp4'
      : (ext === 'webm' || ext === 'weba' ? (ext === 'weba' ? 'audio/webm' : 'video/webm')
      : 'video/mp4'));

    const mergedBlob = new Blob(chunkBuffers, { type: mimeType });
    const blobUrl = URL.createObjectURL(mergedBlob);

    // Bắt đầu lưu file qua chrome.downloads API
    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_DIRECT',
      url: blobUrl,
      filename: this.filename
    }, (res) => {
      if (res && res.success) {
        chrome.runtime.sendMessage({
          action: 'CHUNK_COMPLETE',
          downloadId: this.downloadId,
          downloadIdChrome: res.downloadId,
          filename: this.filename
        });
      } else {
        chrome.runtime.sendMessage({
          action: 'CHUNK_ERROR',
          downloadId: this.downloadId,
          error: res?.error || 'Lỗi lưu file tải về'
        });
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 180000); // 3 phút giải phóng RAM
    });
  }

  // Fallback: Tải tuần tự qua ReadableStream khi server không hỗ trợ Range
  async downloadDirectStream() {
    const controller = new AbortController();
    this.abortControllers.push(controller);

    const resp = await fetch(this.url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const total = parseInt(resp.headers.get('content-length') || '0', 10);
    const reader = resp.body.getReader();
    const chunks = [];
    let loaded = 0;

    while (!this.isCancelled) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;

      if (total > 0) {
        const percent = Math.min(100, Math.round((loaded / total) * 100));
        this.lastProgress = {
          percent,
          loaded,
          total,
          loadedFormatted: formatBytes(loaded),
          totalFormatted: formatBytes(total),
          filename: this.filename
        };
        chrome.runtime.sendMessage({
          action: 'CHUNK_PROGRESS',
          downloadId: this.downloadId,
          progress: this.lastProgress
        });
      }
    }

    if (this.isCancelled) return;

    const ext = (this.filename.split('.').pop() || 'mp4').toLowerCase();
    const mimeType = ext === 'mp3' ? 'audio/mpeg' : (ext === 'm4a' ? 'audio/mp4' : 'video/mp4');
    const blob = new Blob(chunks, { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_DIRECT',
      url: blobUrl,
      filename: this.filename
    }, () => {
      chrome.runtime.sendMessage({
        action: 'CHUNK_COMPLETE',
        downloadId: this.downloadId,
        filename: this.filename
      });
      setTimeout(() => URL.revokeObjectURL(blobUrl), 180000);
    });
  }

  cancel() {
    this.isCancelled = true;
    this.abortControllers.forEach(c => {
      try { c.abort(); } catch (e) {}
    });
    chrome.runtime.sendMessage({
      action: 'CHUNK_CANCELLED',
      downloadId: this.downloadId
    });
  }
}

const activeChunkDownloads = new Map();

// Lắng nghe lệnh từ Background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'OFFSCREEN_START_HLS') {
    const { url, filename, downloadId } = message.payload;
    const downloader = new HLSDownloader(url, filename, downloadId);
    downloader.downloadAndMerge().catch((err) => {
      chrome.runtime.sendMessage({ action: 'HLS_DOWNLOAD_ERROR', downloadId, error: err.message });
    });
    sendResponse({ started: true });
    return true;
  }

  if (message.action === 'OFFSCREEN_EXTRACT_AUDIO') {
    const { url, filename } = message.payload;
    extractAudioFromVideo(url, filename);
    sendResponse({ started: true });
    return true;
  }

  if (message.action === 'OFFSCREEN_START_CHUNK') {
    const { url, filename, downloadId, options } = message.payload;
    const downloader = new RangeChunkDownloader(url, filename, downloadId, options);
    activeChunkDownloads.set(downloadId, downloader);

    downloader.downloadAndAssemble().catch((err) => {
      chrome.runtime.sendMessage({ action: 'CHUNK_ERROR', downloadId, error: err.message });
    }).finally(() => {
      activeChunkDownloads.delete(downloadId);
    });

    sendResponse({ started: true });
    return true;
  }

  if (message.action === 'OFFSCREEN_CANCEL_CHUNK') {
    const { downloadId } = message.payload;
    if (activeChunkDownloads.has(downloadId)) {
      activeChunkDownloads.get(downloadId).cancel();
      activeChunkDownloads.delete(downloadId);
    }
    sendResponse({ cancelled: true });
    return true;
  }

  if (message.action === 'OFFSCREEN_GET_ACTIVE_CHUNKS') {
    const list = [];
    for (const [id, d] of activeChunkDownloads.entries()) {
      list.push({ downloadId: id, filename: d.filename, progress: d.lastProgress });
    }
    sendResponse({ activeDownloads: list });
    return true;
  }
});
