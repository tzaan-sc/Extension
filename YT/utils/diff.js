/**
 * Text normalization and diff comparison algorithm for Dictation & Shadowing
 */

const DiffUtils = {
  // Normalize a single word (remove punctuation, lower case)
  normalizeWord(word) {
    return word
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'’“”]/g, '')
      .trim();
  },

  // Tokenize text into words preserving original punctuation for display
  tokenize(text) {
    if (!text) return [];
    // Match words and remaining tokens
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

  // Generate masked hint (e.g. "H___ a__ y__?")
  generateHint(text, level = 1) {
    if (!text) return '';
    return text.replace(/[a-zA-Z0-9]/g, (char, index) => {
      if (level === 1) {
        // Show first letter of each word
        return index === 0 || text[index - 1] === ' ' ? char : '_';
      } else {
        // Hide all
        return '_';
      }
    });
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
