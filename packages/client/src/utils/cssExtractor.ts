export interface StyleToken {
  name: string;       // CSS variable name (e.g. '--primary-color') or synthetic key
  label: string;      // Human-readable label
  value: string;      // Current value
  type: 'color' | 'size' | 'font';
  min?: number;
  max?: number;
}

function classifyType(name: string, value: string): StyleToken['type'] {
  const lowerName = name.toLowerCase();
  const lowerVal = value.toLowerCase().trim();

  if (lowerName.includes('font') || lowerName.includes('family')) return 'font';
  if (/^#([0-9a-f]{3}){1,2}$/i.test(lowerVal)) return 'color';
  if (/^rgb\(|^hsl\(|^rgba\(|^hsla\(/.test(lowerVal)) return 'color';
  if (/\d+(px|rem|em)$/.test(lowerVal)) return 'size';
  return 'color';
}

function inferSizeRange(name: string): { min: number; max: number } {
  const lower = name.toLowerCase();
  if (lower.includes('radius')) return { min: 0, max: 24 };
  if (lower.includes('font') || lower.includes('size')) return { min: 10, max: 32 };
  return { min: 0, max: 64 };
}

function toLabel(name: string): string {
  return name
    .replace(/^--/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function extractFromStyleTags(html: string): StyleToken[] {
  const tokens: StyleToken[] = [];
  const styleTagRe = /<style(?![^>]*id=["']__tweaker__["'])[^>]*>([\s\S]*?)<\/style>/gi;
  const cssVarRe = /(--[\w-]+)\s*:\s*([^;}\n]+)/g;

  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = styleTagRe.exec(html)) !== null) {
    const cssContent = styleMatch[1];
    let varMatch: RegExpExecArray | null;
    while ((varMatch = cssVarRe.exec(cssContent)) !== null) {
      const name = varMatch[1].trim();
      const value = varMatch[2].trim();
      if (!tokens.find(t => t.name === name)) {
        const type = classifyType(name, value);
        const range = type === 'size' ? inferSizeRange(name) : {};
        tokens.push({ name, label: toLabel(name), value, type, ...range });
      }
    }
  }
  return tokens;
}

function extractFallback(html: string): StyleToken[] {
  const tokens: StyleToken[] = [];
  const colorFreq: Record<string, number> = {};
  const colorRe = /(?:background-color|color)\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/g;
  let m: RegExpExecArray | null;
  while ((m = colorRe.exec(html)) !== null) {
    const c = m[1].trim();
    colorFreq[c] = (colorFreq[c] || 0) + 1;
  }

  const topColors = Object.entries(colorFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  topColors.forEach(([value], i) => {
    tokens.push({
      name: `--fallback-color-${i + 1}`,
      label: `顏色 ${i + 1}`,
      value,
      type: 'color',
    });
  });

  // Try border-radius
  const brRe = /border-radius\s*:\s*(\d+)px/g;
  const brValues: number[] = [];
  while ((m = brRe.exec(html)) !== null) {
    brValues.push(Number(m[1]));
  }
  if (brValues.length > 0) {
    const mostCommon = brValues.sort((a, b) =>
      brValues.filter(v => v === b).length - brValues.filter(v => v === a).length
    )[0];
    tokens.push({
      name: '--fallback-border-radius',
      label: '圓角',
      value: `${mostCommon}px`,
      type: 'size',
      min: 0,
      max: 24,
    });
  }

  return tokens.slice(0, 6);
}

export function extractStyleTokens(html: string): StyleToken[] {
  const fromVars = extractFromStyleTags(html);
  if (fromVars.length > 0) return fromVars;
  return extractFallback(html);
}

/** Build a CSS :root block from a token map (name → value) */
export function buildCssOverride(overrides: Record<string, string>): string {
  const entries = Object.entries(overrides);
  if (entries.length === 0) return '';
  const body = entries.map(([k, v]) => `  ${k}: ${v};`).join('\n');
  return `:root {\n${body}\n}`;
}
