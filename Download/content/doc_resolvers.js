// OmniLoader - Document VIP Get-Link Resolver Module
// Tự động nhận diện và kết nối cổng giải mã tải file gốc (Scribd, Studocu, SlideShare, Issuu, Academia)

export class DocResolver {
  static detectPlatform(url) {
    if (!url) return null;
    const lowerUrl = url.toLowerCase();

    // Google Drive / Google Docs / Sheets / Slides
    const driveMatch = lowerUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/) ||
                       lowerUrl.match(/drive\.google\.com\/.*[?&]id=([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      const fileId = driveMatch[1];
      return {
        name: 'Google Drive Document',
        type: 'googledrive',
        icon: '📁',
        fileId: fileId,
        directDownloadUrl: `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`,
        resolverUrl: () => `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`
      };
    }

    const docsMatch = lowerUrl.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (docsMatch) {
      const docId = docsMatch[1];
      return {
        name: 'Google Docs Document',
        type: 'googledocs',
        icon: '📄',
        fileId: docId,
        directDownloadUrl: `https://docs.google.com/document/d/${docId}/export?format=pdf`,
        resolverUrl: () => `https://docs.google.com/document/d/${docId}/export?format=pdf`
      };
    }

    const presMatch = lowerUrl.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    if (presMatch) {
      const presId = presMatch[1];
      return {
        name: 'Google Slides Presentation',
        type: 'googleslides',
        icon: '📊',
        fileId: presId,
        directDownloadUrl: `https://docs.google.com/presentation/d/${presId}/export/pdf`,
        resolverUrl: () => `https://docs.google.com/presentation/d/${presId}/export/pdf`
      };
    }

    const sheetMatch = lowerUrl.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (sheetMatch) {
      const sheetId = sheetMatch[1];
      return {
        name: 'Google Sheets Spreadsheet',
        type: 'googlesheets',
        icon: '📈',
        fileId: sheetId,
        directDownloadUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=pdf`,
        resolverUrl: () => `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=pdf`
      };
    }

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
