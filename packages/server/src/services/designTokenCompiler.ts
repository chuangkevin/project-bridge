/**
 * designTokenCompiler.ts — multi-source design token compilation.
 *
 * Merges tokens from:
 *   Layer 1 (lowest priority): crawled website styles
 *   Layer 2: spec document analysis from attachments
 *   Layer 3: reference image visual analysis from attachments
 *   Layer 4: manual overrides (highest priority)
 *
 * Output: DesignTokens — a typed object covering colors/typography/spacing/
 * border-radius/shadows/components. Also exports tokensToCssVariables().
 */
import type Database from 'better-sqlite3';
import { aggregateStyles, type AggregatedDesignSystem, type CrawledStyles } from './websiteCrawler.js';

export interface DesignTokens {
  colors: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    error: string;
    success: string;
    accent: string;
  };
  typography: {
    fontFamily: string;
    h1: { size: string; weight: string; lineHeight: string };
    h2: { size: string; weight: string; lineHeight: string };
    h3: { size: string; weight: string; lineHeight: string };
    body: { size: string; weight: string; lineHeight: string };
    small: { size: string; weight: string; lineHeight: string };
  };
  spacing: { xs: string; sm: string; md: string; lg: string; xl: string; xxl: string };
  borderRadius: { sm: string; md: string; lg: string; xl: string; full: string };
  shadows: { sm: string; md: string; lg: string };
  components: {
    button: { height: string; paddingX: string; radius: string; fontSize: string } | null;
    input: { height: string; paddingX: string; radius: string; fontSize: string; borderWidth: string } | null;
    card: { padding: string; radius: string; shadow: string } | null;
  };
  source: {
    referenceImages: string[];
    specDocuments: string[];
    crawledUrls: string[];
  };
  manualOverrides: Record<string, boolean>;
}

const DEFAULTS: DesignTokens = {
  colors: {
    primary: '#3B82F6',
    primaryLight: '#60A5FA',
    primaryDark: '#2563EB',
    secondary: '#6B7280',
    background: '#F9FAFB',
    surface: '#FFFFFF',
    text: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    error: '#DC2626',
    success: '#16A34A',
    accent: '#F97316',
  },
  typography: {
    fontFamily: '"Noto Sans TC", "Helvetica Neue", sans-serif',
    h1: { size: '28px', weight: '700', lineHeight: '1.3' },
    h2: { size: '22px', weight: '600', lineHeight: '1.4' },
    h3: { size: '18px', weight: '600', lineHeight: '1.5' },
    body: { size: '15px', weight: '400', lineHeight: '1.6' },
    small: { size: '13px', weight: '400', lineHeight: '1.5' },
  },
  spacing: { xs: '4px', sm: '8px', md: '16px', lg: '24px', xl: '32px', xxl: '48px' },
  borderRadius: { sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px' },
  shadows: {
    sm: '0 1px 2px rgba(0,0,0,0.05)',
    md: '0 4px 6px rgba(0,0,0,0.07)',
    lg: '0 10px 15px rgba(0,0,0,0.1)',
  },
  components: { button: null, input: null, card: null },
  source: { referenceImages: [], specDocuments: [], crawledUrls: [] },
  manualOverrides: {},
};

function lightenColor(hex: string, amount = 0.3): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.min(255, Math.round(r + (255 - r) * amount));
  const lg = Math.min(255, Math.round(g + (255 - g) * amount));
  const lb = Math.min(255, Math.round(b + (255 - b) * amount));
  return '#' + [lr, lg, lb].map(v => v.toString(16).padStart(2, '0')).join('');
}

function darkenColor(hex: string, amount = 0.2): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.max(0, Math.round(r * (1 - amount)));
  const dg = Math.max(0, Math.round(g * (1 - amount)));
  const db = Math.max(0, Math.round(b * (1 - amount)));
  return '#' + [dr, dg, db].map(v => v.toString(16).padStart(2, '0')).join('');
}

function isNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return (max - min) < 30;
}

