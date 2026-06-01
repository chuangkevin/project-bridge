import { parse, HTMLElement, TextNode, NodeType } from 'node-html-parser';

// ── Figma Plugin API compatible types ──

export interface FigmaFill {
  type: 'SOLID';
  color: { r: number; g: number; b: number };
  opacity?: number;
}

export interface FigmaStroke {
  type: 'SOLID';
  color: { r: number; g: number; b: number };
}

export interface FigmaEffect {
  type: 'DROP_SHADOW';
  color: { r: number; g: number; b: number; a: number };
  offset: { x: number; y: number };
  radius: number;
}

export interface FigmaNode {
  type: 'FRAME' | 'RECTANGLE' | 'TEXT' | 'GROUP';
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fills?: FigmaFill[];
  strokes?: FigmaStroke[];
  cornerRadius?: number;
  effects?: FigmaEffect[];
  children?: FigmaNode[];
  // Text-specific
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT';
  letterSpacing?: number;
  lineHeight?: number;
}

export interface FigmaPage {
  type: 'PAGE';
  name: string;
  children: FigmaNode[];
}

export interface FigmaDocument {
  document: {
    type: 'DOCUMENT';
    children: FigmaPage[];
  };
}

// ── Named CSS colors (subset of common ones) ──

const CSS_NAMED_COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000',
  blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
  pink: '#ffc0cb', gray: '#808080', grey: '#808080', cyan: '#00ffff',
  magenta: '#ff00ff', transparent: '#00000000',
  // Tailwind / common UI colors
  navy: '#000080', teal: '#008080', maroon: '#800000', olive: '#808000',
  silver: '#c0c0c0', lime: '#00ff00', aqua: '#00ffff', fuchsia: '#ff00ff',
  coral: '#ff7f50', tomato: '#ff6347', gold: '#ffd700', indigo: '#4b0082',
  violet: '#ee82ee', khaki: '#f0e68c', salmon: '#fa8072', crimson: '#dc143c',
  slategray: '#708090', slategrey: '#708090', darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9', lightgray: '#d3d3d3', lightgrey: '#d3d3d3',
  whitesmoke: '#f5f5f5', ghostwhite: '#f8f8ff', aliceblue: '#f0f8ff',
  lavender: '#e6e6fa', beige: '#f5f5dc', ivory: '#fffff0', linen: '#faf0e6',
  mintcream: '#f5fffa', honeydew: '#f0fff0', cornflowerblue: '#6495ed',
  dodgerblue: '#1e90ff', steelblue: '#4682b4', royalblue: '#4169e1',
  darkblue: '#00008b', midnightblue: '#191970', lightblue: '#add8e6',
  skyblue: '#87ceeb', deepskyblue: '#00bfff', cadetblue: '#5f9ea0',
  darkgreen: '#006400', forestgreen: '#228b22', seagreen: '#2e8b57',
  limegreen: '#32cd32', springgreen: '#00ff7f', darkred: '#8b0000',
  firebrick: '#b22222', indianred: '#cd5c5c', lightcoral: '#f08080',
  darkorange: '#ff8c00', orangered: '#ff4500', peru: '#cd853f',
  chocolate: '#d2691e', saddlebrown: '#8b4513', sienna: '#a0522d',
  tan: '#d2b48c', wheat: '#f5deb3', bisque: '#ffe4c4', blanchedalmond: '#ffebcd',
  papayawhip: '#ffefd5', moccasin: '#ffe4b5', peachpuff: '#ffdab9',
  darkviolet: '#9400d3', darkorchid: '#9932cc', mediumpurple: '#9370db',
  plum: '#dda0dd', orchid: '#da70d6', thistle: '#d8bfd8',
};

// ── CSS color parser ──

