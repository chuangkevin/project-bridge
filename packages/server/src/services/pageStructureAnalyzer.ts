import { GoogleGenerativeAI } from '@google/generative-ai';

export interface PageStructure {
  multiPage: boolean;
  pages: string[];
}

export async function analyzePageStructure(message: string, apiKey: string): Promise<PageStructure> {
  try {
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: `You are analyzing a UI generation request to detect if it describes multiple pages/screens.

Return JSON only: {"multiPage": boolean, "pages": string[]}

Rules:
- multiPage=true if the request mentions: multiple pages, screens, views, sub-pages, navigation between sections, a system with distinct areas, OR if the attached spec/document describes a multi-page product
- Extract ALL page/screen names mentioned explicitly or implied by the spec content
- If the user says "如果有子頁面" or "if there are sub-pages" and attached docs describe pages, detect them from the doc content
- Common patterns: list page + detail page, login + home + settings, tabs with distinct views
- Be generous: if in doubt and multiple distinct views are described anywhere in the message, say multiPage=true

Examples:
- "做一個登入頁" → {"multiPage": false, "pages": []}
- "做一個有登入、首頁、個人設定的系統" → {"multiPage": true, "pages": ["登入", "首頁", "個人設定"]}
- "請閱讀文件，生成對應 UI，如果有子頁面請生成" with doc describing 生活圈列表 and 生活圈詳情 → {"multiPage": true, "pages": ["生活圈列表", "生活圈詳情"]}
- spec mentions "列表頁" and "詳細頁" → {"multiPage": true, "pages": ["列表頁", "詳細頁"]}
- "create a dashboard with home, analytics, and settings pages" → {"multiPage": true, "pages": ["Home", "Analytics", "Settings"]}`,
      generationConfig: {
        maxOutputTokens: 200,
        temperature: 0,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(message.slice(0, 8000));
    const content = result.response.text();
    const parsed = JSON.parse(content);
    return {
      multiPage: !!parsed.multiPage,
      pages: Array.isArray(parsed.pages) ? parsed.pages : [],
    };
  } catch {
    return { multiPage: false, pages: [] };
  }
}
