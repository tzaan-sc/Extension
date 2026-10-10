// OmniUI - Figma JSON & Code Generator Engine

(function () {
  'use strict';

  // Chuyển đổi mã màu CSS (rgb / rgba / hex) sang định dạng màu Figma (r, g, b từ 0 đến 1, a từ 0 đến 1)
  function parseCssColor(colorStr) {
    if (!colorStr || colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') {
      return null;
    }

    // Xử lý rgb / rgba
    const rgbaMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (rgbaMatch) {
      return {
        r: parseInt(rgbaMatch[1], 10) / 255,
        g: parseInt(rgbaMatch[2], 10) / 255,
        b: parseInt(rgbaMatch[3], 10) / 255,
        a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
      };
    }

    // Xử lý Hex (#fff, #ffffff)
    if (colorStr.startsWith('#')) {
      let hex = colorStr.slice(1);
      if (hex.length === 3) {
        hex = hex.split('').map(c => c + c).join('');
      }
      const num = parseInt(hex, 16);
      return {
        r: ((num >> 16) & 255) / 255,
        g: ((num >> 8) & 255) / 255,
        b: (num & 255) / 255,
        a: 1
      };
    }

    return null;
  }

  // Chuyển chuỗi px sang số (ví dụ: "16px" -> 16)
  function parsePx(val) {
    if (!val) return 0;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }

  // Chuyển đổi DOM Node thành Figma JSON
  window.domToFigmaNode = function (element, maxDepth = 6) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || maxDepth <= 0) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const style = window.getComputedStyle(element);
    const tagName = element.tagName.toLowerCase();

    // 1. Nếu là phần tử Text thuần (hoặc thẻ chỉ chứa text ngắn)
    const isTextOnly = element.children.length === 0 && element.textContent && element.textContent.trim().length > 0;

    if (isTextOnly && tagName !== 'input' && tagName !== 'button' && tagName !== 'img') {
      const textColor = parseCssColor(style.color) || { r: 0, g: 0, b: 0, a: 1 };
      return {
        type: 'TEXT',
        name: `${tagName}: "${element.textContent.trim().substring(0, 20)}"`,
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        characters: element.textContent.trim(),
        fontSize: parsePx(style.fontSize) || 16,
        fontName: {
          family: style.fontFamily.split(',')[0].replace(/['"]/g, '').trim() || 'Inter',
          style: parseInt(style.fontWeight, 10) >= 600 ? 'Bold' : 'Regular'
        },
        textAlignHorizontal: style.textAlign.toUpperCase() === 'CENTER' ? 'CENTER' : (style.textAlign.toUpperCase() === 'RIGHT' ? 'RIGHT' : 'LEFT'),
        fills: [{
          type: 'SOLID',
          color: { r: textColor.r, g: textColor.g, b: textColor.b },
          opacity: textColor.a
        }]
      };
    }

    // 2. Nếu là Frame / Container (div, section, button, card...)
    const bgColor = parseCssColor(style.backgroundColor);
    const borderColor = parseCssColor(style.borderColor);
    const borderWidth = parsePx(style.borderWidth);
    const cornerRadius = parsePx(style.borderRadius);

    const isFlex = style.display === 'flex' || style.display === 'inline-flex';
    const isGrid = style.display === 'grid';

    const figmaNode = {
      type: 'FRAME',
      name: `${tagName}${element.id ? '#' + element.id : (element.className ? '.' + element.className.split(' ')[0] : '')}`,
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      cornerRadius: cornerRadius,
      clipsContent: style.overflow === 'hidden',
      layoutMode: isFlex ? (style.flexDirection.includes('column') ? 'VERTICAL' : 'HORIZONTAL') : 'NONE',
      itemSpacing: parsePx(style.gap) || 0,
      paddingTop: parsePx(style.paddingTop),
      paddingRight: parsePx(style.paddingRight),
      paddingBottom: parsePx(style.paddingBottom),
      paddingLeft: parsePx(style.paddingLeft),
      fills: bgColor ? [{
        type: 'SOLID',
        color: { r: bgColor.r, g: bgColor.g, b: bgColor.b },
        opacity: bgColor.a
      }] : [],
      strokes: (borderColor && borderWidth > 0) ? [{
        type: 'SOLID',
        color: { r: borderColor.r, g: borderColor.g, b: borderColor.b },
        opacity: borderColor.a
      }] : [],
      strokeWeight: borderWidth,
      children: []
    };

    // Đệ quy quét các phần tử con
    Array.from(element.children).forEach(child => {
      const childFigma = window.domToFigmaNode(child, maxDepth - 1);
      if (childFigma) {
        figmaNode.children.push(childFigma);
      }
    });

    return figmaNode;
  };

  // Trích xuất Computed CSS quan trọng
  window.extractComputedCss = function (element) {
    if (!element) return '';
    const s = window.getComputedStyle(element);
    const props = [
      'display', 'flex-direction', 'justify-content', 'align-items', 'gap',
      'position', 'top', 'right', 'bottom', 'left', 'z-index',
      'width', 'height', 'max-width', 'min-height',
      'padding', 'margin',
      'background', 'background-color', 'background-image',
      'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align', 'letter-spacing',
      'border', 'border-radius', 'box-shadow', 'backdrop-filter', 'opacity', 'transition', 'cursor'
    ];

    let css = `/* CSS trích xuất từ phần tử <${element.tagName.toLowerCase()}> */\n`;
    css += `.custom-${element.tagName.toLowerCase()} {\n`;
    props.forEach(p => {
      const val = s.getPropertyValue(p);
      if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== 'rgba(0, 0, 0, 0)' && val !== '0px') {
        css += `  ${p}: ${val};\n`;
      }
    });
    css += `}\n`;
    return css;
  };

  // Tạo class Tailwind CSS tương đương
  window.domToTailwind = function (element) {
    if (!element) return '';
    const s = window.getComputedStyle(element);
    const classes = [];

    // Layout
    if (s.display === 'flex') classes.push('flex');
    if (s.display === 'grid') classes.push('grid');
    if (s.display === 'inline-flex') classes.push('inline-flex');
    if (s.display === 'none') classes.push('hidden');
    if (s.flexDirection === 'column') classes.push('flex-col');
    if (s.alignItems === 'center') classes.push('items-center');
    if (s.justifyContent === 'center') classes.push('justify-center');
    if (s.justifyContent === 'space-between') classes.push('justify-between');

    // Bo góc
    const r = parseFloat(s.borderRadius);
    if (r >= 24) classes.push('rounded-full');
    else if (r >= 16) classes.push('rounded-2xl');
    else if (r >= 12) classes.push('rounded-xl');
    else if (r >= 8) classes.push('rounded-lg');
    else if (r >= 4) classes.push('rounded-md');

    // Font
    const w = parseInt(s.fontWeight, 10);
    if (w >= 800) classes.push('font-extrabold');
    else if (w >= 700) classes.push('font-bold');
    else if (w >= 600) classes.push('font-semibold');
    else if (w >= 500) classes.push('font-medium');

    const fz = parseFloat(s.fontSize);
    if (fz >= 36) classes.push('text-4xl');
    else if (fz >= 30) classes.push('text-3xl');
    else if (fz >= 24) classes.push('text-2xl');
    else if (fz >= 20) classes.push('text-xl');
    else if (fz >= 18) classes.push('text-lg');
    else if (fz <= 12) classes.push('text-xs');
    else if (fz <= 14) classes.push('text-sm');

    // Shadow
    if (s.boxShadow && s.boxShadow !== 'none') classes.push('shadow-lg');

    // Transition & Cursor
    if (s.cursor === 'pointer') classes.push('cursor-pointer');
    classes.push('transition-all duration-200');

    return classes.join(' ');
  };

  // Tạo React JSX Component từ Element
  window.domToReactJsx = function (element) {
    if (!element) return '';
    const tag = element.tagName.toLowerCase();
    const tailwind = window.domToTailwind(element);
    const text = element.children.length === 0 ? element.textContent.trim() : '';

    return `export default function Component() {\n  return (\n    <${tag} className="${tailwind}">\n      ${text || '{/* Con / Nội dung */}'}\n    </${tag}>\n  );\n}`;
  };

  // Quét toàn bộ bảng màu & Typography của toàn trang
  window.extractPageTheme = function () {
    const colors = new Set();
    const fonts = new Set();

    document.querySelectorAll('*').forEach(el => {
      const s = window.getComputedStyle(el);
      if (s.color && s.color !== 'rgba(0, 0, 0, 0)') colors.add(s.color);
      if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') colors.add(s.backgroundColor);
      if (s.fontFamily) {
        const primaryFont = s.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
        if (primaryFont) fonts.add(primaryFont);
      }
    });

    return {
      colors: Array.from(colors).slice(0, 15),
      fonts: Array.from(fonts).slice(0, 8)
    };
  };
})();