export function cssColorToFigma(color: string): { r: number; g: number; b: number; a?: number } | null {
  if (!color) return null;
  const c = color.trim().toLowerCase();

  // transparent
  if (c === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  // Named color
  if (CSS_NAMED_COLORS[c]) {
    return cssColorToFigma(CSS_NAMED_COLORS[c]);
  }

  // Hex: #rgb, #rrggbb, #rrggbbaa
  const hexMatch = c.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    if (hex.length === 4) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : undefined;
    return { r, g, b, ...(a !== undefined ? { a } : {}) };
  }

  // rgb(r, g, b) or rgb(r g b)
  const rgbMatch = c.match(/^rgb\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)\s*\)$/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]) / 255,
      g: parseInt(rgbMatch[2]) / 255,
      b: parseInt(rgbMatch[3]) / 255,
    };
  }

  // rgba(r, g, b, a) or rgba(r g b / a)
  const rgbaMatch = c.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)[,/\s]+([\d.]+)\s*\)$/);
  if (rgbaMatch) {
    return {
      r: parseInt(rgbaMatch[1]) / 255,
      g: parseInt(rgbaMatch[2]) / 255,
      b: parseInt(rgbaMatch[3]) / 255,
      a: parseFloat(rgbaMatch[4]),
    };
  }

  return null;
}

// ── Inline style parser ──

export function parseCssStyles(style: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!style) return result;
  const parts = style.split(';');
  for (const part of parts) {
    const colonIdx = part.indexOf(':');
    if (colonIdx < 0) continue;
    const key = part.slice(0, colonIdx).trim().toLowerCase();
    const value = part.slice(colonIdx + 1).trim();
    if (key && value) result[key] = value;
  }
  return result;
}

// ── Box shadow parser ──