function tokensFromCrawl(crawlData: AggregatedDesignSystem): Partial<DesignTokens> {
  const tokens: any = { colors: {}, typography: {}, components: {}, source: { crawledUrls: crawlData.urls } };

  const colorCandidates = crawlData.colors.filter(c =>
    !isNeutral(c.value) && c.value !== '#ffffff' && c.value !== '#000000'
  );
  if (colorCandidates.length > 0) {
    tokens.colors.primary = colorCandidates[0].value;
    tokens.colors.primaryLight = lightenColor(colorCandidates[0].value);
    tokens.colors.primaryDark = darkenColor(colorCandidates[0].value);
    if (colorCandidates.length > 1) tokens.colors.accent = colorCandidates[1].value;
    if (colorCandidates.length > 2) tokens.colors.secondary = colorCandidates[2].value;
  }

  const neutrals = crawlData.colors.filter(c => isNeutral(c.value) && c.value !== '#000000');
  const lightNeutrals = neutrals.filter(c => parseInt(c.value.slice(1, 3), 16) > 200);
  if (lightNeutrals.length > 0) tokens.colors.background = lightNeutrals[0].value;

  const darkNeutrals = crawlData.colors.filter(c => {
    const r = parseInt(c.value.slice(1, 3), 16);
    return r < 100 && c.value !== '#000000';
  });
  if (darkNeutrals.length > 0) tokens.colors.text = darkNeutrals[0].value;

  if (crawlData.typography.primaryFont) {
    tokens.typography.fontFamily = `"${crawlData.typography.primaryFont}", sans-serif`;
  }
  for (const h of crawlData.typography.headingStyles) {
    const key = h.tag as 'h1' | 'h2' | 'h3';
    if (['h1', 'h2', 'h3'].includes(h.tag)) {
      tokens.typography[key] = { size: h.fontSize, weight: h.fontWeight, lineHeight: '1.4' };
    }
  }

  if (crawlData.components.button) {
    tokens.components.button = {
      height: '40px',
      paddingX: crawlData.components.button.padding?.split(' ').pop() || '16px',
      radius: crawlData.components.button.borderRadius || '8px',
      fontSize: crawlData.components.button.fontSize || '14px',
    };
  }
  if (crawlData.components.input) {
    tokens.components.input = {
      height: crawlData.components.input.height || '44px',
      paddingX: '12px',
      radius: crawlData.components.input.borderRadius || '8px',
      fontSize: crawlData.components.input.fontSize || '14px',
      borderWidth: '1px',
    };
  }

  if (crawlData.borderRadius.length > 0) {
    const radii = crawlData.borderRadius.map(r => parseInt(r) || 8).filter(r => r > 0).sort((a, b) => a - b);
    if (radii.length >= 2) {
      tokens.borderRadius = {
        sm: `${radii[0]}px`,
        md: `${radii[Math.floor(radii.length / 2)]}px`,
        lg: `${radii[radii.length - 1]}px`,
      };
    }
  }

  return tokens;
}

function tokensFromSpec(analysis: any): Partial<DesignTokens> {
  const tokens: any = { components: {} };
  if (analysis.globalStyles) {
    const gs = analysis.globalStyles;
    if (gs.primaryColor) tokens.colors = { primary: gs.primaryColor };
    if (gs.secondaryColor) tokens.colors = { ...tokens.colors, secondary: gs.secondaryColor };
    if (gs.backgroundColor) tokens.colors = { ...tokens.colors, background: gs.backgroundColor };
  }
  return tokens;
}

function tokensFromImage(visualAnalysis: string): Partial<DesignTokens> {
  const tokens: any = { colors: {} };

  const hexMatches = visualAnalysis.match(/#[0-9a-fA-F]{6}/g) || [];
  if (hexMatches.length > 0) {
    const primary = hexMatches[0]!;
    tokens.colors.primary = primary;
    tokens.colors.primaryLight = lightenColor(primary);
    tokens.colors.primaryDark = darkenColor(primary);
    if (hexMatches.length > 1) tokens.colors.secondary = hexMatches[1];
    if (hexMatches.length > 2) tokens.colors.accent = hexMatches[2];
  }

  const fontMatch = visualAnalysis.match(/font[- ]?family[:\s]+"?([^";\n]+)/i);
  if (fontMatch) {
    tokens.typography = { fontFamily: fontMatch[1].trim() };
  }

  return tokens;
}

