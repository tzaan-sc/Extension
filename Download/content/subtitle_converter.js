// OmniLoader - Subtitle Parser & Converter (YouTube XML/JSON/VTT -> Standard .SRT)

export function convertTimedTextToSrt(xmlText) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const textNodes = xmlDoc.getElementsByTagName('text');

    if (!textNodes || textNodes.length === 0) {
      return xmlText;
    }

    let srtOutput = '';
    for (let i = 0; i < textNodes.length; i++) {
      const node = textNodes[i];
      const startSec = parseFloat(node.getAttribute('start') || '0');
      const durationSec = parseFloat(node.getAttribute('dur') || '2');
      const endSec = startSec + durationSec;

      const text = decodeHtmlEntities(node.textContent || '');

      srtOutput += `${i + 1}\n`;
      srtOutput += `${formatSrtTime(startSec)} --> ${formatSrtTime(endSec)}\n`;
      srtOutput += `${text.trim()}\n\n`;
    }

    return srtOutput;
  } catch (e) {
    return xmlText;
  }
}

function formatSrtTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.floor((totalSeconds % 1) * 1000);

  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

function decodeHtmlEntities(str) {
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}
