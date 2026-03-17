import OpenAI from 'openai';

export type Intent = 'full-page' | 'in-shell' | 'component' | 'question';

export async function classifyIntent(
  message: string,
  apiKey: string,
  hasShell: boolean = false
): Promise<Intent> {
  const openai = new OpenAI({ apiKey });

  const shellContext = hasShell
    ? `This project has a platform shell (existing nav/sidebar/header). When the user asks to add a page, sub-page, detail page, list page, or feature, prefer "in-shell". Only use "full-page" if the user explicitly asks for a complete standalone page.`
    : `This project has NO platform shell, so "in-shell" is not available.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Classify the user message into one of four intents. Reply with ONLY one word.

Intents:
- "question": asking about specs, design, existing prototype, or general questions
- "component": requesting a UI component/widget in isolation (card, modal, dialog, form, table, badge, tag, chip, dropdown, picker, button group, tooltip)
- "full-page": requesting a complete standalone page with its own nav/layout, or explicit redesign
- "in-shell": requesting a new sub-page, feature page, detail page, or content area within an existing platform

${shellContext}

Keywords for component: 元件, card, modal, 彈窗, 表單, form, widget, badge, tag, chip, dropdown, picker, 對話框
Keywords for full-page: 整頁, 完整設計, 重新設計, landing page, 獨立頁面, standalone
Keywords for in-shell: 子頁, 明細, 詳情, 詳細頁, 新增頁, 功能頁, list頁, detail頁, 列表, 管理頁

Reply ONLY with: question, component, full-page, or in-shell`,
        },
        { role: 'user', content: message },
      ],
      max_tokens: 5,
      temperature: 0,
    });

    const result = response.choices[0]?.message?.content?.trim().toLowerCase();

    if (result === 'question') return 'question';
    if (result === 'component') return 'component';
    if (result === 'in-shell' && hasShell) return 'in-shell';
    if (result === 'full-page') return 'full-page';

    // Default: if shell exists → in-shell, else full-page
    return hasShell ? 'in-shell' : 'full-page';
  } catch {
    return hasShell ? 'in-shell' : 'full-page';
  }
}
