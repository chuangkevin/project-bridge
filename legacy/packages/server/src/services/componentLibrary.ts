import { chromium, Browser } from 'playwright';

let browserInstance: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await chromium.launch({ headless: true });
  }
  return browserInstance;
}

/**
 * Render HTML+CSS as a 400x300 thumbnail, return base64 PNG.
 */
export async function renderThumbnail(html: string, css: string): Promise<string> {
  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: { width: 400, height: 300 } });
  const page = await context.newPage();

  const fullHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fff; overflow: hidden; }
${css}
</style></head><body>${html}</body></html>`;

  await page.setContent(fullHtml, { waitUntil: 'networkidle', timeout: 8000 });
  const buf = await page.screenshot({ type: 'png' });
  await context.close();
  return buf.toString('base64');
}

/**
 * Strip script tags, on* event handlers, iframe tags from HTML.
 */
export function sanitizeHtml(html: string): string {
  let result = html;
  // Remove <script>...</script> (including multiline)
  result = result.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  // Remove self-closing <script ... />
  result = result.replace(/<script\b[^>]*\/>/gi, '');
  // Remove <iframe>...</iframe>
  result = result.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
  // Remove self-closing <iframe ... />
  result = result.replace(/<iframe\b[^>]*\/>/gi, '');
  // Remove on* event handlers from tags
  result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  return result;
}

/**
 * Prefix all CSS selectors with `.comp-{componentId}` wrapper.
 */
export function scopeCss(css: string, componentId: string): string {
  const prefix = `.comp-${componentId}`;
  return css.replace(
    /([^{}@]+)\{/g,
    (_match: string, selectors: string) => {
      // Don't prefix @-rules
      if (selectors.trim().startsWith('@')) {
        return `${selectors}{`;
      }
      const scoped = selectors
        .split(',')
        .map((sel: string) => {
          const trimmed = sel.trim();
          if (!trimmed) return sel;
          if (trimmed.startsWith(prefix)) return sel;
          // Replace body/html selectors with prefix
          if (trimmed === 'body' || trimmed === 'html') return ` ${prefix}`;
          return ` ${prefix} ${trimmed}`;
        })
        .join(',');
      return `${scoped}{`;
    }
  );
}

/**
 * Close the shared browser instance (for graceful shutdown).
 */
export async function closeComponentBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}
