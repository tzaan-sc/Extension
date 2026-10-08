/**
 * Universal YouTube Subtitle Parser
 * Handles JSON3, XML (<p t="" d="">), XML (<text start="" dur="">), and WebVTT
 */

const SubtitleParser = {
  // Decode HTML entities
  decodeHtml(html) {
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    return txt.value;
  },

  // Clean and normalize subtitle text
  cleanText(text) {
    if (!text) return '';
    return this.decodeHtml(text)
      .replace(/<[^>]*>/g, '') // remove any residual tags
      .replace(/[\n\r]+/g, ' ') // replace newlines with space
      .replace(/\s+/g, ' ') // collapse multiple spaces
      .trim();
  },

  // Parse JSON3 format
  parseJson3(raw) {
    try {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!data || !data.events || !Array.isArray(data.events)) return null;

      const segments = [];
      data.events.forEach((ev) => {
        if (!ev.segs || !Array.isArray(ev.segs)) return;
        const text = ev.segs
          .map(s => s.utf8 || '')
          .join('');
        const cleaned = this.cleanText(text);
        if (!cleaned || cleaned === '\n') return;

        const start = (ev.tStartMs || 0) / 1000;
        const dur = (ev.dDurationMs || 0) / 1000;
        segments.push({
          id: segments.length,
          start: parseFloat(start.toFixed(2)),
          end: parseFloat((start + dur).toFixed(2)),
          duration: parseFloat(dur.toFixed(2)),
          text: cleaned
        });
      });

      return segments.length > 0 ? segments : null;
    } catch (e) {
      return null;
    }
  },

  // Parse HTML/XML DOM format (<p t="" d=""> or <text start="" dur="">)
  parseDom(raw) {
    try {
      // Use text/html to avoid XML parsererror on HTML entities
      const parser = new DOMParser();
      const doc = parser.parseFromString(raw, 'text/html');

      // 1. Check <p t="1234" d="5678">
      const pNodes = doc.querySelectorAll('p[t]');
      if (pNodes.length > 0) {
        const segments = [];
        pNodes.forEach((node) => {
          const t = parseFloat(node.getAttribute('t') || '0');
          const d = parseFloat(node.getAttribute('d') || '0');
          const start = t / 1000;
          const dur = d / 1000;
          const text = this.cleanText(node.textContent);

          if (text) {
            segments.push({
              id: segments.length,
              start: parseFloat(start.toFixed(2)),
              end: parseFloat((start + dur).toFixed(2)),
              duration: parseFloat(dur.toFixed(2)),
              text: text
            });
          }
        });
        if (segments.length > 0) return segments;
      }

      // 2. Check <text start="1.23" dur="4.56">
      const textNodes = doc.querySelectorAll('text[start]');
      if (textNodes.length > 0) {
        const segments = [];
        textNodes.forEach((node) => {
          const start = parseFloat(node.getAttribute('start') || '0');
          const dur = parseFloat(node.getAttribute('dur') || '0');
          const text = this.cleanText(node.textContent);

          if (text) {
            segments.push({
              id: segments.length,
              start: parseFloat(start.toFixed(2)),
              end: parseFloat((start + dur).toFixed(2)),
              duration: parseFloat(dur.toFixed(2)),
              text: text
            });
          }
        });
        if (segments.length > 0) return segments;
      }

      // 3. Fallback: all <p> or <text> elements
      const anyNodes = doc.querySelectorAll('p, text');
      if (anyNodes.length > 0) {
        const segments = [];
        anyNodes.forEach((node) => {
          const start = parseFloat(node.getAttribute('start') || (node.getAttribute('t') ? parseFloat(node.getAttribute('t')) / 1000 : 0));
          const dur = parseFloat(node.getAttribute('dur') || (node.getAttribute('d') ? parseFloat(node.getAttribute('d')) / 1000 : 0));
          const text = this.cleanText(node.textContent);

          if (text) {
            segments.push({
              id: segments.length,
              start: parseFloat(start.toFixed(2)),
              end: parseFloat((start + dur).toFixed(2)),
              duration: parseFloat(dur.toFixed(2)),
              text: text
            });
          }
        });
        if (segments.length > 0) return segments;
      }

      return null;
    } catch (e) {
      console.warn('[SubtitleParser] DOM parse error:', e);
      return null;
    }
  },

  // Parse WebVTT format
  parseVtt(raw) {
    if (typeof raw !== 'string' || !raw.includes('-->')) return null;

    try {
      const lines = raw.split(/\r?\n/);
      const segments = [];
      let currentStart = null;
      let currentEnd = null;
      let currentText = [];

      function timeToSeconds(timeStr) {
        const parts = timeStr.trim().split(':');
        if (parts.length === 3) {
          return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2].replace(',', '.'));
        } else if (parts.length === 2) {
          return parseFloat(parts[0]) * 60 + parseFloat(parts[1].replace(',', '.'));
        }
        return 0;
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.includes('-->')) {
          if (currentStart !== null && currentText.length > 0) {
            const txt = SubtitleParser.cleanText(currentText.join(' '));
            if (txt) {
              segments.push({
                id: segments.length,
                start: currentStart,
                end: currentEnd,
                duration: parseFloat((currentEnd - currentStart).toFixed(2)),
                text: txt
              });
            }
          }

          const times = line.split('-->');
          currentStart = parseFloat(timeToSeconds(times[0]).toFixed(2));
          currentEnd = parseFloat(timeToSeconds(times[1].split(' ')[0]).toFixed(2));
          currentText = [];
        } else if (line && !/^\d+$/.test(line) && !line.startsWith('WEBVTT') && !line.startsWith('NOTE')) {
          currentText.push(line);
        }
      }

      if (currentStart !== null && currentText.length > 0) {
        const txt = SubtitleParser.cleanText(currentText.join(' '));
        if (txt) {
          segments.push({
            id: segments.length,
            start: currentStart,
            end: currentEnd,
            duration: parseFloat((currentEnd - currentStart).toFixed(2)),
            text: txt
          });
        }
      }

      return segments.length > 0 ? segments : null;
    } catch (e) {
      return null;
    }
  },

  // Main entry point
  parse(raw) {
    if (!raw) return [];

    // 1. Try JSON3
    const jsonResult = this.parseJson3(raw);
    if (jsonResult && jsonResult.length > 0) return jsonResult;

    // 2. Try DOM (HTML/XML)
    const domResult = this.parseDom(raw);
    if (domResult && domResult.length > 0) return domResult;

    // 3. Try VTT
    const vttResult = this.parseVtt(raw);
    if (vttResult && vttResult.length > 0) return vttResult;

    return [];
  }
};

if (typeof window !== 'undefined') {
  window.SubtitleParser = SubtitleParser;
}
