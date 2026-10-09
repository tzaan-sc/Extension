// OmniLoader - Offscreen Processing Worker
// Xử lý tải luồng m3u8, ghép video và tách âm thanh MP3/WAV từ Video

import { audioBufferToWav } from './audio_encoder.js';

class HLSDownloader {
  constructor(m3u8Url, filename, onProgress) {
    this.m3u8Url = m3u8Url;
    this.filename = filename || 'video_stream.mp4';
    this.onProgress = onProgress;
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
      throw new Error('Không tìm thấy đoạn video nào trong file m3u8.');
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
    downloadBlob(mergedBlob, this.filename.endsWith('.mp4') ? this.filename : `${this.filename}.mp4`);
  }
}

// Hàm tách âm thanh từ bất kỳ file Video nào
async function extractAudioFromVideo(videoUrl, filename) {
  const resp = await fetch(videoUrl);
  if (!resp.ok) throw new Error(`Không thể tải video: HTTP ${resp.status}`);
  const arrayBuffer = await resp.arrayBuffer();

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const audioBlob = audioBufferToWav(audioBuffer);
  const audioFilename = (filename || 'audio_extracted')
    .replace(/\.[^/.]+$/, "") + '.mp3';

  downloadBlob(audioBlob, audioFilename);
}

function downloadBlob(blob, filename) {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(blobUrl);
  }, 15000);
}

// Lắng nghe lệnh từ Background
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
        chrome.runtime.sendMessage({ action: 'HLS_DOWNLOAD_COMPLETE', downloadId });
      })
      .catch((err) => {
        chrome.runtime.sendMessage({ action: 'HLS_DOWNLOAD_ERROR', downloadId, error: err.message });
      });

    sendResponse({ started: true });
    return true;
  }

  if (message.action === 'OFFSCREEN_EXTRACT_AUDIO') {
    const { url, filename } = message.payload;
    extractAudioFromVideo(url, filename)
      .then(() => {
        chrome.runtime.sendMessage({ action: 'AUDIO_EXTRACT_COMPLETE' });
      })
      .catch((err) => {
        chrome.runtime.sendMessage({ action: 'AUDIO_EXTRACT_ERROR', error: err.message });
      });

    sendResponse({ started: true });
    return true;
  }
});
