// Lens OCR Engine - Hỗ trợ Tesseract.js (Offline) + API Ngoại (Google Vision / Gemini / OCR.Space)
class LensOCREngine {
  constructor() {
    this.tesseractWorker = null;
    this.workerLoading = false;
  }

  // Lấy cài đặt cấu hình từ chrome.storage
  async getConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get({
        ocrEngine: 'tesseract', // 'tesseract' | 'google_vision' | 'gemini' | 'ocr_space'
        tesseractLang: 'vie+eng', // 'vie+eng' | 'eng' | 'vie' | 'chi_sim' | 'jpn'
        googleApiKey: '',
        geminiApiKey: '',
        ocrSpaceApiKey: ''
      }, (data) => resolve(data));
    });
  }

  // Khởi tạo hoặc lấy Tesseract Worker
  async getTesseractWorker(lang = 'vie+eng', onProgress = null) {
    if (this.tesseractWorker && this.currentLang === lang) {
      return this.tesseractWorker;
    }

    if (window.Tesseract) {
      const workerPath = chrome.runtime.getURL('libs/worker.min.js');
      // Tạo worker với ngôn ngữ đã chọn
      const worker = await window.Tesseract.createWorker(lang, 1, {
        workerPath: workerPath,
        logger: (m) => {
          if (onProgress && m.status && m.progress !== undefined) {
            onProgress(m.status, m.progress);
          }
        }
      });
      this.tesseractWorker = worker;
      this.currentLang = lang;
      return worker;
    }
    throw new Error('Tesseract.js thư viện chưa được nạp.');
  }

  // Hàm nhận diện tổng quát
  async recognize(dataUrl, onProgress = null) {
    const config = await this.getConfig();

    if (config.ocrEngine === 'google_vision' && config.googleApiKey) {
      if (onProgress) onProgress('Đang gửi Google Vision API...', 0.5);
      return await this.recognizeGoogleVision(dataUrl, config.googleApiKey);
    } else if (config.ocrEngine === 'gemini' && config.geminiApiKey) {
      if (onProgress) onProgress('Đang gửi Gemini AI API...', 0.5);
      return await this.recognizeGemini(dataUrl, config.geminiApiKey);
    } else if (config.ocrEngine === 'ocr_space' && config.ocrSpaceApiKey) {
      if (onProgress) onProgress('Đang gửi OCR.Space API...', 0.5);
      return await this.recognizeOCRSpace(dataUrl, config.ocrSpaceApiKey);
    }

    // Mặc định hoặc Offline: Tesseract.js
    return await this.recognizeTesseract(dataUrl, config.tesseractLang || 'vie+eng', onProgress);
  }

  // Nhận diện qua Tesseract.js
  async recognizeTesseract(dataUrl, lang, onProgress) {
    const worker = await this.getTesseractWorker(lang, onProgress);
    const result = await worker.recognize(dataUrl);
    
    const words = [];
    const fullText = result.data.text || '';

    // Chuẩn hóa danh sách word với bbox chuẩn
    if (result.data.words && result.data.words.length > 0) {
      result.data.words.forEach(w => {
        if (!w.text || !w.text.trim()) return;
        words.push({
          text: w.text.trim(),
          confidence: w.confidence,
          bbox: {
            x0: w.bbox.x0,
            y0: w.bbox.y0,
            x1: w.bbox.x1,
            y1: w.bbox.y1
          }
        });
      });
    } else if (result.data.lines && result.data.lines.length > 0) {
      result.data.lines.forEach(l => {
        if (!l.text || !l.text.trim()) return;
        words.push({
          text: l.text.trim(),
          confidence: l.confidence,
          bbox: {
            x0: l.bbox.x0,
            y0: l.bbox.y0,
            x1: l.bbox.x1,
            y1: l.bbox.y1
          }
        });
      });
    }

    return {
      text: fullText,
      words: words,
      engine: 'Tesseract.js (' + lang + ')'
    };
  }

  // Nhận diện qua Google Cloud Vision API
  async recognizeGoogleVision(dataUrl, apiKey) {
    const base64Content = dataUrl.split(',')[1];
    const endpoint = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64Content },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
          }
        ]
      })
    });

    const json = await response.json();
    if (json.error) {
      throw new Error(`Google Vision Error: ${json.error.message}`);
    }

    const annotation = json.responses?.[0]?.fullTextAnnotation;
    if (!annotation) {
      return { text: '', words: [], engine: 'Google Vision API' };
    }

    const fullText = annotation.text || '';
    const words = [];

    // Duyệt blocks -> paragraphs -> words
    annotation.pages?.forEach(page => {
      page.blocks?.forEach(block => {
        block.paragraphs?.forEach(para => {
          para.words?.forEach(w => {
            const wordText = w.symbols?.map(s => s.text).join('') || '';
            const vertices = w.boundingBox?.vertices || [];
            if (vertices.length >= 4 && wordText.trim()) {
              const xs = vertices.map(v => v.x || 0);
              const ys = vertices.map(v => v.y || 0);
              words.push({
                text: wordText.trim(),
                bbox: {
                  x0: Math.min(...xs),
                  y0: Math.min(...ys),
                  x1: Math.max(...xs),
                  y1: Math.max(...ys)
                }
              });
            }
          });
        });
      });
    });

    return {
      text: fullText,
      words: words,
      engine: 'Google Vision Cloud'
    };
  }

  // Nhận diện qua Gemini API
  async recognizeGemini(dataUrl, apiKey) {
    const base64Content = dataUrl.split(',')[1];
    const mimeMatch = dataUrl.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const prompt = "Hãy đọc và trích xuất tất cả chữ/văn bản xuất hiện trong bức ảnh này, giữ nguyên định dạng, bố cục và ngôn ngữ. Chỉ trả về nội dung văn bản trích xuất được mà không giải thích hay thêm lời dẫn.";

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Content
                }
              }
            ]
          }
        ]
      })
    });

    const json = await response.json();
    if (json.error) {
      throw new Error(`Gemini API Error: ${json.error.message}`);
    }

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
      text: text.trim(),
      words: [],
      engine: 'Gemini 1.5 Flash'
    };
  }

  // Nhận diện qua OCR.Space API
  async recognizeOCRSpace(dataUrl, apiKey) {
    const formData = new FormData();
    formData.append('base64Image', dataUrl);
    formData.append('language', 'vie');
    formData.append('isOverlayRequired', 'true');
    formData.append('apikey', apiKey);

    const response = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      body: formData
    });

    const json = await response.json();
    if (json.IsErroredOnProcessing) {
      throw new Error(`OCR.Space Error: ${json.ErrorMessage?.join(', ') || 'Unknown'}`);
    }

    const parsedResult = json.ParsedResults?.[0];
    const fullText = parsedResult?.ParsedText || '';
    const words = [];

    if (parsedResult?.TextOverlay?.Lines) {
      parsedResult.TextOverlay.Lines.forEach(l => {
        l.Words?.forEach(w => {
          words.push({
            text: w.WordText,
            bbox: {
              x0: w.Left,
              y0: w.Top,
              x1: w.Left + w.Width,
              y1: w.Top + w.Height
            }
          });
        });
      });
    }

    return {
      text: fullText,
      words: words,
      engine: 'OCR.Space'
    };
  }
}

window.LensOCREngine = LensOCREngine;
