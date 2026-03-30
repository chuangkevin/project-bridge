import { GoogleGenerativeAI } from '@google/generative-ai';
import { assignBatchKeys, getGeminiModel, markKeyBad } from './geminiKeys';

export async function analyzeUrlStyles(urls: string[]): Promise<{
  tokens: Record<string, any>;
  analysis: string;
  convention: string;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const siteData: string[] = [];

  for (const url of urls.slice(0, 3)) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(15000),
      });
      const html = await res.text();

      // Extract style tags
      const styleTags = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
      let cssContent = styleTags.map(s => s.replace(/<\/?style[^>]*>/gi, '')).join('\n');

      // Fetch external CSS files (up to 3)
      const cssLinks = html.match(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi) || [];
      for (const link of cssLinks.slice(0, 3)) {
        const href = link.match(/href=["']([^"']+)["']/)?.[1];
        if (href) {
          try {
            const cssUrl = href.startsWith('http') ? href : new URL(href, url).href;
            const cssRes = await fetch(cssUrl, { signal: AbortSignal.timeout(5000) });
            const css = await cssRes.text();
            cssContent += '\n' + css.slice(0, 5000); // cap at 5K per file
          } catch { /* skip failed CSS */ }
        }
      }

      // Extract colors from CSS
      const colors = [...new Set((cssContent.match(/#[0-9a-fA-F]{3,8}/g) || []))].slice(0, 30);
      const rgbColors = [...new Set((cssContent.match(/rgb\([^)]+\)/g) || []))].slice(0, 10);
      const fonts = [...new Set((cssContent.match(/font-family:\s*([^;}{]+)/gi) || []))].slice(0, 5);

      // Extract meta theme-color
      const themeColor = html.match(/<meta[^>]*name=["']theme-color["'][^>]*content=["']([^"']+)["']/i)?.[1];

      // Get the visible HTML structure (strip scripts, keep structure)
      const visibleHtml = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
        .slice(0, 8000); // send first 8K of visible HTML to AI

      siteData.push(`=== ${url} ===
Theme color: ${themeColor || 'none'}
Colors in CSS (${colors.length}): ${colors.join(', ')}
RGB colors: ${rgbColors.join(', ')}
Fonts: ${fonts.join('; ')}
CSS excerpt (first 3000 chars):
${cssContent.slice(0, 3000)}

HTML structure excerpt:
${visibleHtml.slice(0, 3000)}`);

      console.log(`[url-analyzer] ${url}: ${html.length} chars HTML, ${cssContent.length} chars CSS, ${colors.length} colors`);
    } catch (e: any) {
      warnings.push(`${url}: ${e.message?.slice(0, 50) || 'fetch failed'}`);
      console.warn(`[url-analyzer] Failed: ${url}:`, e.message?.slice(0, 50));
    }
  }

  if (siteData.length === 0) {
    throw new Error('No URLs could be analyzed');
  }

  // Send to Gemini for synthesis
  const keys = assignBatchKeys(5);
  for (const key of keys) {
    try {
      const genai = new GoogleGenerativeAI(key);
      const model = genai.getGenerativeModel({
        model: getGeminiModel(),
        generationConfig: { maxOutputTokens: 8192, temperature: 0.2, responseMimeType: 'application/json' },
      });
      const prompt = `你是 UI/UX 設計分析師。分析以下網站的設計風格，提取設計系統。

${siteData.join('\n\n')}

根據 CSS、HTML 結構和色彩分析，回傳 JSON：
{
  "tokens": {
    "primaryColor": "#hex（品牌主色，從 theme-color 或最常用的非灰色）",
    "secondaryColor": "#hex（輔助色）",
    "backgroundColor": "#hex（頁面背景色）",
    "surfaceColor": "#hex（卡片/區塊背景色）",
    "textColor": "#hex（主要文字色）",
    "fontFamily": "完整的 font-family stack",
    "borderRadius": number（主要元素的圓角 px）,
    "spacing": "緊密|正常|寬鬆",
    "shadowStyle": "無|輕柔|中等|強烈"
  },
  "analysis": "用繁體中文 3-5 行描述這個網站的設計特色：色彩運用、排版風格、整體感覺、設計語言",
  "convention": "用繁體中文寫一份設計規範（300+ 字）：色彩使用規則、字體層級、元件風格（按鈕/卡片/表單）、間距慣例、禁止事項"
}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const parsed = JSON.parse(text);
      console.log('[url-analyzer] AI analysis complete, primary:', parsed.tokens?.primaryColor);
      return { ...parsed, warnings };
    } catch (e: any) {
      console.warn('[url-analyzer] AI failed:', e.message?.slice(0, 50));
      markKeyBad(key);
    }
  }
  throw new Error('AI analysis failed after 3 retries');
}
