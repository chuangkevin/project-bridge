import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiModel, trackUsage } from './geminiKeys';

export type Intent = 'full-page' | 'in-shell' | 'component' | 'question';

export async function classifyIntent(
  message: string,
  apiKey: string,
  hasShell: boolean = false
): Promise<Intent> {
  const shellContext = hasShell
    ? `This project has a platform shell (existing nav/sidebar/header). When the user asks to add a page, sub-page, detail page, list page, or feature, prefer "in-shell". Only use "full-page" if the user explicitly asks for a complete standalone page.`
    : `This project has NO platform shell, so "in-shell" is not available.`;

  try {
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({
      model: getGeminiModel(),
      systemInstruction: `Classify the user message into one of four intents. Reply with ONLY one word.

Intents:
- "question": asking about specs, design, existing prototype, or general questions
- "component": requesting a UI component/widget in isolation (card, modal, dialog, form, table, badge, tag, chip, dropdown, picker, button group, tooltip)
- "full-page": requesting a complete standalone page with its own nav/layout, or explicit redesign
- "in-shell": requesting a new sub-page, feature page, detail page, or content area within an existing platform

${shellContext}

Keywords for component: 元件, card, modal, 彈窗, 表單, form, widget, badge, tag, chip, dropdown, picker, 對話框
Keywords for full-page: 整頁, 完整設計, 重新設計, landing page, 獨立頁面, standalone, 產生, 生成, 設計, 做出, 幫我做, 請做, 開始產生, 生成UI, 做UI, 做個, UI, prototype, 原型, 頁面, 介面, 修改, 修正, 調整, 空白, 太大, 太小, 不對, 缺少, 重做, 版面, 排版, 沒有依照, 請重新, 沒有正確, 沒有運作, 不能點, 連結沒, 沒有做出, 沒有生成, 為什麼沒有做, 為何沒有
Keywords for in-shell: 子頁, 明細, 詳情, 詳細頁, 新增頁, 功能頁, list頁, detail頁, 列表, 管理頁

IMPORTANT: When the message is a short imperative like "做", "產生", "UI", "開始", "go", "generate", classify as full-page (or in-shell if shell exists), NOT question.
Messages describing a UI problem or requesting a fix (e.g. "空白太大", "沒有依照規格", "Header太寬", "修改排版") should be full-page or in-shell, NOT question.
Messages starting with "為什麼沒有做出" or "為何沒有" are REQUESTS TO IMPLEMENT, not questions — classify as full-page or in-shell.
Messages like "沒有子頁面嗎", "顏色不對嗎", "為什麼是藍色" ending in 嗎/啊/呢 that describe a UI problem are FIX REQUESTS — classify as full-page or in-shell.
Only classify as "question" if the message is clearly asking for information (contains ?, 什麼, 如何, explain, what, how, 幾個, 多少) with NO fix/generate intent.

Reply ONLY with: question, component, full-page, or in-shell`,
      generationConfig: { maxOutputTokens: 5, temperature: 0 },
    });

    const result = await model.generateContent(message);
    try { trackUsage(apiKey, getGeminiModel(), 'intent-classify', result.response.usageMetadata); } catch {}
    const text = result.response.text().trim().toLowerCase();

    if (text === 'question') return 'question';
    if (text === 'component') return 'component';
    if (text === 'in-shell' && hasShell) return 'in-shell';
    if (text === 'full-page') return 'full-page';

    return hasShell ? 'in-shell' : 'full-page';
  } catch {
    return hasShell ? 'in-shell' : 'full-page';
  }
}
