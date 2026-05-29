import * as cheerio from 'cheerio';

export interface ThemeProposalPalette { name?: string; value: string; source?: string; }
export interface ThemeProposalHeading { tag: string; fontSize: string; fontWeight: string; }
export interface ThemeProposalBody { fontFamily: string; fontSize: string; lineHeight?: string; }

export interface ThemeProposal {
  palette: ThemeProposalPalette[];
  typography: {
    primaryFont: string | null;
    secondaryFont: string | null;
    headings: ThemeProposalHeading[];
    body: ThemeProposalBody | null;
  };
  radius: string[];
  shadow: string[];
  source: string;
}

const HEX = /#[0-9a-f]{3,8}\b/gi;
const RGB = /rgba?\([^)]+\)/gi;
const FONT = /font-family\s*:\s*([^;\n}]+);?/gi;
const RADIUS = /border-radius\s*:\s*([^;\n}]+);?/gi;
const SHADOW = /box-shadow\s*:\s*([^;\n}]+);?/gi;

function rgbToHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  const [r, g, b] = [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toLowerCase();
}

function normHex(c: string): string {
  let h = c.toLowerCase();
  if (h.length === 4) {
    // expand #abc to #aabbcc
    h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  }
  return h.slice(0, 7);
}

export function extractTheme(params: { dom: string; css: string; sourceUrl: string }): ThemeProposal {
  const $ = cheerio.load(params.dom);
  const styles: string[] = [params.css];
  $('[style]').each((_, el) => styles.push($(el).attr('style') || ''));
  const allCss = styles.join('\n');

  const colorSet = new Set<string>();
  for (const m of allCss.matchAll(HEX)) colorSet.add(normHex(m[0]));
  for (const m of allCss.matchAll(RGB)) { const hex = rgbToHex(m[0]); if (hex) colorSet.add(hex); }

  const fontCounts = new Map<string, number>();
  for (const m of allCss.matchAll(FONT)) {
    const primary = m[1].split(',')[0].trim().replace(/['"]/g, '');
    if (primary && primary.length < 60) fontCounts.set(primary, (fontCounts.get(primary) ?? 0) + 1);
  }
  const sortedFonts = [...fontCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

  const headings: ThemeProposalHeading[] = [];
  for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
    const el = $(tag).first();
    if (!el.length) continue;
    const style = el.attr('style') || '';
    const fs = style.match(/font-size\s*:\s*([^;]+)/)?.[1]?.trim() || '';
    const fw = style.match(/font-weight\s*:\s*([^;]+)/)?.[1]?.trim() || '';
    if (fs || fw) headings.push({ tag, fontSize: fs, fontWeight: fw });
  }

  const bodyEl = $('body').first();
  const bodyStyle = bodyEl.attr('style') || '';
  const bodyFont = bodyStyle.match(/font-family\s*:\s*([^;]+)/)?.[1]?.split(',')[0]?.trim().replace(/['"]/g, '');
  const body: ThemeProposalBody | null = bodyFont
    ? {
        fontFamily: bodyFont,
        fontSize: bodyStyle.match(/font-size\s*:\s*([^;]+)/)?.[1]?.trim() || '16px',
        lineHeight: bodyStyle.match(/line-height\s*:\s*([^;]+)/)?.[1]?.trim(),
      }
    : null;

  const radii = new Set<string>();
  for (const m of allCss.matchAll(RADIUS)) {
    for (const v of m[1].trim().split(/\s+/)) {
      if (/^\d+(\.\d+)?(px|rem|em|%)$/.test(v)) radii.add(v);
    }
  }
  const shadows = new Set<string>();
  for (const m of allCss.matchAll(SHADOW)) {
    const v = m[1].trim();
    if (v && v !== 'none') shadows.add(v);
  }

  return {
    palette: [...colorSet].slice(0, 20).map(value => ({ value, source: params.sourceUrl })),
    typography: { primaryFont: sortedFonts[0] ?? null, secondaryFont: sortedFonts[1] ?? null, headings, body },
    radius: [...radii].slice(0, 8),
    shadow: [...shadows].slice(0, 5),
    source: params.sourceUrl,
  };
}
