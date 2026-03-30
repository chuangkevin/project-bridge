import { GoogleGenerativeAI } from '@google/generative-ai';
import { assignBatchKeys, getGeminiModel, markKeyBad } from './geminiKeys';

export async function analyzeUrlStyles(urls: string[]): Promise<{
  tokens: Record<string, any>;
  analysis: string;
  convention: string;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const extractedStyles: string[] = [];

  for (const url of urls.slice(0, 3)) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 DesignBridge/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();
      // Extract style tags
      const styles = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) || [];
      const inlineStyles = html.match(/style="([^"]{20,})"/g) || [];
      // Extract color values
      const colors = html.match(/#[0-9a-fA-F]{3,8}/g) || [];
      const uniqueColors = [...new Set(colors)].slice(0, 20);
      // Extract font families
      const fonts = html.match(/font-family:\s*([^;}{]+)/gi) || [];
      const uniqueFonts = [...new Set(fonts)].slice(0, 5);

      extractedStyles.push(`URL: ${url}
Colors found: ${uniqueColors.join(', ')}
Fonts: ${uniqueFonts.join('; ')}
Style blocks: ${styles.length}
Sample styles: ${styles.slice(0, 2).map(s => s.slice(0, 300)).join('\n')}
Inline styles sample: ${inlineStyles.slice(0, 5).join('\n')}`);
    } catch (e: any) {
      warnings.push(`${url}: ${e.message?.slice(0, 50) || 'fetch failed'}`);
    }
  }

  if (extractedStyles.length === 0) {
    throw new Error('No URLs could be analyzed');
  }

  // Send to Gemini for synthesis
  const keys = assignBatchKeys(3);
  for (const key of keys) {
    try {
      const genai = new GoogleGenerativeAI(key);
      const model = genai.getGenerativeModel({
        model: getGeminiModel(),
        generationConfig: { maxOutputTokens: 3000, temperature: 0.2, responseMimeType: 'application/json' },
      });
      const prompt = `Analyze these website styles and extract a unified design system.

${extractedStyles.join('\n\n---\n\n')}

Return JSON:
{
  "tokens": {
    "primaryColor": "#hex",
    "secondaryColor": "#hex",
    "backgroundColor": "#hex",
    "surfaceColor": "#hex",
    "textColor": "#hex",
    "fontFamily": "font stack",
    "borderRadius": number,
    "spacing": "緊密|正常|寬鬆",
    "shadowStyle": "無|輕柔|中等|強烈"
  },
  "analysis": "繁體中文 2-3 段落描述這個設計風格的特色、色彩運用、整體感覺",
  "convention": "A comprehensive design convention text (in Traditional Chinese) that describes: color usage rules, typography hierarchy, component patterns, spacing conventions, and what to avoid. Should be 500+ chars."
}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const parsed = JSON.parse(text);
      return { ...parsed, warnings };
    } catch (e: any) {
      markKeyBad(key);
    }
  }
  throw new Error('AI analysis failed after retries');
}
