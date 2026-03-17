import OpenAI from 'openai';

export interface PageStructure {
  multiPage: boolean;
  pages: string[];
}

export async function analyzePageStructure(message: string, apiKey: string): Promise<PageStructure> {
  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Analyze if the user's UI request describes multiple distinct pages/screens. Return JSON only: {"multiPage": boolean, "pages": string[]}. If multiPage is false, pages should be []. Extract page names from the request. Examples:
- "做一個登入頁" → {"multiPage": false, "pages": []}
- "做一個有登入、首頁、個人設定的系統" → {"multiPage": true, "pages": ["登入", "首頁", "個人設定"]}
- "create a dashboard with home, analytics, and settings pages" → {"multiPage": true, "pages": ["Home", "Analytics", "Settings"]}`,
        },
        { role: 'user', content: message },
      ],
      max_tokens: 100,
      temperature: 0,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    return {
      multiPage: !!parsed.multiPage,
      pages: Array.isArray(parsed.pages) ? parsed.pages : [],
    };
  } catch {
    return { multiPage: false, pages: [] };
  }
}
