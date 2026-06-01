import { getProvider, defaultModel, withJsonInstruction, extractJsonBody, trackProviderUsage } from './provider';

export interface PageStructure {
  multiPage: boolean;
  pages: string[];
}

const SYSTEM_PROMPT = `You are analyzing a UI generation request to detect if it describes multiple pages/screens.

Return JSON only: {"multiPage": boolean, "pages": string[]}

Rules:
- multiPage=true if the request mentions: multiple pages, screens, views, sub-pages, navigation between sections, a system with distinct areas, OR if the attached spec/document describes a multi-page product
- Extract ALL page/screen names — both explicitly mentioned AND logically implied
- IMPORTANT: Infer pages that are NECESSARY but not explicitly stated. For example:
  - "購物網站 包含購物車、結帳" → also needs 商品列表 (how else would users add items to cart?)
  - "部落格系統" → needs 文章列表 + 文章內容 even if not stated
  - "後台管理系統" → needs 儀表板/首頁 as landing page
- Think about the user flow: what pages are needed for the system to make sense?
- If the user says "如果有子頁面" or "if there are sub-pages" and attached docs describe pages, detect them from the doc content
- Common patterns: list page + detail page, login + home + settings, tabs with distinct views
- Be generous: if in doubt and multiple distinct views are described anywhere in the message, say multiPage=true
- Always include a logical "home" or "main" page if the system has 2+ pages

Examples:
- "做一個登入頁" → {"multiPage": false, "pages": []}
- "做一個有登入、首頁、個人設定的系統" → {"multiPage": true, "pages": ["登入", "首頁", "個人設定"]}
- "購物網站 包含購物車、結帳頁面 要多頁面" → {"multiPage": true, "pages": ["商品列表", "商品詳情", "購物車", "結帳"]}
- "部落格系統 要有文章管理" → {"multiPage": true, "pages": ["文章列表", "文章詳情", "新增文章"]}
- "create a dashboard with analytics and settings" → {"multiPage": true, "pages": ["Dashboard", "Analytics", "Settings"]}`;

export async function analyzePageStructure(message: string, _apiKey?: string): Promise<PageStructure> {
  try {
    const { selection, response } = await getProvider().generateWithSelection({
      model: defaultModel(),
      systemInstruction: withJsonInstruction(SYSTEM_PROMPT),
      prompt: message.slice(0, 8000),
      maxOutputTokens: 200,
    });
    try { trackProviderUsage(selection, 'page-structure', response); } catch {}
    console.log('[pageStructure] Raw response:', response.text);
    const parsed = JSON.parse(extractJsonBody(response.text));
    return {
      multiPage: !!parsed.multiPage,
      pages: Array.isArray(parsed.pages) ? parsed.pages : [],
    };
  } catch (err: any) {
    console.error('[pageStructure] Failed:', (err?.message || '').slice(0, 100));
    return { multiPage: false, pages: [] };
  }
}
