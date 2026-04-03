import { chromium, Browser } from 'playwright';

export interface CrawledStyles {
  url: string;
  success: boolean;
  error?: string;
  screenshot?: string; // base64
  colors: { value: string; count: number }[];
  typography: {
    fonts: { value: string; count: number }[];
    sizes: { value: string; count: number }[];
    headings: { tag: string; fontFamily: string; fontSize: string; fontWeight: string; color: string; lineHeight: string }[];
    body: { fontFamily: string; fontSize: string; fontWeight: string; color: string; lineHeight: string } | null;
  };
  buttons: { backgroundColor: string; color: string; fontSize: string; padding: string; borderRadius: string; fontWeight: string }[];
  inputs: { height: string; padding: string; borderRadius: string; borderWidth: string; fontSize: string }[];
  backgrounds: { element: string; color: string }[];
  borderRadii: { value: string; count: number }[];
  shadows: { value: string; count: number }[];
}

export interface AggregatedDesignSystem {
  crawledAt: string;
  urls: string[];
  colors: { value: string; count: number }[];
  typography: {
    primaryFont: string;
    secondaryFont: string | null;
    sizes: string[];
    headingStyles: { tag: string; fontSize: string; fontWeight: string }[];
  };
  spacing: string[];
  borderRadius: string[];
  shadows: string[];
  components: {
    button: { backgroundColor: string; color: string; fontSize: string; borderRadius: string; padding: string } | null;
    input: { height: string; borderRadius: string; fontSize: string } | null;
  };
}

let browserInstance: Browser | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({ headless: true });
  }
  return browserInstance;
}

export async function crawlWebsite(url: string): Promise<CrawledStyles> {
  let browser: Browser | null = null;
  try {
    // Validate URL
    new URL(url);
  } catch {
    return { url, success: false, error: 'invalid_url', colors: [], typography: { fonts: [], sizes: [], headings: [], body: null }, buttons: [], inputs: [], backgrounds: [], borderRadii: [], shadows: [] };
  }

  try {
    browser = await getBrowser();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

    // Take screenshot
    const screenshotBuffer = await page.screenshot({ fullPage: false });
    const screenshot = screenshotBuffer.toString('base64');

    // Extract styles via evaluate — callback runs in browser context
    const styles: any = await page.evaluate(`(() => {
      const colorMap = {};
      const fontMap = {};
      const sizeMap = {};
      const radiusMap = {};
      const shadowMap = {};

      function rgbToHex(rgb) {
        const match = rgb.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        if (!match) return rgb;
        const r = parseInt(match[1]), g = parseInt(match[2]), b = parseInt(match[3]);
        return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
      }

      function addColor(c) {
        if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return;
        const hex = rgbToHex(c).toLowerCase();
        if (hex.startsWith('#')) colorMap[hex] = (colorMap[hex] || 0) + 1;
      }

      const allElements = document.querySelectorAll('*');
      allElements.forEach(el => {
        const cs = getComputedStyle(el);
        addColor(cs.color);
        addColor(cs.backgroundColor);
        addColor(cs.borderColor);

        const font = cs.fontFamily.split(',')[0].trim().replace(/['"]/g, '');
        if (font) fontMap[font] = (fontMap[font] || 0) + 1;

        const size = cs.fontSize;
        if (size) sizeMap[size] = (sizeMap[size] || 0) + 1;

        const radius = cs.borderRadius;
        if (radius && radius !== '0px') radiusMap[radius] = (radiusMap[radius] || 0) + 1;

        const shadow = cs.boxShadow;
        if (shadow && shadow !== 'none') shadowMap[shadow] = (shadowMap[shadow] || 0) + 1;
      });

      const headings = [];
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].forEach(tag => {
        const el = document.querySelector(tag);
        if (el) {
          const cs = getComputedStyle(el);
          headings.push({
            tag,
            fontFamily: cs.fontFamily.split(',')[0].trim().replace(/['"]/g, ''),
            fontSize: cs.fontSize,
            fontWeight: cs.fontWeight,
            color: rgbToHex(cs.color),
            lineHeight: cs.lineHeight,
          });
        }
      });

      const bodyEl = document.querySelector('p') || document.querySelector('span');
      const bodyStyle = bodyEl ? (() => {
        const cs = getComputedStyle(bodyEl);
        return {
          fontFamily: cs.fontFamily.split(',')[0].trim().replace(/['"]/g, ''),
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          color: rgbToHex(cs.color),
          lineHeight: cs.lineHeight,
        };
      })() : null;

      const buttons = [];
      document.querySelectorAll('button, .btn, a.btn, [role="button"]').forEach(el => {
        const cs = getComputedStyle(el);
        const bg = rgbToHex(cs.backgroundColor);
        if (bg !== '#000000' && bg !== 'transparent') {
          buttons.push({
            backgroundColor: bg,
            color: rgbToHex(cs.color),
            fontSize: cs.fontSize,
            padding: cs.padding,
            borderRadius: cs.borderRadius,
            fontWeight: cs.fontWeight,
          });
        }
      });

      const inputs = [];
      document.querySelectorAll('input, select, textarea').forEach(el => {
        const cs = getComputedStyle(el);
        inputs.push({
          height: cs.height,
          padding: cs.padding,
          borderRadius: cs.borderRadius,
          borderWidth: cs.borderWidth,
          fontSize: cs.fontSize,
        });
      });

      const backgrounds = [];
      ['body', 'main', 'header', 'nav', 'footer', 'section', '.container'].forEach(sel => {
        const el = document.querySelector(sel);
        if (el) {
          const bg = rgbToHex(getComputedStyle(el).backgroundColor);
          if (bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
            backgrounds.push({ element: sel, color: bg });
          }
        }
      });

      function sortDesc(m) {
        return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
      }

      return {
        colors: sortDesc(colorMap).slice(0, 30),
        fonts: sortDesc(fontMap).slice(0, 5),
        sizes: sortDesc(sizeMap),
        headings,
        bodyStyle,
        buttons: buttons.slice(0, 10),
        inputs: inputs.slice(0, 5),
        backgrounds,
        borderRadii: sortDesc(radiusMap).slice(0, 10),
        shadows: sortDesc(shadowMap).slice(0, 5),
      };
    })()`);

    await context.close();

    return {
      url,
      success: true,
      screenshot,
      colors: styles.colors,
      typography: {
        fonts: styles.fonts,
        sizes: styles.sizes,
        headings: styles.headings,
        body: styles.bodyStyle,
      },
      buttons: styles.buttons,
      inputs: styles.inputs,
      backgrounds: styles.backgrounds,
      borderRadii: styles.borderRadii,
      shadows: styles.shadows,
    };
  } catch (err: any) {
    if (err.message?.includes('timeout') || err.message?.includes('Timeout')) {
      return { url, success: false, error: 'timeout', colors: [], typography: { fonts: [], sizes: [], headings: [], body: null }, buttons: [], inputs: [], backgrounds: [], borderRadii: [], shadows: [] };
    }
    if (err.message?.includes('net::ERR_') || err.message?.includes('NS_ERROR_')) {
      return { url, success: false, error: 'blocked', colors: [], typography: { fonts: [], sizes: [], headings: [], body: null }, buttons: [], inputs: [], backgrounds: [], borderRadii: [], shadows: [] };
    }
    return { url, success: false, error: err.message?.slice(0, 200) || 'unknown', colors: [], typography: { fonts: [], sizes: [], headings: [], body: null }, buttons: [], inputs: [], backgrounds: [], borderRadii: [], shadows: [] };
  }
}

