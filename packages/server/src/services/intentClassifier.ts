import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiModel, trackUsage } from './geminiKeys';
import { TtlCache } from '../utils/cache';

const intentCache = new TtlCache<string>('intent', 5 * 60 * 1000); // 5 min

export type Intent = 'full-page' | 'in-shell' | 'component' | 'question' | 'micro-adjust';

export async function classifyIntent(
  message: string,
  apiKey: string,
  hasShell: boolean = false
): Promise<Intent> {
  // Cache key: first 100 chars of message + context flags
  const cacheKey = `${message.slice(0, 100)}|${hasShell}`;
  const cached = intentCache.get(cacheKey);
  if (cached) {
    console.log(`[intent] Cache HIT: "${message.slice(0, 30)}..." → ${cached}`);
    return cached as Intent;
  }

  const shellContext = hasShell
    ? `This project has a platform shell (existing nav/sidebar/header). When the user asks to add a page, sub-page, detail page, list page, or feature, prefer "in-shell". Only use "full-page" if the user explicitly asks for a complete standalone page.`
    : `This project has NO platform shell, so "in-shell" is not available.`;

  try {
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({
      model: getGeminiModel(),
      systemInstruction: `Classify the user message into one of five intents. Reply with ONLY one word.

Intents:
- "question": asking about specs, design, existing prototype, or general questions
- "component": requesting a UI component/widget in isolation (card, modal, dialog, form, table, badge, tag, chip, dropdown, picker, button group, tooltip)
- "micro-adjust": requesting a small visual tweak to an existing prototype — color change, font size, spacing, border, shadow, show/hide element, alignment fix. NOT a full page redesign.
- "full-page": requesting a complete standalone page with its own nav/layout, or explicit FULL redesign
- "in-shell": requesting a new sub-page, feature page, detail page, or content area within an existing platform

${shellContext}

Keywords for micro-adjust: 變大, 變小, 顏色改, 改顏色, change color, add padding, 字體, 間距, 背景色, 粗體, 邊框, 圓角, margin, font size, bigger, smaller, wider, narrower, 加陰影, 移除, 隱藏, 顯示, 太大, 太小, 太寬, 太窄, 不對齊, 對齊, 微調, 調整一下, 改一下, 加上, 拿掉, 加入, 新增元件, 插入, 替換, 加一個, 把...加上
Keywords for component: 元件, card, modal, 彈窗, 表單, form, widget, badge, tag, chip, dropdown, picker, 對話框
Keywords for full-page: 整頁, 完整設計, 重新設計, landing page, 獨立頁面, standalone, 產生, 生成, 設計, 做出, 幫我做, 請做, 開始產生, 生成UI, 做UI, 做個, prototype, 原型, 頁面, 介面, 重做, 版面, 排版, 請重新, 依照規格書
Keywords for in-shell: 子頁, 明細, 詳情, 詳細頁, 新增頁, 功能頁, list頁, detail頁, 列表, 管理頁

IMPORTANT:
- Short tweaks like "標題變大", "顏色改紫色", "按鈕加圓角" = micro-adjust
- Short imperatives like "做", "產生", "UI", "開始", "go", "generate" = full-page (or in-shell if shell exists)
- Messages describing a UI problem wanting a fix ("空白太大", "Header太寬") = micro-adjust if it's a small fix, full-page if it's a complete redo
- Messages starting with "為什麼沒有做出" or "為何沒有" are REQUESTS TO IMPLEMENT = full-page or in-shell
- "重新設計這個元件" or "設計這個元件" = full-page (redesign intent overrides component keyword)
- When message mentions redesigning/creating + element/component together, it's full-page NOT component
- Messages with attached images/screenshots are usually full-page requests (they want to recreate what's in the image)
- Only classify as "question" if the message is clearly asking for information (contains ?, 什麼, 如何, explain, what, how) with NO fix/generate intent.

Reply ONLY with: question, component, micro-adjust, full-page, or in-shell`,
      generationConfig: { maxOutputTokens: 5, temperature: 0 },
    });

    const result = await model.generateContent(message);
    try { trackUsage(apiKey, getGeminiModel(), 'intent-classify', result.response.usageMetadata); } catch {}
    const text = result.response.text().trim().toLowerCase();

    let intent: Intent;
    if (text === 'question') intent = 'question';
    else if (text === 'component') intent = 'component';
    else if (text === 'micro-adjust') intent = 'micro-adjust';
    else if (text === 'in-shell' && hasShell) intent = 'in-shell';
    else if (text === 'full-page') intent = 'full-page';
    else intent = hasShell ? 'in-shell' : 'full-page';

    intentCache.set(cacheKey, intent);
    return intent;
  } catch {
    return hasShell ? 'in-shell' : 'full-page';
  }
}
