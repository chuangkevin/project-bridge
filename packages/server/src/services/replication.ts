/**
 * replication — intake helpers for the 照抄 pipeline (design-replication spec).
 *
 * Replication context flows in two shapes:
 *  - image attachments → inline image parts riding the generation call
 *    (OpenCode multimodal first; geminiVisionQuery is the text-spec fallback)
 *  - URLs → Playwright-cleaned HTML + computed-style summary in the prompt
 */
import type Database from 'better-sqlite3';
import { readAttachmentBytes, type Attachment } from './ingestionService.js';
import {
  getBrowser, getCrawlerContextOptions, applyCrawlerStealth, looksForbiddenHtml,
  crawlWebsite,
} from './websiteCrawler.js';

export interface ReplicationIntent {
  intent: 'replicate' | 'style-only' | 'reference';
  destination?: 'new' | 'element';
  elementPath?: number[];
}

export function parseReplicationIntent(raw: unknown): ReplicationIntent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.intent !== 'replicate' && o.intent !== 'style-only' && o.intent !== 'reference') return null;
  const destination = o.destination === 'element' ? 'element' : 'new';
  const elementPath = Array.isArray(o.elementPath)
    && o.elementPath.length > 0
    && o.elementPath.every((n) => Number.isInteger(n) && (n as number) >= 0)
    ? (o.elementPath as number[])
    : undefined;
  return { intent: o.intent, destination, elementPath };
}

/** First http(s) URL in free text (free text, not a structured format — regex is appropriate here). */
export function detectFirstUrl(text: string): string | null {
  const m = /https?:\/\/[^\s<>"')\]]+/i.exec(text);
  return m ? m[0] : null;
}

export interface InlineImagePart { type: 'inline'; mimeType: string; data: string }

const MAX_REPLICATION_IMAGES = 4;

/** Convert image attachments into inline image parts for the generation call. */
export function imagesFromAttachments(dataDir: string, attachments: Attachment[]): InlineImagePart[] {
  const out: InlineImagePart[] = [];
  for (const a of attachments) {
    if (a.kind !== 'image') continue;
    if (out.length >= MAX_REPLICATION_IMAGES) break;
    try {
      const bytes = readAttachmentBytes(dataDir, a);
      out.push({ type: 'inline', mimeType: a.mimeType || 'image/png', data: bytes.toString('base64') });
    } catch (e) {
      console.warn(`[replication] failed to read image attachment ${a.id}:`, (e as Error).message);
    }
  }
  return out;
}

const HTML_CAP = 30_000;

export interface CrawledReplicationSource {
  url: string;
  /** Cleaned page HTML, capped at 30K chars. */
  html: string;
  /** Compact computed-style summary (colors/typography/buttons). */
  styleSummary: string;
}

/**
 * Crawl a URL for replication: inline stylesheets, strip scripts/handlers,
 * return cleaned HTML + computed-style summary. Throws with a 繁中 message on
 * forbidden/unreachable pages — caller reports, never silently substitutes.
 */
export async function crawlForReplication(url: string): Promise<CrawledReplicationSource> {
  const parsed = new URL(url); // throws on malformed input
  const browser = await getBrowser();
  const context = await browser.newContext(getCrawlerContextOptions());
  try {
    const page = await context.newPage();
    await applyCrawlerStealth(page);
    const response = await page.goto(parsed.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

    const initialHtml = await page.content();
    if ((response && response.status() === 403) || looksForbiddenHtml(initialHtml)) {
      throw new Error('目標網站拒絕爬取，無法照抄。請改用可公開存取的頁面。');
    }

    // Inline external stylesheets so the HTML carries its own look.
    await page.evaluate(async () => {
      const linkEls = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
      for (const link of linkEls) {
        const href = (link as HTMLLinkElement).href;
        if (!href) continue;
        try {
          const resp = await fetch(href);
          if (resp.ok) {
            const style = document.createElement('style');
            style.textContent = await resp.text();
            link.parentNode?.replaceChild(style, link);
          }
        } catch { /* skip */ }
      }
    });
    await page.evaluate(() => {
      document.querySelectorAll('script, noscript, iframe').forEach(el => el.remove());
    });

    const html = (await page.content()).slice(0, HTML_CAP);

    // Computed-style summary via the existing crawler (time-boxed).
    let styleSummary = '';
    try {
      const tokens = await Promise.race([
        crawlWebsite(parsed.href),
        new Promise<{ success: false }>((resolve) => setTimeout(() => resolve({ success: false } as never), 50000)), // goto 已放寬到 45s，15s 必輸
      ]);
      if ((tokens as { success: boolean }).success) {
        const t = tokens as Record<string, unknown>;
        styleSummary = JSON.stringify({
          colors: t.colors, typography: t.typography, buttons: t.buttons,
          backgrounds: t.backgrounds, borderRadii: t.borderRadii, shadows: t.shadows,
        }).slice(0, 6_000);
      }
    } catch { /* style summary is best-effort */ }

    return { url: parsed.href, html, styleSummary };
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** Prompt section for a crawled replication source. */
export function crawledSourceBlock(source: CrawledReplicationSource): string {
  return [
    `## 照抄來源（${source.url}）`,
    '以下為目標頁面清理後的 HTML（截斷）與 computed style 摘要。重建時以此為準。',
    '```html',
    source.html,
    '```',
    ...(source.styleSummary ? ['Computed style 摘要：', '```json', source.styleSummary, '```'] : []),
  ].join('\n');
}

/** 雙保險: appended when intake media exists but the user picked no intent. */
export const REPLICATE_CONFIRM_INSTRUCTION =
  '使用者附上了圖片或網址，但尚未表明是否要照抄。在回覆的開頭先用一句話確認意圖' +
  '（照抄 / 只取風格 / 只當參考），未經確認不要直接產出照抄結果。';

export const STYLE_ONLY_INSTRUCTION =
  '使用者提供的圖片/網址僅供擷取整體風格（色彩、字體、質感、圓角、陰影），不要複製其版面結構或內容。';

export const REFERENCE_ONLY_INSTRUCTION =
  '使用者提供的圖片/網址僅作為討論參考，不需照抄其設計。';

/** Vision-spec prompt for the geminiVisionQuery fallback path. */
export const REPLICATION_SPEC_PROMPT =
  '你是 UI 重建規格員。仔細觀察圖片，輸出可供工程師像素級重建的規格：' +
  '版面結構（由上而下逐區塊，含欄數/對齊/間距估計）、每個元件（型態/文案/狀態）、' +
  '色彩（實際 hex）、字體（家族/字級/字重層級）、圓角、陰影、邊框。用條列繁體中文輸出。';
