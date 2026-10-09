// OmniLoader - Document VIP Get-Link Resolver Module
// Tự động nhận diện và kết nối cổng giải mã tải file gốc (Scribd, Studocu, SlideShare, Issuu, Academia)

export class DocResolver {
  static detectPlatform(url) {
    if (!url) return null;
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('scribd.com/document') || lowerUrl.includes('scribd.com/doc') || lowerUrl.includes('scribd.com/presentation')) {
      return {
        name: 'Scribd Document',
        type: 'scribd',
        icon: '📚',
        resolverUrl: (u) => `https://downscribd.com/?url=${encodeURIComponent(u)}`
      };
    }

    if (lowerUrl.includes('studocu.com') && lowerUrl.includes('/document/')) {
      return {
        name: 'Studocu Document',
        type: 'studocu',
        icon: '🎓',
        resolverUrl: (u) => `https://studocudownloader.com/?url=${encodeURIComponent(u)}`
      };
    }

    if (lowerUrl.includes('slideshare.net/')) {
      return {
        name: 'SlideShare Presentation',
        type: 'slideshare',
        icon: '📊',
        resolverUrl: (u) => `https://docdownloader.com/?slideshare=${encodeURIComponent(u)}`
      };
    }

    if (lowerUrl.includes('issuu.com/')) {
      return {
        name: 'Issuu Publication',
        type: 'issuu',
        icon: '📖',
        resolverUrl: (u) => `https://docdownloader.com/?issuu=${encodeURIComponent(u)}`
      };
    }

    if (lowerUrl.includes('academia.edu/')) {
      return {
        name: 'Academia Research Paper',
        type: 'academia',
        icon: '📝',
        resolverUrl: (u) => `https://docdownloader.com/?academia=${encodeURIComponent(u)}`
      };
    }

    return null;
  }
}
