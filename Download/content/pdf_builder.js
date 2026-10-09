// OmniLoader - Pure JS PDF Builder (Tạo file PDF chuẩn từ danh sách ảnh JPEG mà không cần thư viện ngoài)

export function createPdfFromImages(images) {
  // images = [{ dataUrl, width, height }]
  if (!images || images.length === 0) return null;

  let pdfContent = '%PDF-1.4\n';
  const objectOffsets = [];
  let currentOffset = 0;

  function addLine(str) {
    pdfContent += str + '\n';
  }

  function markObject(objNum) {
    objectOffsets[objNum] = pdfContent.length;
    addLine(`${objNum} 0 obj`);
  }

  // 1. Catalog Object
  markObject(1);
  addLine('<< /Type /Catalog /Pages 2 0 R >>');
  addLine('endobj');

  // Chuẩn bị danh sách Pages
  const totalPages = images.length;
  const pageObjectRefs = [];
  for (let i = 0; i < totalPages; i++) {
    pageObjectRefs.push(`${3 + i * 3} 0 R`);
  }

  // 2. Pages Object
  markObject(2);
  addLine(`<< /Type /Pages /Kids [${pageObjectRefs.join(' ')}] /Count ${totalPages} >>`);
  addLine('endobj');

  // Tạo từng trang
  for (let i = 0; i < totalPages; i++) {
    const img = images[i];
    const pageObjNum = 3 + i * 3;
    const contentObjNum = pageObjNum + 1;
    const imageObjNum = pageObjNum + 2;

    // Chuẩn hóa kích thước trang (A4 hoặc kích thước ảnh)
    const pageWidth = img.width || 595.28;
    const pageHeight = img.height || 841.89;

    // A. Page Object
    markObject(pageObjNum);
    addLine(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObjNum} 0 R /Resources << /XObject << /Im${i + 1} ${imageObjNum} 0 R >> >> >>`);
    addLine('endobj');

    // B. Page Content Stream (Vẽ ảnh phủ toàn trang)
    const streamContent = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${i + 1} Do\nQ`;
    markObject(contentObjNum);
    addLine(`<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`);
    addLine('endobj');

    // C. Image XObject (Nhúng ảnh JPEG trực tiếp qua DCTDecode)
    const base64Data = img.dataUrl.split(',')[1];
    const rawBinary = atob(base64Data);

    markObject(imageObjNum);
    addLine(`<< /Type /XObject /Subtype /Image /Width ${img.width || 800} /Height ${img.height || 1100} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${rawBinary.length} >>\nstream`);
    pdfContent += rawBinary + '\nendstream\nendobj\n';
  }

  // XREF Table
  const startXref = pdfContent.length;
  addLine('xref');
  addLine(`0 ${3 + totalPages * 3}`);
  addLine('0000000000 65535 f ');

  for (let i = 1; i < 3 + totalPages * 3; i++) {
    const offset = String(objectOffsets[i] || 0).padStart(10, '0');
    addLine(`${offset} 00000 n `);
  }

  // Trailer
  addLine('trailer');
  addLine(`<< /Size ${3 + totalPages * 3} /Root 1 0 R >>`);
  addLine('startxref');
  addLine(String(startXref));
  addLine('%%EOF');

  // Chuyển binary string thành Uint8Array & Blob
  const buffer = new Uint8Array(pdfContent.length);
  for (let i = 0; i < pdfContent.length; i++) {
    buffer[i] = pdfContent.charCodeAt(i) & 0xff;
  }

  return new Blob([buffer], { type: 'application/pdf' });
}