export function aggregateStyles(results: CrawledStyles[]): AggregatedDesignSystem {
  const successResults = results.filter(r => r.success);

  // Merge colors across all pages
  const colorAgg: Record<string, number> = {};
  successResults.forEach(r => r.colors.forEach(c => { colorAgg[c.value] = (colorAgg[c.value] || 0) + c.count; }));
  const topColors = Object.entries(colorAgg).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([value, count]) => ({ value, count }));

  // Merge fonts
  const fontAgg: Record<string, number> = {};
  successResults.forEach(r => r.typography.fonts.forEach(f => { fontAgg[f.value] = (fontAgg[f.value] || 0) + f.count; }));
  const sortedFonts = Object.entries(fontAgg).sort((a, b) => b[1] - a[1]);
  const primaryFont = sortedFonts[0]?.[0] || 'sans-serif';
  const secondaryFont = sortedFonts[1]?.[0] || null;

  // Merge sizes
  const sizeSet = new Set<string>();
  successResults.forEach(r => r.typography.sizes.forEach(s => sizeSet.add(s.value)));
  const sizes = [...sizeSet].sort((a, b) => parseFloat(a) - parseFloat(b));

  // Heading styles (take first occurrence of each tag)
  const headingMap = new Map<string, { tag: string; fontSize: string; fontWeight: string }>();
  successResults.forEach(r => r.typography.headings.forEach(h => {
    if (!headingMap.has(h.tag)) headingMap.set(h.tag, { tag: h.tag, fontSize: h.fontSize, fontWeight: h.fontWeight });
  }));
  const headingStyles = [...headingMap.values()];

  // Border radii
  const radiusAgg: Record<string, number> = {};
  successResults.forEach(r => r.borderRadii.forEach(br => { radiusAgg[br.value] = (radiusAgg[br.value] || 0) + br.count; }));
  const borderRadius = Object.entries(radiusAgg).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([v]) => v);

  // Shadows
  const shadowAgg: Record<string, number> = {};
  successResults.forEach(r => r.shadows.forEach(s => { shadowAgg[s.value] = (shadowAgg[s.value] || 0) + s.count; }));
  const shadows = Object.entries(shadowAgg).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([v]) => v);

  // Most common button style
  const allButtons = successResults.flatMap(r => r.buttons);
  const button = allButtons.length > 0 ? {
    backgroundColor: allButtons[0].backgroundColor,
    color: allButtons[0].color,
    fontSize: allButtons[0].fontSize,
    borderRadius: allButtons[0].borderRadius,
    padding: allButtons[0].padding,
  } : null;

  // Most common input style
  const allInputs = successResults.flatMap(r => r.inputs);
  const input = allInputs.length > 0 ? {
    height: allInputs[0].height,
    borderRadius: allInputs[0].borderRadius,
    fontSize: allInputs[0].fontSize,
  } : null;

  // Spacing (extract from padding/margin patterns)
  const spacingSet = new Set<string>();
  ['4px', '8px', '12px', '16px', '20px', '24px', '32px', '48px'].forEach(s => spacingSet.add(s));

  return {
    crawledAt: new Date().toISOString(),
    urls: successResults.map(r => r.url),
    colors: topColors,
    typography: { primaryFont, secondaryFont, sizes, headingStyles },
    spacing: [...spacingSet],
    borderRadius,
    shadows,
    components: { button, input },
  };
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
