/**
 * Universal YouTube Subtitle Parser
 * Supports JSON3, YouTube ASR/srv3 XML (<p t="" d="">), legacy XML (<text start="" dur="">), and WebVTT
 */

const SubtitleParser = {
  // Decode HTML entities safely
  decodeHtml(html) {
    if (!html) return '';
    return html
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  },

  // Clean and normalize subtitle text
  cleanText(text) {
    if (!text) return '';
    return this.decodeHtml(text)
      .replace(/<[^>]*>/g, '') // strip nested tags like <s>
      .replace(/[\n\r]+/g, ' ') // replace newlines with space
      .replace(/\s+/g, ' ') // collapse spaces
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
        const text = ev.segs.map(s => s.utf8 || '').join('');
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

  // Parse Regex for <p t="..." d="..."> (YouTube ASR Auto-generated & srv3)
  parseSrv3Xml(raw) {
    try {
      const pRegex = /<p\s+([^>]+)>([\s\S]*?)<\/p>/gi;
      const segments = [];
      let pMatch;
      while ((pMatch = pRegex.exec(raw)) !== null) {
        const attrs = pMatch[1];
        const inner = pMatch[2];
        const tMatch = attrs.match(/t=["']?(\d+)["']?/);
        const dMatch = attrs.match(/d=["']?(\d+)["']?/);
        const t = tMatch ? parseInt(tMatch[1], 10) : 0;
        const d = dMatch ? parseInt(dMatch[1], 10) : 0;
        const text = this.cleanText(inner);
        if (text) {
          segments.push({
            id: segments.length,
            start: parseFloat((t / 1000).toFixed(2)),
            end: parseFloat(((t + d) / 1000).toFixed(2)),
            duration: parseFloat((d / 1000).toFixed(2)),
            text: text
          });
        }
      }
      return segments.length > 0 ? segments : null;
    } catch (e) {
      return null;
    }
  },

  // Parse Regex for <text start="..." dur="..."> (Legacy XML)
  parseLegacyXml(raw) {
    try {
      const textRegex = /<text\s+([^>]+)>([\s\S]*?)<\/text>/gi;
      const segments = [];
      let tMatch;
      while ((tMatch = textRegex.exec(raw)) !== null) {
        const attrs = tMatch[1];
        const inner = tMatch[2];
        const startMatch = attrs.match(/start=["']?([\d.]+)["']?/);
        const durMatch = attrs.match(/dur=["']?([\d.]+)["']?/);
        const start = startMatch ? parseFloat(startMatch[1]) : 0;
        const dur = durMatch ? parseFloat(durMatch[1]) : 0;
        const text = this.cleanText(inner);
        if (text) {
          segments.push({
            id: segments.length,
            start: parseFloat(start.toFixed(2)),
            end: parseFloat((start + dur).toFixed(2)),
            duration: parseFloat(dur.toFixed(2)),
            text: text
          });
        }
      }
      return segments.length > 0 ? segments : null;
    } catch (e) {
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

    // 2. Try srv3 XML (<p t="" d="">)
    const srv3Result = this.parseSrv3Xml(raw);
    if (srv3Result && srv3Result.length > 0) return srv3Result;

    // 3. Try legacy XML (<text start="" dur="">)
    const legacyResult = this.parseLegacyXml(raw);
    if (legacyResult && legacyResult.length > 0) return legacyResult;

    // 4. Try VTT
    const vttResult = this.parseVtt(raw);
    if (vttResult && vttResult.length > 0) return vttResult;

    return [];
  }
};

if (typeof window !== 'undefined') {
  window.SubtitleParser = SubtitleParser;
}