function deepMerge(target: any, source: any): any {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] === null || source[key] === undefined) continue;
    if (typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * Compile design tokens for a project from all available sources.
 * Priority (lowest → highest): crawled sites → spec docs → images → manual.
 */
export async function compileDesignTokens(db: Database.Database, projectId: string): Promise<DesignTokens> {
  let tokens: DesignTokens = JSON.parse(JSON.stringify(DEFAULTS));

  // Load existing manual overrides
  const existing = db.prepare('SELECT design_tokens FROM projects WHERE id = ?').get(projectId) as any;
  let manualOverrides: Record<string, boolean> = {};
  if (existing?.design_tokens) {
    try {
      const prev = JSON.parse(existing.design_tokens);
      manualOverrides = prev.manualOverrides || {};
    } catch { /* ignore */ }
  }

  // Layer 1: Crawled websites (lowest priority)
  const crawlRows = db.prepare(
    "SELECT key, value FROM settings WHERE key LIKE ?"
  ).all(`crawl_${projectId}_%`) as { key: string; value: string }[];

  if (crawlRows.length > 0) {
    const crawlResults: CrawledStyles[] = [];
    for (const row of crawlRows) {
      try { crawlResults.push(JSON.parse(row.value)); } catch { /* skip */ }
    }
    if (crawlResults.length > 0) {
      const aggregated = aggregateStyles(crawlResults);
      const crawlTokens = tokensFromCrawl(aggregated);
      tokens = deepMerge(tokens, crawlTokens);
      tokens.source.crawledUrls = aggregated.urls;
    }
  }

  // Layer 2: Spec document analysis (medium priority)
  // M1 attachments don't have analysis_result, but we check visual_analysis text for spec-like structure
  const attachmentRows = db.prepare(
    "SELECT id, visual_analysis FROM attachments WHERE project_id = ? AND visual_analysis IS NOT NULL AND LENGTH(visual_analysis) > 50"
  ).all(projectId) as { id: string; visual_analysis: string }[];

  // Try to parse visual_analysis as JSON (spec-style) first, then fall back to text extraction
  for (const row of attachmentRows) {
    let handled = false;
    try {
      const analysis = JSON.parse(row.visual_analysis);
      if (analysis.globalStyles) {
        const specTokens = tokensFromSpec(analysis);
        tokens = deepMerge(tokens, specTokens);
        tokens.source.specDocuments.push(row.id);
        handled = true;
      }
    } catch { /* not JSON — fall through to text extraction */ }

    if (!handled) {
      const imageTokens = tokensFromImage(row.visual_analysis);
      tokens = deepMerge(tokens, imageTokens);
      tokens.source.referenceImages.push(row.id);
    }
  }

  // Layer 3: Manual overrides (highest priority)
  if (existing?.design_tokens) {
    try {
      const prev = JSON.parse(existing.design_tokens);
      for (const path of Object.keys(manualOverrides)) {
        if (!manualOverrides[path]) continue;
        const parts = path.split('.');
        let src: any = prev;
        let dst: any = tokens;
        for (let i = 0; i < parts.length - 1; i++) {
          src = src?.[parts[i]];
          dst = dst?.[parts[i]];
        }
        const lastKey = parts[parts.length - 1];
        if (src && dst && src[lastKey] !== undefined) {
          dst[lastKey] = src[lastKey];
        }
      }
    } catch { /* skip */ }
  }

  tokens.manualOverrides = manualOverrides;

  // Ensure primaryLight and primaryDark derive from primary
  if (tokens.colors.primary && !manualOverrides['colors.primaryLight']) {
    tokens.colors.primaryLight = lightenColor(tokens.colors.primary);
  }
  if (tokens.colors.primary && !manualOverrides['colors.primaryDark']) {
    tokens.colors.primaryDark = darkenColor(tokens.colors.primary);
  }

  // Persist
  db.prepare("UPDATE projects SET design_tokens = ?, updated_at = datetime('now') WHERE id = ?")
    .run(JSON.stringify(tokens), projectId);

  return tokens;
}

/** Convert design tokens to CSS :root variables string */
export function tokensToCssVariables(tokens: DesignTokens): string {
  const vars: string[] = [];
  for (const [key, value] of Object.entries(tokens.colors)) {
    vars.push(`  --${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value};`);
  }
  vars.push(`  --font-family: ${tokens.typography.fontFamily};`);
  for (const level of ['h1', 'h2', 'h3', 'body', 'small'] as const) {
    const t = tokens.typography[level];
    vars.push(`  --font-${level}-size: ${t.size};`);
    vars.push(`  --font-${level}-weight: ${t.weight};`);
    vars.push(`  --font-${level}-line-height: ${t.lineHeight};`);
  }
  for (const [key, value] of Object.entries(tokens.spacing)) {
    vars.push(`  --spacing-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(tokens.borderRadius)) {
    vars.push(`  --radius-${key}: ${value};`);
  }
  for (const [key, value] of Object.entries(tokens.shadows)) {
    vars.push(`  --shadow-${key}: ${value};`);
  }
  return `:root {\n${vars.join('\n')}\n}`;
}
