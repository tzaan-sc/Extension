// OmniUI - Figma JSON, SVG & Code Generator Engine

(function () {
  'use strict';

  // 1. Chuyển đổi mã màu CSS sang định dạng RGBA Figma (0-1)
  function parseCssColor(colorStr) {
    if (!colorStr || colorStr === 'transparent' || colorStr === 'rgba(0, 0, 0, 0)') {
      return null;
    }

    const rgbaMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (rgbaMatch) {
      return {
        r: parseInt(rgbaMatch[1], 10) / 255,
        g: parseInt(rgbaMatch[2], 10) / 255,
        b: parseInt(rgbaMatch[3], 10) / 255,
        a: rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1
      };
    }

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

  // Chuyển RGB sang Hex string dạng #RRGGBB
  function rgbToHex(colorStr) {
    const c = parseCssColor(colorStr);
    if (!c) return null;
    const r = Math.round(c.r * 255).toString(16).padStart(2, '0');
    const g = Math.round(c.g * 255).toString(16).padStart(2, '0');
    const b = Math.round(c.b * 255).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }

  // Chuyển chuỗi px sang số
  function parsePx(val) {
    if (!val) return 0;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : num;
  }

  // 2. Chuyển đổi DOM Node thành Figma JSON chuẩn
  window.domToFigmaNode = function (element, maxDepth = 7) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE || maxDepth <= 0) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const style = window.getComputedStyle(element);
    const tagName = element.tagName.toLowerCase();

    // Text-only node
    const isTextOnly = element.children.length === 0 && element.textContent && element.textContent.trim().length > 0;
    if (isTextOnly && tagName !== 'input' && tagName !== 'button' && tagName !== 'img' && tagName !== 'svg') {
      const textColor = parseCssColor(style.color) || { r: 0.1, g: 0.1, b: 0.1, a: 1 };
      return {
        type: 'TEXT',
        name: `${tagName}: "${element.textContent.trim().substring(0, 24)}"`,
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
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

    // Frame / Container Node
    const bgColor = parseCssColor(style.backgroundColor);
    const borderColor = parseCssColor(style.borderColor);
    const borderWidth = parsePx(style.borderWidth);
    const cornerRadius = parsePx(style.borderRadius);

    const isFlex = style.display === 'flex' || style.display === 'inline-flex';

    const figmaNode = {
      type: 'FRAME',
      name: `${tagName}${element.id ? '#' + element.id : (element.className && typeof element.className === 'string' ? '.' + element.className.split(' ')[0] : '')}`,
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
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

    // Đệ quy phần tử con
    Array.from(element.children).forEach(child => {
      const childFigma = window.domToFigmaNode(child, maxDepth - 1);
      if (childFigma) {
        figmaNode.children.push(childFigma);
      }
    });

    return figmaNode;
  };

  // 3. Tạo Script thực thi trực tiếp trên Figma Console để dựng Auto-Layout tự động
  window.generateFigmaConsoleScript = function (figmaNode) {
    const jsonStr = JSON.stringify(figmaNode);
    return `// ==========================================
// HƯỚNG DẪN IMPORT TRỰC TIẾP VÀO FIGMA:
// 1. Mở Figma trên Web hoặc Desktop app.
// 2. Mở Console: Phím tắt Ctrl + Shift + I (hoặc Menu > Plugins > Development > Open Console).
// 3. Dán toàn bộ mã bên dưới và nhấn ENTER -> Node & Auto Layout sẽ xuất hiện ngay lập tức!
// ==========================================
(async function() {
  const data = ${jsonStr};

  async function buildFigmaNode(node, parent) {
    if (!node) return null;
    if (node.type === 'TEXT') {
      try {
        await figma.loadFontAsync(node.fontName || { family: 'Inter', style: 'Regular' });
      } catch (e) {
        await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
      }
      const text = figma.createText();
      text.characters = node.characters || ' ';
      text.fontSize = node.fontSize || 16;
      if (node.fills && node.fills.length) text.fills = node.fills;
      parent.appendChild(text);
      return text;
    }

    const frame = figma.createFrame();
    frame.name = node.name || 'Frame';
    frame.resize(Math.max(1, node.width || 100), Math.max(1, node.height || 40));
    frame.cornerRadius = node.cornerRadius || 0;
    frame.clipsContent = !!node.clipsContent;

    if (node.fills && node.fills.length) frame.fills = node.fills;
    if (node.strokes && node.strokes.length) {
      frame.strokes = node.strokes;
      frame.strokeWeight = node.strokeWeight || 1;
    }

    if (node.layoutMode && node.layoutMode !== 'NONE') {
      frame.layoutMode = node.layoutMode;
      frame.itemSpacing = node.itemSpacing || 0;
      frame.paddingTop = node.paddingTop || 0;
      frame.paddingRight = node.paddingRight || 0;
      frame.paddingBottom = node.paddingBottom || 0;
      frame.paddingLeft = node.paddingLeft || 0;
      frame.primaryAxisSizingMode = 'AUTO';
      frame.counterAxisSizingMode = 'AUTO';
    }

    parent.appendChild(frame);

    if (node.children && node.children.length) {
      for (const child of node.children) {
        await buildFigmaNode(child, frame);
      }
    }
    return frame;
  }

  const root = await buildFigmaNode(data, figma.currentPage);
  if (root) {
    figma.currentPage.selection = [root];
    figma.viewport.scrollAndZoomIntoView([root]);
    figma.notify('✨ Đã nhập phần tử vào Figma thành công!');
  }
})();`;
  };

  // 4. Chuyển đổi DOM sang định dạng SVG tự chứa (Direct Paste Ctrl+V vào Figma)
  window.domToSvg = function (element) {
    if (!element) return '';
    const rect = element.getBoundingClientRect();
    const clone = element.cloneNode(true);

    // Xóa thẻ script, noscript trong bản clone
    clone.querySelectorAll('script, noscript, #omniui-drawer, #omniui-hud, #omniui-overlay-box').forEach(el => el.remove());

    // Inline toàn bộ computed CSS vào mọi tag trong clone để hiển thị chuẩn xác
    function inlineComputedStyles(source, target) {
      if (!source || !target || source.nodeType !== Node.ELEMENT_NODE) return;
      const s = window.getComputedStyle(source);
      let inlineCss = '';
      const importantProps = [
        'display', 'flex-direction', 'justify-content', 'align-items', 'gap',
        'width', 'height', 'max-width', 'min-width', 'box-sizing',
        'padding', 'margin',
        'background', 'background-color', 'background-image',
        'color', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align',
        'border', 'border-radius', 'box-shadow', 'opacity', 'overflow'
      ];
      importantProps.forEach(prop => {
        const val = s.getPropertyValue(prop);
        if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== 'rgba(0, 0, 0, 0)') {
          inlineCss += `${prop}:${val};`;
        }
      });
      target.setAttribute('style', inlineCss + (target.getAttribute('style') || ''));

      for (let i = 0; i < source.children.length; i++) {
        if (target.children[i]) {
          inlineComputedStyles(source.children[i], target.children[i]);
        }
      }
    }

    inlineComputedStyles(element, clone);

    const serializer = new XMLSerializer();
    const htmlString = serializer.serializeToString(clone);

    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <foreignObject width="100%" height="100%">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;box-sizing:border-box;">
      ${htmlString}
    </div>
  </foreignObject>
</svg>`;
  };

  // 5. Trích xuất class Tailwind CSS thông minh cho 1 phần tử
  window.domToTailwindClasses = function (element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
    const s = window.getComputedStyle(element);
    const classes = [];

    // Display & Flex / Grid
    if (s.display === 'flex') classes.push('flex');
    else if (s.display === 'grid') classes.push('grid');
    else if (s.display === 'inline-flex') classes.push('inline-flex');
    else if (s.display === 'inline-block') classes.push('inline-block');
    else if (s.display === 'block') classes.push('block');
    else if (s.display === 'none') classes.push('hidden');

    if (s.display.includes('flex')) {
      if (s.flexDirection === 'column') classes.push('flex-col');
      if (s.alignItems === 'center') classes.push('items-center');
      else if (s.alignItems === 'flex-start') classes.push('items-start');
      else if (s.alignItems === 'flex-end') classes.push('items-end');

      if (s.justifyContent === 'center') classes.push('justify-center');
      else if (s.justifyContent === 'space-between') classes.push('justify-between');
      else if (s.justifyContent === 'flex-end') classes.push('justify-end');

      if (s.flexWrap === 'wrap') classes.push('flex-wrap');
    }

    // Gap
    const gap = parsePx(s.gap);
    if (gap >= 32) classes.push('gap-8');
    else if (gap >= 24) classes.push('gap-6');
    else if (gap >= 16) classes.push('gap-4');
    else if (gap >= 12) classes.push('gap-3');
    else if (gap >= 8) classes.push('gap-2');
    else if (gap >= 4) classes.push('gap-1');

    // Padding
    const pt = parsePx(s.paddingTop);
    const pr = parsePx(s.paddingRight);
    const pb = parsePx(s.paddingBottom);
    const pl = parsePx(s.paddingLeft);

    if (pt === pr && pr === pb && pb === pl && pt > 0) {
      if (pt >= 32) classes.push('p-8');
      else if (pt >= 24) classes.push('p-6');
      else if (pt >= 16) classes.push('p-4');
      else if (pt >= 12) classes.push('p-3');
      else if (pt >= 8) classes.push('p-2');
      else if (pt >= 4) classes.push('p-1');
    } else {
      if (pt === pb && pt > 0) {
        if (pt >= 16) classes.push('py-4');
        else if (pt >= 12) classes.push('py-3');
        else if (pt >= 8) classes.push('py-2');
        else if (pt >= 4) classes.push('py-1');
      }
      if (pr === pl && pr > 0) {
        if (pr >= 24) classes.push('px-6');
        else if (pr >= 16) classes.push('px-4');
        else if (pr >= 12) classes.push('px-3');
        else if (pr >= 8) classes.push('px-2');
      }
    }

    // Bo góc
    const r = parsePx(s.borderRadius);
    if (r >= 999 || r >= 100) classes.push('rounded-full');
    else if (r >= 24) classes.push('rounded-3xl');
    else if (r >= 16) classes.push('rounded-2xl');
    else if (r >= 12) classes.push('rounded-xl');
    else if (r >= 8) classes.push('rounded-lg');
    else if (r >= 4) classes.push('rounded-md');

    // Font Size
    const fz = parsePx(s.fontSize);
    if (fz >= 36) classes.push('text-4xl');
    else if (fz >= 30) classes.push('text-3xl');
    else if (fz >= 24) classes.push('text-2xl');
    else if (fz >= 20) classes.push('text-xl');
    else if (fz >= 18) classes.push('text-lg');
    else if (fz <= 12) classes.push('text-xs');
    else if (fz <= 14) classes.push('text-sm');

    // Font Weight
    const w = parseInt(s.fontWeight, 10);
    if (w >= 800) classes.push('font-extrabold');
    else if (w >= 700) classes.push('font-bold');
    else if (w >= 600) classes.push('font-semibold');
    else if (w >= 500) classes.push('font-medium');

    // Text Align
    if (s.textAlign === 'center') classes.push('text-center');
    else if (s.textAlign === 'right') classes.push('text-right');

    // Shadow
    if (s.boxShadow && s.boxShadow !== 'none') {
      if (s.boxShadow.includes('rgba(0, 0, 0, 0.5)')) classes.push('shadow-2xl');
      else classes.push('shadow-lg');
    }

    // Border
    const bw = parsePx(s.borderWidth);
    if (bw > 0) {
      classes.push(bw >= 2 ? 'border-2' : 'border');
      const bHex = rgbToHex(s.borderColor);
      if (bHex) classes.push(`border-[${bHex}]`);
    }

    // Màu nền
    const bgHex = rgbToHex(s.backgroundColor);
    if (bgHex) {
      classes.push(`bg-[${bgHex}]`);
    }

    // Màu chữ
    const textHex = rgbToHex(s.color);
    if (textHex) {
      classes.push(`text-[${textHex}]`);
    }

    // Cursor & Transition
    if (s.cursor === 'pointer') classes.push('cursor-pointer hover:opacity-90 transition-all');

    return classes.join(' ');
  };

  // 6. Quét toàn bộ cây phần tử và xuất thành HTML có Tailwind class hoàn chỉnh
  window.domToTailwindTree = function (element, depth = 0) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return '';
    const tagName = element.tagName.toLowerCase();

    // Bỏ qua các thẻ hệ thống của OmniUI
    if (element.id && element.id.startsWith('omniui-')) return '';

    const indent = '  '.repeat(depth);
    const twClass = window.domToTailwindClasses(element);
    const classAttr = twClass ? ` class="${twClass}"` : '';

    // Thẻ tự đóng (Void tags)
    const voidTags = ['img', 'input', 'br', 'hr'];
    if (voidTags.includes(tagName)) {
      if (tagName === 'img') {
        const src = element.getAttribute('src') || '';
        const alt = element.getAttribute('alt') || 'image';
        return `${indent}<img src="${src}" alt="${alt}"${classAttr} />\n`;
      }
      return `${indent}<${tagName}${classAttr} />\n`;
    }

    // Thẻ chứa SVG
    if (tagName === 'svg') {
      const viewBox = element.getAttribute('viewBox') || '0 0 24 24';
      return `${indent}<svg viewBox="${viewBox}"${classAttr} fill="currentColor">\n${element.innerHTML}\n${indent}</svg>\n`;
    }

    // Nếu chỉ chứa text đơn giản
    if (element.children.length === 0) {
      const text = element.textContent.trim();
      return `${indent}<${tagName}${classAttr}>${text}</${tagName}>\n`;
    }

    // Nếu chứa các phần tử con
    let innerHtml = '';
    Array.from(element.children).forEach(child => {
      innerHtml += window.domToTailwindTree(child, depth + 1);
    });

    return `${indent}<${tagName}${classAttr}>\n${innerHtml}${indent}</${tagName}>\n`;
  };

  // 7. Tạo React JSX Component hoàn chỉnh từ Element
  window.domToReactJsx = function (element) {
    if (!element) return '';
    const tailwindHtml = window.domToTailwindTree(element, 1);
    const jsxHtml = tailwindHtml
      .replace(/ class="/g, ' className="')
      .replace(/<img (.*?)>/g, '<img $1 />')
      .replace(/<input (.*?)>/g, '<input $1 />');

    return `import React from 'react';

export default function Component() {
  return (
${jsxHtml}  );
}`;
  };

  // 8. Tạo Vue 3 Single File Component
  window.domToVue = function (element) {
    if (!element) return '';
    const tailwindHtml = window.domToTailwindTree(element, 1);
    return `<template>
${tailwindHtml}</template>

<script setup>
// Logic component
</script>`;
  };

  // 9. Trích xuất Computed CSS và HTML đóng gói (Pure HTML + CSS)
  window.domToScopedHtmlCss = function (element) {
    if (!element) return { html: '', css: '' };
    const tagName = element.tagName.toLowerCase();
    const className = `omni-${tagName}-${Date.now().toString().slice(-4)}`;

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

    let css = `/* Scoped CSS cho .${className} */\n.${className} {\n`;
    props.forEach(p => {
      const val = s.getPropertyValue(p);
      if (val && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== 'rgba(0, 0, 0, 0)' && val !== '0px') {
        css += `  ${p}: ${val};\n`;
      }
    });
    css += `}\n`;

    const clone = element.cloneNode(true);
    clone.classList.add(className);
    const html = clone.outerHTML;

    return { html, css, fullCode: `<style>\n${css}</style>\n\n${html}` };
  };

  // 10. Quét toàn bộ bảng màu & Typography của website
  window.extractPageTheme = function () {
    const colors = new Set();
    const fonts = new Set();

    document.querySelectorAll('*').forEach(el => {
      if (el.id && el.id.startsWith('omniui-')) return;
      const s = window.getComputedStyle(el);
      if (s.color && s.color !== 'rgba(0, 0, 0, 0)') colors.add(s.color);
      if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') colors.add(s.backgroundColor);
      if (s.fontFamily) {
        const primaryFont = s.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
        if (primaryFont) fonts.add(primaryFont);
      }
    });

    return {
      colors: Array.from(colors).slice(0, 20),
      fonts: Array.from(fonts).slice(0, 10)
    };
  };
})();
