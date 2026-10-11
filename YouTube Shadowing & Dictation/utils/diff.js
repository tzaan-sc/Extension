/**
 * Text normalization and diff comparison algorithm for Dictation & Shadowing
 */

const DiffUtils = {
  // Normalize a single word (remove punctuation, lower case, supports both Latin and CJK)
  normalizeWord(word) {
    if (!word) return '';
    return word
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’“”]/g, '') // Latin punctuation
      .replace(/[。、！？「」『』（）［］【】〜～·《》〈〉]/g, '') // CJK (Chinese, Japanese, Korean) punctuation
      .trim();
  },

  // Tokenize text into words preserving original punctuation for display
  // Uses Intl.Segmenter for Japanese & Chinese (languages without spaces), and standard split for others
  tokenize(text) {
    if (!text) return [];

    // Kiểm tra xem câu có chứa chữ Hán/Hiragana/Katakana không
    const hasCJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text);

    if (hasCJK && typeof Intl !== 'undefined' && Intl.Segmenter) {
      try {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
        const words = [];
        for (const seg of segmenter.segment(text)) {
          const str = seg.segment.trim();
          if (!str) continue;
          const normalized = this.normalizeWord(str);
          // Chỉ thêm nếu có nội dung sau khi chuẩn hóa hoặc có ký tự gốc không phải khoảng trắng
          if (normalized.length > 0) {
            words.push({
              original: seg.segment,
              normalized: normalized
            });
          }
        }
        if (words.length > 0) return words;
      } catch (e) {}
    }

    // Mặc định cho Tiếng Anh, Tiếng Việt, Tiếng Hàn và các ngôn ngữ có dấu cách thông thường
    const tokens = text.trim().split(/\s+/);
    return tokens.map(token => ({
      original: token,
      normalized: this.normalizeWord(token)
    })).filter(t => t.normalized.length > 0 || t.original.length > 0);
  },

  // Longest Common Subsequence (LCS) for word diff
  computeLCS(origTokens, userTokens) {
    const m = origTokens.length;
    const n = userTokens.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (origTokens[i - 1].normalized === userTokens[j - 1].normalized) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    return dp;
  },

  // Compare original sentence vs user typed sentence
  compare(originalText, userText) {
    const origTokens = this.tokenize(originalText);
    const userTokens = this.tokenize(userText);

    const m = origTokens.length;
    const n = userTokens.length;
    const dp = this.computeLCS(origTokens, userTokens);

    let i = m;
    let j = n;
    const resultOriginal = [];
    const resultUser = [];
    let correctCount = 0;

    // Backtrack from LCS table
    const diffSequence = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && origTokens[i - 1].normalized === userTokens[j - 1].normalized) {
        diffSequence.unshift({
          type: 'correct',
          orig: origTokens[i - 1].original,
          user: userTokens[j - 1].original
        });
        correctCount++;
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        // Extra word in user input
        diffSequence.unshift({
          type: 'extra',
          orig: null,
          user: userTokens[j - 1].original
        });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        // Missing word from original
        diffSequence.unshift({
          type: 'missing',
          orig: origTokens[i - 1].original,
          user: null
        });
        i--;
      }
    }

    const totalWords = origTokens.length;
    const accuracy = totalWords > 0 ? Math.round((correctCount / totalWords) * 100) : (userTokens.length === 0 ? 100 : 0);
    const isPerfect = accuracy === 100 && userTokens.length === origTokens.length;

    return {
      accuracy,
      isPerfect,
      correctCount,
      totalWords,
      diffSequence,
      origTokens,
      userTokens
    };
  },

  // Generate masked hint (supports Latin, CJK, Hangul, Vietnamese with Unicode property escapes)
  generateHint(text, level = 1) {
    if (!text) return '';
    try {
      return text.replace(/[\p{L}\p{N}]/gu, (char, index) => {
        if (level === 1) {
          return index === 0 || text[index - 1] === ' ' ? char : '_';
        } else {
          return '_';
        }
      });
    } catch (e) {
      return text.replace(/[a-zA-Z0-9]/g, (char, index) => {
        if (level === 1) {
          return index === 0 || text[index - 1] === ' ' ? char : '_';
        } else {
          return '_';
        }
      });
    }
  },

  // Calculate Levenshtein similarity for single words
  levenshtein(a, b) {
    const an = a ? a.length : 0;
    const bn = b ? b.length : 0;
    if (an === 0) return bn;
    if (bn === 0) return an;
    const matrix = [];
    for (let i = 0; i <= bn; i++) matrix[i] = [i];
    for (let j = 0; j <= an; j++) matrix[0][j] = j;

    for (let i = 1; i <= bn; i++) {
      for (let j = 1; j <= an; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
          );
        }
      }
    }
    return matrix[bn][an];
  }
};

if (typeof window !== 'undefined') {
  window.DiffUtils = DiffUtils;
}