export function cssBoxShadowToEffect(shadow: string): FigmaEffect | null {
  if (!shadow || shadow === 'none') return null;
  // Format: [inset] offsetX offsetY [blur [spread]] color
  // We skip inset shadows
  const s = shadow.trim();
  if (s.startsWith('inset')) return null;

  // Try to extract color first (rgb/rgba/hex/named at end or beginning)
  let colorStr = '';
  let rest = s;

  // Color at end: "2px 4px 6px rgba(0,0,0,0.3)"
  const rgbaAtEnd = s.match(/(rgba?\([^)]+\))\s*$/);
  if (rgbaAtEnd) {
    colorStr = rgbaAtEnd[1];
    rest = s.slice(0, s.length - rgbaAtEnd[0].length).trim();
  } else {
    // Hex at end: "2px 4px 6px #333"
    const hexAtEnd = s.match(/(#[0-9a-fA-F]{3,8})\s*$/);
    if (hexAtEnd) {
      colorStr = hexAtEnd[1];
      rest = s.slice(0, s.length - hexAtEnd[0].length).trim();
    } else {
      // Named color at end — try last word
      const words = s.split(/\s+/);
      if (words.length >= 3) {
        const lastWord = words[words.length - 1];
        if (CSS_NAMED_COLORS[lastWord.toLowerCase()]) {
          colorStr = lastWord;
          rest = words.slice(0, -1).join(' ');
        }
      }
    }
  }

  const parts = rest.split(/\s+/);
  const offsetX = parseFloat(parts[0]) || 0;
  const offsetY = parseFloat(parts[1]) || 0;
  const blur = parseFloat(parts[2]) || 0;

  const figmaColor = cssColorToFigma(colorStr);
  const color = figmaColor
    ? { r: figmaColor.r, g: figmaColor.g, b: figmaColor.b, a: figmaColor.a ?? 1 }
    : { r: 0, g: 0, b: 0, a: 0.25 };

  return {
    type: 'DROP_SHADOW',
    color,
    offset: { x: offsetX, y: offsetY },
    radius: blur,
  };
}

// ── Element tag → Figma node type mapping ──

const TEXT_TAGS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'a', 'label', 'strong', 'em', 'b', 'i', 'small']);
const CONTAINER_TAGS = new Set(['div', 'section', 'header', 'footer', 'nav', 'main', 'article', 'aside', 'form', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th']);
const INTERACTIVE_TAGS = new Set(['button', 'input', 'textarea', 'select']);
const VOID_TAGS = new Set(['img', 'br', 'hr', 'input']);

// Default font sizes for heading tags
const HEADING_FONT_SIZES: Record<string, number> = {
  h1: 32, h2: 24, h3: 20, h4: 18, h5: 16, h6: 14,
};

// Default dimensions for common elements
const DEFAULT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  button: { width: 120, height: 40 },
  input: { width: 240, height: 40 },
  textarea: { width: 320, height: 120 },
  select: { width: 200, height: 40 },
  img: { width: 200, height: 150 },
  hr: { width: 1440, height: 1 },
};

// ── Main entry point ──

export function parseHtmlToFigma(html: string): FigmaDocument {
  const root = parse(html);

  // Find the <body> or use root
  const body = root.querySelector('body') || root;

  let yOffset = 0;
  const children: FigmaNode[] = [];

  for (const child of body.childNodes) {
    if (child.nodeType === NodeType.ELEMENT_NODE) {
      const node = parseElement(child as HTMLElement, 0, yOffset);
      if (node) {
        children.push(node);
        yOffset += node.height + 8; // 8px gap between top-level elements
      }
    }
  }

  const pageHeight = yOffset > 0 ? yOffset : 900;

  return {
    document: {
      type: 'DOCUMENT',
      children: [{
        type: 'PAGE',
        name: 'Prototype',
        children: [{
          type: 'FRAME',
          name: 'Page',
          x: 0,
          y: 0,
          width: 1440,
          height: pageHeight,
          fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
          children,
        }],
      }],
    },
  };
}

// ── Recursive element parser ──

function parseElement(element: HTMLElement, parentX: number, parentY: number): FigmaNode | null {
  const tag = element.tagName?.toLowerCase();
  if (!tag) return null;

  // Skip script, style, meta, link, etc.
  if (['script', 'style', 'meta', 'link', 'head', 'title', 'noscript'].includes(tag)) return null;

  const styles = parseCssStyles(element.getAttribute('style') || '');
  const name = element.getAttribute('data-name')
    || element.getAttribute('id')
    || element.getAttribute('class')?.split(/\s+/)[0]
    || tag;

  // Determine dimensions
  const dims = DEFAULT_DIMENSIONS[tag] || { width: 1440, height: 40 };
  const width = parseFloat(styles['width']) || dims.width;
  const height = parseFloat(styles['height']) || dims.height;

  // Determine position
  const x = parseFloat(styles['left']) || parentX;
  const y = parseFloat(styles['top']) || parentY;

  // Build fills from background-color
  const fills: FigmaFill[] = [];
  const bgColor = styles['background-color'] || styles['background'];
  if (bgColor) {
    const figmaColor = cssColorToFigma(bgColor);
    if (figmaColor) {
      const fill: FigmaFill = { type: 'SOLID', color: { r: figmaColor.r, g: figmaColor.g, b: figmaColor.b } };
      if (figmaColor.a !== undefined && figmaColor.a < 1) fill.opacity = figmaColor.a;
      fills.push(fill);
    }
  }

  // Build strokes from border
  const strokes: FigmaStroke[] = [];
  const border = styles['border'] || styles['border-color'];
  if (border) {
    // "1px solid #ccc" or just "#ccc"
    const borderParts = border.split(/\s+/);
    const colorPart = borderParts.find(p => p.startsWith('#') || p.startsWith('rgb') || CSS_NAMED_COLORS[p.toLowerCase()]);
    if (colorPart) {
      const figmaColor = cssColorToFigma(colorPart);
      if (figmaColor) {
        strokes.push({ type: 'SOLID', color: { r: figmaColor.r, g: figmaColor.g, b: figmaColor.b } });
      }
    }
  }

  // Border radius
  let cornerRadius: number | undefined;
  const br = styles['border-radius'];
  if (br) {
    cornerRadius = parseFloat(br) || undefined;
  }

  // Box shadow → effects
  const effects: FigmaEffect[] = [];
  const shadow = styles['box-shadow'];
  if (shadow) {
    const effect = cssBoxShadowToEffect(shadow);
    if (effect) effects.push(effect);
  }

  // ── Text elements ──
  if (TEXT_TAGS.has(tag) || (VOID_TAGS.has(tag) && tag !== 'img')) {
    const characters = element.textContent?.trim() || '';
    if (!characters && tag !== 'br' && tag !== 'hr') {
      // Check if it has child elements (e.g., <a> containing <span>)
      const childElements = element.childNodes.filter((n: any) => n.nodeType === NodeType.ELEMENT_NODE);
      if (childElements.length > 0) {
        return buildContainerNode(element, tag, name, x, y, width, height, fills, strokes, cornerRadius, effects);
      }
      return null;
    }

    const fontSize = parseFloat(styles['font-size']) || HEADING_FONT_SIZES[tag] || 16;
    const fontWeight = parseFontWeight(styles['font-weight']);
    const fontFamily = styles['font-family']?.split(',')[0]?.replace(/['"]/g, '').trim() || undefined;
    const letterSpacing = styles['letter-spacing'] ? parseFloat(styles['letter-spacing']) : undefined;
    const lineHeightVal = styles['line-height'] ? parseFloat(styles['line-height']) : undefined;

    let textAlignHorizontal: 'LEFT' | 'CENTER' | 'RIGHT' | undefined;
    const ta = styles['text-align'];
    if (ta === 'center') textAlignHorizontal = 'CENTER';
    else if (ta === 'right') textAlignHorizontal = 'RIGHT';
    else if (ta === 'left') textAlignHorizontal = 'LEFT';

    // Estimate height from text length and font size
    const estimatedHeight = Math.max(height, fontSize * 1.5);

    const node: FigmaNode = {
      type: 'TEXT',
      name,
      x,
      y,
      width,
      height: estimatedHeight,
      characters,
      fontSize,
    };
    if (fills.length > 0) node.fills = fills;
    // Text color → fills
    const textColor = styles['color'];
    if (textColor) {
      const fc = cssColorToFigma(textColor);
      if (fc) {
        node.fills = [{ type: 'SOLID', color: { r: fc.r, g: fc.g, b: fc.b } }];
      }
    }
    if (fontWeight) node.fontWeight = fontWeight;
    if (fontFamily) node.fontFamily = fontFamily;
    if (textAlignHorizontal) node.textAlignHorizontal = textAlignHorizontal;
    if (letterSpacing !== undefined && !isNaN(letterSpacing)) node.letterSpacing = letterSpacing;
    if (lineHeightVal !== undefined && !isNaN(lineHeightVal)) node.lineHeight = lineHeightVal;

    return node;
  }

  // ── Image elements ──
  if (tag === 'img') {
    const imgWidth = parseFloat(element.getAttribute('width') || '') || parseFloat(styles['width']) || 200;
    const imgHeight = parseFloat(element.getAttribute('height') || '') || parseFloat(styles['height']) || 150;
    return {
      type: 'RECTANGLE',
      name: element.getAttribute('alt') || 'Image',
      x,
      y,
      width: imgWidth,
      height: imgHeight,
      fills: [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }], // placeholder gray
      cornerRadius,
    };
  }

  // ── Container / interactive elements ──
  return buildContainerNode(element, tag, name, x, y, width, height, fills, strokes, cornerRadius, effects);
}

function buildContainerNode(
  element: HTMLElement,
  tag: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fills: FigmaFill[],
  strokes: FigmaStroke[],
  cornerRadius: number | undefined,
  effects: FigmaEffect[],
): FigmaNode {
  // Parse child elements
  let childY = 0;
  const children: FigmaNode[] = [];

  for (const child of element.childNodes) {
    if (child.nodeType === NodeType.ELEMENT_NODE) {
      const childNode = parseElement(child as HTMLElement, 0, childY);
      if (childNode) {
        children.push(childNode);
        childY += childNode.height + 4;
      }
    } else if (child.nodeType === NodeType.TEXT_NODE) {
      const text = (child as TextNode).text?.trim();
      if (text) {
        children.push({
          type: 'TEXT',
          name: 'text',
          x: 0,
          y: childY,
          width,
          height: 24,
          characters: text,
          fontSize: HEADING_FONT_SIZES[tag] || 16,
        });
        childY += 28;
      }
    }
  }

  // Recalculate height based on children if needed
  const computedHeight = children.length > 0 ? Math.max(height, childY) : height;

  const node: FigmaNode = {
    type: children.length > 0 ? 'FRAME' : 'RECTANGLE',
    name,
    x,
    y,
    width,
    height: computedHeight,
  };
  if (fills.length > 0) node.fills = fills;
  if (strokes.length > 0) node.strokes = strokes;
  if (cornerRadius !== undefined) node.cornerRadius = cornerRadius;
  if (effects.length > 0) node.effects = effects;
  if (children.length > 0) node.children = children;

  return node;
}

// ── Helpers ──

function parseFontWeight(weight: string | undefined): number | undefined {
  if (!weight) return undefined;
  const num = parseInt(weight);
  if (!isNaN(num)) return num;
  const map: Record<string, number> = {
    thin: 100, hairline: 100, extralight: 200, ultralight: 200,
    light: 300, normal: 400, regular: 400, medium: 500,
    semibold: 600, demibold: 600, bold: 700, extrabold: 800,
    ultrabold: 800, black: 900, heavy: 900,
  };
  return map[weight.toLowerCase()] || undefined;
}
